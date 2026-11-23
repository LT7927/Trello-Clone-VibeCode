import { create } from 'zustand';
import { isApiError } from '@/lib/axios';
import * as boardApi from '@/services/api';
import type {
  BoardDetails,
  Card,
  CardWithTags,
  List,
  ListWithCards,
  MoveCardPayload,
  MoveListPayload,
  PositionUpdate,
  UpdateCardPayload,
} from '@/types';

/**
 * Data Layer cho màn hình Kanban của MỘT board.
 *
 * Nguyên tắc:
 * - Thứ tự hiển thị = thứ tự phần tử trong mảng `lists` / `cards`. `position` luôn được giữ
 *   tăng dần cùng thứ tự đó (tính theo đúng công thức của Backend: utils/position.ts).
 * - Mọi cập nhật đều immutable -> snapshot chỉ cần giữ tham chiếu `board.lists` cũ, không cần deep clone.
 * - Server là nguồn sự thật: sau khi API trả về, position của server ghi đè position tạm ở client.
 *
 * Luồng kéo thả (đã gói sẵn trong `moveCard` / `moveList`):
 *   optimisticMoveX() -> gọi API -> thành công: commitMove() + applyRebalance()
 *                                -> thất bại:   rollbackMove() (+ tải lại board nếu cần)
 */

// ============================================================
// Hằng số & helper thuần
// ============================================================

/** Phải khớp với POSITION_GAP của Backend */
export const POSITION_GAP = 65536;

type Positioned = { position: number };

const byPosition = (a: Positioned, b: Positioned) => a.position - b.position;

/** Position tạm cho Optimistic UI, cùng công thức với calcPosition() của Backend (không ném lỗi) */
function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return POSITION_GAP;
  if (next === null) return (prev as number) + POSITION_GAP;
  if (prev === null) return next / 2;
  return (prev + next) / 2;
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return length;
  return Math.min(Math.max(Math.trunc(index), 0), length);
}

function getErrorMessage(error: unknown): string {
  if (isApiError(error) || error instanceof Error) return error.message;
  return 'Đã xảy ra lỗi không xác định';
}

function findCard(board: BoardDetails | null, cardId: string): CardWithTags | null {
  if (!board) return null;
  for (const list of board.lists) {
    const card = list.cards.find((c) => c.id === cardId);
    if (card) return card;
  }
  return null;
}

/** Các field client được phép sửa qua updateCard (không đổi vị trí — dùng move) */
export type CardChanges = Partial<Omit<CardWithTags, 'id' | 'listId' | 'position'>>;

/** Bỏ listId / position khỏi dữ liệu server để không giật card đang có lượt kéo thả chờ xác nhận */
function toCardChanges(card: Card | CardWithTags): CardChanges {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, listId, position, ...rest } = card;
  return rest;
}

// ============================================================
// State & Actions
// ============================================================

export type BoardStatus = 'idle' | 'loading' | 'success' | 'error';

export interface MoveCardParams {
  cardId: string;
  toListId: string;
  /** Index trong list đích, tính trên mảng ĐÃ BỎ card đang kéo */
  toIndex: number;
}

export interface MoveListParams {
  listId: string;
  /** Index trong board, tính trên mảng ĐÃ BỎ list đang kéo */
  toIndex: number;
}

export interface BoardState {
  board: BoardDetails | null;
  /** Trạng thái tải board (fetchBoard không silent) */
  status: BoardStatus;
  /** Lỗi tải board -> hiển thị màn hình lỗi */
  error: string | null;
  /** Lỗi của thao tác (kéo thả, tạo, sửa) -> hiển thị toast */
  actionError: string | null;

  /** `board.lists` trước lượt kéo thả ĐẦU TIÊN chưa được server xác nhận */
  moveSnapshot: ListWithCards[] | null;
  /** Số lượt kéo thả đang chờ server phản hồi */
  pendingMoves: number;

  // ---------- Tải dữ liệu ----------
  /** `silent: true` -> tải lại ngầm, giữ nguyên UI hiện tại (dùng sau rollback) */
  fetchBoard: (boardId: string, options?: { silent?: boolean }) => Promise<void>;
  reset: () => void;
  clearActionError: () => void;

  // ---------- Reducer cục bộ (không gọi API) ----------
  /** Upsert: thêm mới hoặc ghi đè list cùng id (giữ nguyên cards đang có) */
  addList: (list: List | ListWithCards) => void;
  removeList: (listId: string) => void;
  /** Upsert: thêm mới hoặc ghi đè card cùng id (giữ tags nếu `card` không có tags) */
  addCard: (card: Card | CardWithTags) => void;
  removeCard: (cardId: string) => void;
  /** Cập nhật field của card; `isArchived: true` -> gỡ card khỏi board */
  updateCard: (cardId: string, data: CardChanges) => void;

  // ---------- Kéo thả (Optimistic UI) ----------
  /** Đổi UI ngay + lưu snapshot. Trả về payload cho API, hoặc null nếu không có gì thay đổi. */
  optimisticMoveCard: (params: MoveCardParams) => MoveCardPayload | null;
  optimisticMoveList: (params: MoveListParams) => MoveListPayload | null;
  /** Server đã xác nhận 1 lượt kéo thả */
  commitMove: () => void;
  /** Khôi phục về trước lượt kéo thả đầu tiên đang chờ */
  rollbackMove: () => void;
  /** Áp position mới từ server (list và/hoặc card, nhận diện theo id) rồi sắp xếp lại */
  applyRebalance: (positions: PositionUpdate[]) => void;

  // ---------- Thao tác đầy đủ: Optimistic + API + rollback. Trả về true nếu thành công ----------
  moveCard: (params: MoveCardParams) => Promise<boolean>;
  moveList: (params: MoveListParams) => Promise<boolean>;
  createList: (title: string) => Promise<boolean>;
  /** Đổi tên ngay trên UI; lỗi -> trả lại tên cũ. Tên rỗng / không đổi -> không gọi API. */
  renameList: (listId: string, title: string) => Promise<boolean>;
  /** Ẩn list (kèm card) khỏi board ngay; lỗi -> đưa list về đúng vị trí cũ */
  archiveList: (listId: string) => Promise<boolean>;
  /** Xoá list (kèm card) khỏi board ngay; lỗi -> đưa list về đúng vị trí cũ */
  deleteList: (listId: string) => Promise<boolean>;
  createCard: (listId: string, title: string) => Promise<boolean>;
  editCard: (cardId: string, payload: UpdateCardPayload) => Promise<boolean>;
}

const initialState = {
  board: null,
  status: 'idle' as BoardStatus,
  error: null,
  actionError: null,
  moveSnapshot: null,
  pendingMoves: 0,
} satisfies Partial<BoardState>;

/** Huỷ request fetchBoard cũ khi có request mới (đổi board, tải lại liên tục) */
let fetchController: AbortController | null = null;

export const useBoardStore = create<BoardState>()((set, get) => {
  /** Cập nhật `board.lists` nếu board đã được tải */
  const setLists = (updater: (lists: ListWithCards[]) => ListWithCards[]) =>
    set((state) => (state.board ? { board: { ...state.board, lists: updater(state.board.lists) } } : {}));

  /**
   * Sửa field của list trên board VÀ trong moveSnapshot (nếu có).
   * Nhờ vậy, nếu một lượt kéo thả đang chờ bị rollback, thay đổi này không bị mất theo.
   */
  const patchList = (listId: string, fields: Partial<Pick<List, 'title' | 'updatedAt'>>) => {
    const patch = (lists: ListWithCards[]) =>
      lists.map((l) => (l.id === listId ? { ...l, ...fields } : l));
    set((state) => ({
      board: state.board ? { ...state.board, lists: patch(state.board.lists) } : state.board,
      moveSnapshot: state.moveSnapshot ? patch(state.moveSnapshot) : state.moveSnapshot,
    }));
  };

  /** Luồng chung cho archive / delete: gỡ list ngay, API lỗi thì đưa lại */
  const removeListOptimistic = async (listId: string, request: () => Promise<unknown>) => {
    const { board } = get();
    const removed = board?.lists.find((l) => l.id === listId);
    if (!board || !removed) return false;

    get().removeList(listId);
    // Gỡ cả khỏi snapshot -> rollback kéo thả sau đó không làm list "sống lại"
    set((state) => ({
      moveSnapshot: state.moveSnapshot?.filter((l) => l.id !== listId) ?? null,
    }));

    try {
      await request();
      return true;
    } catch (error) {
      // 404: list đã không còn trên server -> kết quả cuối cùng vẫn đúng, không khôi phục
      if (isApiError(error) && error.isNotFound) return true;

      const current = get().board;
      if (current?.id === board.id && !current.lists.some((l) => l.id === listId)) {
        get().addList(removed); // addList sắp theo position -> về đúng chỗ cũ, giữ nguyên card
      }
      set({ actionError: getErrorMessage(error) });
      return false;
    }
  };

  /** Xử lý chung khi API kéo thả lỗi */
  const handleMoveError = (boardId: string, error: unknown) => {
    if (get().board?.id !== boardId) return; // Đã chuyển sang board khác

    // Còn lượt kéo khác đang chờ, hoặc server từ chối (409/404/...) -> dữ liệu có thể đã lệch, cần đồng bộ lại.
    // Mất mạng thì tải lại cũng vô ích, chỉ rollback.
    const shouldResync =
      get().pendingMoves > 1 || !(isApiError(error) && error.isNetworkError);

    get().rollbackMove();
    set({ actionError: getErrorMessage(error) });
    if (shouldResync) void get().fetchBoard(boardId, { silent: true });
  };

  return {
    ...initialState,

    // ============================================================
    // Tải dữ liệu
    // ============================================================

    fetchBoard: async (boardId, { silent = false } = {}) => {
      fetchController?.abort();
      const controller = new AbortController();
      fetchController = controller;

      if (!silent) {
        set((state) => ({
          status: 'loading',
          error: null,
          // Đổi sang board khác -> không hiển thị dữ liệu board cũ
          board: state.board?.id === boardId ? state.board : null,
        }));
      }

      try {
        const { data } = await boardApi.getBoardDetails(boardId, { signal: controller.signal });
        if (controller !== fetchController) return; // Đã có request mới hơn
        set({ board: data, status: 'success', error: null, moveSnapshot: null, pendingMoves: 0 });
      } catch (error) {
        if (controller !== fetchController || controller.signal.aborted) return;
        if (silent) set({ actionError: getErrorMessage(error) });
        else set({ status: 'error', error: getErrorMessage(error) });
      } finally {
        if (fetchController === controller) fetchController = null;
      }
    },

    reset: () => {
      fetchController?.abort();
      fetchController = null;
      set(initialState);
    },

    clearActionError: () => set({ actionError: null }),

    // ============================================================
    // Reducer cục bộ
    // ============================================================

    addList: (list) =>
      setLists((lists) => {
        const existing = lists.find((l) => l.id === list.id);
        if (existing) {
          return lists
            .map((l) => (l.id === list.id ? { ...l, ...list, cards: l.cards } : l))
            .sort(byPosition);
        }
        const cards = 'cards' in list ? list.cards : [];
        return [...lists, { ...list, cards }].sort(byPosition);
      }),

    removeList: (listId) => setLists((lists) => lists.filter((l) => l.id !== listId)),

    addCard: (card) =>
      setLists((lists) => {
        if (!lists.some((l) => l.id === card.listId)) return lists; // List không thuộc board hiện tại

        const existing = findCard(get().board, card.id);
        const merged: CardWithTags = {
          ...existing,
          ...card,
          tags: 'tags' in card ? card.tags : (existing?.tags ?? []),
        };

        return lists.map((l) => {
          const withoutCard = l.cards.some((c) => c.id === card.id)
            ? l.cards.filter((c) => c.id !== card.id)
            : l.cards;
          if (l.id === card.listId && !merged.isArchived) {
            return { ...l, cards: [...withoutCard, merged].sort(byPosition) };
          }
          return withoutCard === l.cards ? l : { ...l, cards: withoutCard };
        });
      }),

    removeCard: (cardId) =>
      setLists((lists) =>
        lists.map((l) =>
          l.cards.some((c) => c.id === cardId)
            ? { ...l, cards: l.cards.filter((c) => c.id !== cardId) }
            : l,
        ),
      ),

    updateCard: (cardId, data) =>
      setLists((lists) =>
        lists.map((l) => {
          if (!l.cards.some((c) => c.id === cardId)) return l;
          if (data.isArchived) return { ...l, cards: l.cards.filter((c) => c.id !== cardId) };
          return { ...l, cards: l.cards.map((c) => (c.id === cardId ? { ...c, ...data } : c)) };
        }),
      ),

    // ============================================================
    // Kéo thả (Optimistic UI)
    // ============================================================

    optimisticMoveCard: ({ cardId, toListId, toIndex }) => {
      const { board } = get();
      if (!board) return null;

      const sourceList = board.lists.find((l) => l.cards.some((c) => c.id === cardId));
      const targetList = board.lists.find((l) => l.id === toListId);
      if (!sourceList || !targetList) return null;

      const card = sourceList.cards.find((c) => c.id === cardId) as CardWithTags;
      const targetCards = targetList.cards.filter((c) => c.id !== cardId);
      const index = clampIndex(toIndex, targetCards.length);

      // Thả lại đúng chỗ cũ -> không làm gì, không gọi API
      if (sourceList.id === toListId && sourceList.cards.indexOf(card) === index) return null;

      const prev = targetCards[index - 1] ?? null;
      const next = targetCards[index] ?? null;
      const moved: CardWithTags = {
        ...card,
        listId: toListId,
        position: positionBetween(prev?.position ?? null, next?.position ?? null),
      };
      const newTargetCards = [...targetCards.slice(0, index), moved, ...targetCards.slice(index)];

      const lists = board.lists.map((l) => {
        if (l.id === toListId) return { ...l, cards: newTargetCards };
        if (l.id === sourceList.id) return { ...l, cards: l.cards.filter((c) => c.id !== cardId) };
        return l;
      });

      set((state) => ({
        board: { ...board, lists },
        moveSnapshot: state.moveSnapshot ?? board.lists,
        pendingMoves: state.pendingMoves + 1,
      }));

      return { toListId, prevCardId: prev?.id ?? null, nextCardId: next?.id ?? null };
    },

    optimisticMoveList: ({ listId, toIndex }) => {
      const { board } = get();
      if (!board) return null;

      const oldIndex = board.lists.findIndex((l) => l.id === listId);
      if (oldIndex === -1) return null;

      const others = board.lists.filter((l) => l.id !== listId);
      const index = clampIndex(toIndex, others.length);
      if (index === oldIndex) return null;

      const prev = others[index - 1] ?? null;
      const next = others[index] ?? null;
      const moved: ListWithCards = {
        ...board.lists[oldIndex],
        position: positionBetween(prev?.position ?? null, next?.position ?? null),
      };
      const lists = [...others.slice(0, index), moved, ...others.slice(index)];

      set((state) => ({
        board: { ...board, lists },
        moveSnapshot: state.moveSnapshot ?? board.lists,
        pendingMoves: state.pendingMoves + 1,
      }));

      return { prevListId: prev?.id ?? null, nextListId: next?.id ?? null };
    },

    commitMove: () =>
      set((state) => {
        const pendingMoves = Math.max(state.pendingMoves - 1, 0);
        return { pendingMoves, moveSnapshot: pendingMoves === 0 ? null : state.moveSnapshot };
      }),

    rollbackMove: () =>
      set((state) => {
        if (!state.board || !state.moveSnapshot) return { moveSnapshot: null, pendingMoves: 0 };
        return {
          board: { ...state.board, lists: state.moveSnapshot },
          moveSnapshot: null,
          pendingMoves: 0,
        };
      }),

    applyRebalance: (positions) => {
      if (positions.length === 0) return;
      const map = new Map(positions.map((p) => [p.id, p.position]));

      setLists((lists) => {
        let listOrderChanged = false;

        const updated = lists.map((l) => {
          const listPosition = map.get(l.id);
          const cardsAffected = l.cards.some((c) => map.has(c.id));
          if (listPosition === undefined && !cardsAffected) return l;

          if (listPosition !== undefined) listOrderChanged = true;
          const cards = cardsAffected
            ? l.cards
                .map((c) => {
                  const p = map.get(c.id);
                  return p === undefined ? c : { ...c, position: p };
                })
                .sort(byPosition)
            : l.cards;

          return { ...l, position: listPosition ?? l.position, cards };
        });

        return listOrderChanged ? updated.sort(byPosition) : updated;
      });
    },

    // ============================================================
    // Thao tác đầy đủ (Optimistic + API)
    // ============================================================

    moveCard: async (params) => {
      const boardId = get().board?.id;
      const payload = get().optimisticMoveCard(params);
      if (!boardId || !payload) return true; // Không có gì thay đổi

      try {
        const { data } = await boardApi.moveCard(params.cardId, payload);
        if (get().board?.id !== boardId) return true;

        get().commitMove();
        // Rebalance -> đánh số lại cả list đích; ngược lại chỉ cần chốt position thật của card
        get().applyRebalance(
          data.rebalanced && data.positions
            ? data.positions
            : [{ id: data.card.id, position: data.card.position }],
        );
        return true;
      } catch (error) {
        handleMoveError(boardId, error);
        return false;
      }
    },

    moveList: async (params) => {
      const boardId = get().board?.id;
      const payload = get().optimisticMoveList(params);
      if (!boardId || !payload) return true;

      try {
        const { data } = await boardApi.moveList(params.listId, payload);
        if (get().board?.id !== boardId) return true;

        get().commitMove();
        get().applyRebalance(
          data.rebalanced && data.positions
            ? data.positions
            : [{ id: data.list.id, position: data.list.position }],
        );
        return true;
      } catch (error) {
        handleMoveError(boardId, error);
        return false;
      }
    },

    createList: async (title) => {
      const { board } = get();
      if (!board) return false;

      // Client tự sinh id -> không phải đổi id sau khi server trả về
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const last = board.lists[board.lists.length - 1];
      get().addList({
        id,
        boardId: board.id,
        title,
        position: positionBetween(last?.position ?? null, null),
        isArchived: false,
        createdAt: now,
        updatedAt: now,
        cards: [],
      });

      try {
        const { data } = await boardApi.createList(board.id, { id, title });
        get().addList(data);
        return true;
      } catch (error) {
        get().removeList(id);
        set({ actionError: getErrorMessage(error) });
        return false;
      }
    },

    renameList: async (listId, title) => {
      const value = title.trim();
      const list = get().board?.lists.find((l) => l.id === listId);
      if (!list || !value) return false;
      if (value === list.title) return true;

      const previousTitle = list.title;
      const titleIs = (expected: string) =>
        get().board?.lists.find((l) => l.id === listId)?.title === expected;

      patchList(listId, { title: value });

      try {
        const { data } = await boardApi.updateList(listId, { title: value });
        // Chỉ chốt title (không lấy position từ response để không giật list đang kéo thả chờ xác nhận).
        // Nếu user đã đổi tên tiếp trong lúc chờ thì giữ tên mới nhất.
        if (titleIs(value)) patchList(listId, { title: data.title, updatedAt: data.updatedAt });
        return true;
      } catch (error) {
        if (titleIs(value)) patchList(listId, { title: previousTitle });
        set({ actionError: getErrorMessage(error) });
        return false;
      }
    },

    archiveList: (listId) =>
      removeListOptimistic(listId, () => boardApi.updateList(listId, { isArchived: true })),

    deleteList: (listId) => removeListOptimistic(listId, () => boardApi.deleteList(listId)),

    createCard: async (listId, title) => {
      const list = get().board?.lists.find((l) => l.id === listId);
      if (!list) return false;

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const last = list.cards[list.cards.length - 1];
      get().addCard({
        id,
        listId,
        title,
        description: null,
        position: positionBetween(last?.position ?? null, null),
        dueDate: null,
        isCompleted: false,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
        tags: [],
      });

      try {
        const { data } = await boardApi.createCard(listId, { id, title });
        // Card có thể đã bị kéo sang chỗ khác trong lúc chờ -> chỉ cập nhật field, giữ vị trí
        get().updateCard(id, toCardChanges(data));
        return true;
      } catch (error) {
        get().removeCard(id);
        set({ actionError: getErrorMessage(error) });
        return false;
      }
    },

    editCard: async (cardId, payload) => {
      const previous = findCard(get().board, cardId);
      if (!previous) return false;

      get().updateCard(cardId, payload);

      try {
        const { data } = await boardApi.updateCard(cardId, payload);
        get().updateCard(cardId, toCardChanges(data));
        return true;
      } catch (error) {
        // Card vẫn còn -> khôi phục field; đã bị gỡ (archive) -> thêm lại nguyên trạng
        if (findCard(get().board, cardId)) get().updateCard(cardId, toCardChanges(previous));
        else get().addCard(previous);
        set({ actionError: getErrorMessage(error) });
        return false;
      }
    },
  };
});
