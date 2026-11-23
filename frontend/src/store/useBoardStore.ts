import { create } from 'zustand';
import { isApiError } from '@/lib/axios';
import { TAG_NAME_MAX, findTagByName, isHexColor, normalizeHexColor, sortTags } from '@/lib/tags';
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
  Tag,
  UpdateBoardPayload,
  UpdateCardPayload,
  UpdateTagPayload,
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

function findCardIn(lists: ListWithCards[], cardId: string): CardWithTags | null {
  for (const list of lists) {
    const card = list.cards.find((c) => c.id === cardId);
    if (card) return card;
  }
  return null;
}

export function findCard(board: BoardDetails | null, cardId: string): CardWithTags | null {
  return board ? findCardIn(board.lists, cardId) : null;
}

/** Sửa field của 1 card. Không tìm thấy card -> trả lại nguyên mảng (giữ tham chiếu). */
function patchCardIn(lists: ListWithCards[], cardId: string, fields: CardChanges): ListWithCards[] {
  if (!lists.some((l) => l.cards.some((c) => c.id === cardId))) return lists;
  return lists.map((l) =>
    l.cards.some((c) => c.id === cardId)
      ? { ...l, cards: l.cards.map((c) => (c.id === cardId ? { ...c, ...fields } : c)) }
      : l,
  );
}

function removeCardIn(lists: ListWithCards[], cardId: string): ListWithCards[] {
  if (!lists.some((l) => l.cards.some((c) => c.id === cardId))) return lists;
  return lists.map((l) =>
    l.cards.some((c) => c.id === cardId) ? { ...l, cards: l.cards.filter((c) => c.id !== cardId) } : l,
  );
}

/** Đưa card về list của nó, sắp theo position -> đúng vị trí cũ. List không còn / card đã có -> bỏ qua. */
function insertCardIn(lists: ListWithCards[], card: CardWithTags): ListWithCards[] {
  const target = lists.find((l) => l.id === card.listId);
  if (!target || findCardIn(lists, card.id)) return lists;
  return lists.map((l) => (l === target ? { ...l, cards: [...l.cards, card].sort(byPosition) } : l));
}

/** Các field client được phép sửa qua updateCard (không đổi vị trí — dùng move) */
export type CardChanges = Partial<Omit<CardWithTags, 'id' | 'listId' | 'position'>>;

/** Bỏ listId / position khỏi dữ liệu server để không giật card đang có lượt kéo thả chờ xác nhận */
function toCardChanges(card: Card | CardWithTags): CardChanges {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, listId, position, ...rest } = card;
  return rest;
}

/** Thêm / ghi đè 1 tag (theo id) rồi sắp theo tên */
function withTag(tags: Tag[], tag: Tag): Tag[] {
  return sortTags([...tags.filter((t) => t.id !== tag.id), tag]);
}

function hasTag(card: CardWithTags | null | undefined, tagId: string): boolean {
  return card?.tags.some((t) => t.id === tagId) ?? false;
}

/**
 * Cập nhật `tags` của nhiều card cùng lúc. `update` trả về null = card không đổi.
 * Không có card nào đổi -> trả lại nguyên mảng (giữ tham chiếu).
 */
function mapCardTagsIn(
  lists: ListWithCards[],
  update: (card: CardWithTags) => Tag[] | null,
): ListWithCards[] {
  let changed = false;
  const next = lists.map((l) => {
    let listChanged = false;
    const cards = l.cards.map((c) => {
      const tags = update(c);
      if (!tags) return c;
      listChanged = true;
      return { ...c, tags };
    });
    if (!listChanged) return l;
    changed = true;
    return { ...l, cards };
  });
  return changed ? next : lists;
}

/** Field của tag sửa được (đồng bộ sang mọi card đang gắn tag đó) */
type TagFields = Partial<Pick<Tag, 'name' | 'color' | 'createdAt' | 'updatedAt'>>;

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
  /**
   * Sửa field ngay trên UI; lỗi -> trả lại giá trị cũ (chỉ những field chưa bị sửa tiếp).
   * `isArchived: true` -> gỡ card khỏi board ngay; lỗi -> đưa card về đúng vị trí cũ.
   */
  editCard: (cardId: string, payload: UpdateCardPayload) => Promise<boolean>;
  /** Xoá card khỏi board ngay; lỗi -> đưa card về đúng vị trí cũ */
  deleteCard: (cardId: string) => Promise<boolean>;

  // ---------- Board ----------
  /**
   * Sửa title / description / background ngay trên UI; lỗi -> trả lại giá trị cũ
   * (chỉ những field chưa bị sửa tiếp). Title rỗng -> false, không gọi API.
   */
  updateBoard: (payload: BoardChanges) => Promise<boolean>;
  /** Lưu trữ board hiện tại. KHÔNG optimistic: true -> UI chuyển về trang chủ; lỗi -> actionError */
  archiveBoard: () => Promise<boolean>;
  /** Xoá vĩnh viễn board hiện tại. true -> UI chuyển về trang chủ; lỗi -> actionError */
  deleteBoard: () => Promise<boolean>;

  // ---------- Tag (Optimistic UI + rollback; lỗi -> actionError) ----------
  /**
   * Thêm tag vào board.tags ngay (UUID sinh ở client); lỗi -> gỡ khỏi board và mọi card.
   * Tên rỗng / quá dài / trùng, màu không hợp lệ -> false, không gọi API.
   */
  createTag: (name: string, color: string) => Promise<boolean>;
  /** Đổi tên / màu trong board.tags VÀ mọi card đang gắn tag; lỗi -> trả lại giá trị cũ */
  updateTag: (tagId: string, payload: UpdateTagPayload) => Promise<boolean>;
  /** Gỡ tag khỏi board.tags VÀ mọi card; lỗi -> khôi phục tag và gắn lại vào đúng các card cũ */
  deleteTag: (tagId: string) => Promise<boolean>;
  /** Card đã có tag -> gỡ, chưa có -> gắn. Cập nhật card.tags ngay; lỗi -> trả lại trạng thái cũ */
  toggleCardTag: (cardId: string, tagId: string) => Promise<boolean>;
}

/** Các field nội dung của board sửa được trên trang board (lưu trữ dùng archiveBoard) */
export type BoardChanges = Pick<UpdateBoardPayload, 'title' | 'description' | 'background'>;

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

/**
 * Tag vừa tạo (optimistic) mà server chưa xác nhận: id -> promise kết quả tạo.
 * Sửa / xoá / gắn tag này phải chờ tạo xong, nếu không server trả 404.
 */
const tagCreations = new Map<string, Promise<boolean>>();

/**
 * Hàng đợi gắn / gỡ theo cặp `cardId:tagId` -> bấm liên tục vẫn gửi đúng thứ tự,
 * trạng thái cuối trên server khớp với UI.
 */
const tagToggleQueue = new Map<string, Promise<boolean>>();

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

  /** Sửa field của card trên board VÀ trong moveSnapshot -> rollback kéo thả không làm mất thay đổi */
  const patchCard = (cardId: string, fields: CardChanges) =>
    set((state) => ({
      board: state.board
        ? { ...state.board, lists: patchCardIn(state.board.lists, cardId, fields) }
        : state.board,
      moveSnapshot: state.moveSnapshot ? patchCardIn(state.moveSnapshot, cardId, fields) : state.moveSnapshot,
    }));

  /** Luồng chung cho archive / delete card: gỡ card ngay (cả khỏi snapshot), API lỗi thì đưa lại */
  const removeCardOptimistic = async (cardId: string, request: () => Promise<unknown>) => {
    const { board, moveSnapshot } = get();
    const removed = findCard(board, cardId);
    if (!board || !removed) return false;
    // Bản trong snapshot có thể ở list / position khác (card vừa được kéo, server chưa xác nhận)
    const snapshotCard = moveSnapshot ? findCardIn(moveSnapshot, cardId) : null;

    set((state) => ({
      board: state.board ? { ...state.board, lists: removeCardIn(state.board.lists, cardId) } : state.board,
      // Gỡ cả khỏi snapshot -> rollback kéo thả sau đó không làm card "sống lại"
      moveSnapshot: state.moveSnapshot ? removeCardIn(state.moveSnapshot, cardId) : state.moveSnapshot,
    }));

    try {
      await request();
      return true;
    } catch (error) {
      // 404: card đã không còn trên server -> kết quả cuối cùng vẫn đúng, không khôi phục
      if (isApiError(error) && error.isNotFound) return true;

      set((state) => {
        if (state.board?.id !== board.id) return {}; // Đã chuyển sang board khác
        return {
          board: { ...state.board, lists: insertCardIn(state.board.lists, removed) },
          // Vẫn còn lượt kéo chờ -> đưa card vào snapshot để rollback sau đó không làm mất card
          moveSnapshot: state.moveSnapshot
            ? insertCardIn(state.moveSnapshot, snapshotCard ?? removed)
            : state.moveSnapshot,
        };
      });
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

  // ---------- Helper cho Tag (đều bỏ qua nếu đã chuyển sang board khác) ----------

  const setBoardTags = (boardId: string, updater: (tags: Tag[]) => Tag[]) =>
    set((state) =>
      state.board?.id === boardId ? { board: { ...state.board, tags: updater(state.board.tags) } } : {},
    );

  /** Cập nhật tags của card trên board VÀ trong moveSnapshot -> rollback kéo thả không làm mất thay đổi */
  const setCardTags = (boardId: string, update: (card: CardWithTags) => Tag[] | null) =>
    set((state) => {
      if (state.board?.id !== boardId) return {};
      const lists = mapCardTagsIn(state.board.lists, update);
      const snapshot = state.moveSnapshot ? mapCardTagsIn(state.moveSnapshot, update) : state.moveSnapshot;
      if (lists === state.board.lists && snapshot === state.moveSnapshot) return {};
      return { board: { ...state.board, lists }, moveSnapshot: snapshot };
    });

  /** Sửa field của 1 tag ở board.tags và ở mọi card đang gắn tag đó */
  const patchTag = (boardId: string, tagId: string, fields: TagFields) => {
    const patch = (tags: Tag[]) => {
      if (!tags.some((t) => t.id === tagId)) return null;
      const next = tags.map((t) => (t.id === tagId ? { ...t, ...fields } : t));
      return fields.name !== undefined ? sortTags(next) : next;
    };
    setBoardTags(boardId, (tags) => patch(tags) ?? tags);
    setCardTags(boardId, (card) => patch(card.tags));
  };

  /** Gỡ 1 tag khỏi board.tags và mọi card */
  const removeTagEverywhere = (boardId: string, tagId: string) => {
    setBoardTags(boardId, (tags) => tags.filter((t) => t.id !== tagId));
    setCardTags(boardId, (card) => (hasTag(card, tagId) ? card.tags.filter((t) => t.id !== tagId) : null));
  };

  /** Tag đang được tạo -> chờ server xác nhận. false = tạo thất bại (tag đã bị gỡ khỏi UI). */
  const waitForTagCreation = async (tagId: string): Promise<boolean> => {
    const creating = tagCreations.get(tagId);
    return creating ? creating : true;
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
      if (payload.isArchived) {
        return removeCardOptimistic(cardId, () => boardApi.updateCard(cardId, payload));
      }

      const previous = findCard(get().board, cardId);
      if (!previous) return false;

      const keys = (Object.keys(payload) as (keyof UpdateCardPayload)[]).filter(
        (key) => payload[key] !== undefined,
      );
      if (keys.length === 0) return true;

      patchCard(cardId, payload);

      /**
       * Ghi `source[key]` vào những field VẪN đang giữ giá trị optimistic của lần sửa này.
       * Field đã bị user sửa tiếp trong lúc chờ (vd: bấm toggle 2 lần liền) -> giữ giá trị mới nhất.
       */
      const settle = (source: CardWithTags | Card, extra: CardChanges = {}) => {
        const current = findCard(get().board, cardId);
        if (!current) return;
        const fields: Record<string, unknown> = { ...extra };
        for (const key of keys) {
          if (current[key] === payload[key]) fields[key] = source[key];
        }
        patchCard(cardId, fields as CardChanges);
      };

      try {
        const { data } = await boardApi.updateCard(cardId, payload);
        // Chỉ chốt các field đã gửi (không lấy listId / position để không giật card đang kéo thả)
        settle(data, { updatedAt: data.updatedAt });
        return true;
      } catch (error) {
        settle(previous);
        set({ actionError: getErrorMessage(error) });
        return false;
      }
    },

    deleteCard: (cardId) => removeCardOptimistic(cardId, () => boardApi.deleteCard(cardId)),

    // ============================================================
    // Board
    // ============================================================

    updateBoard: async (payload) => {
      const board = get().board;
      if (!board) return false;

      // Chuẩn hoá giống Backend (trim, chuỗi rỗng -> null) để so sánh "có đổi không" chính xác
      const changes: Record<string, string | null> = {};
      if (payload.title !== undefined) {
        const title = payload.title.trim();
        if (!title) return false;
        if (title !== board.title) changes.title = title;
      }
      for (const key of ['description', 'background'] as const) {
        if (payload[key] === undefined) continue;
        const value = payload[key]?.trim() || null;
        if (value !== board[key]) changes[key] = value;
      }
      const keys = Object.keys(changes) as (keyof BoardChanges)[];
      if (keys.length === 0) return true; // Không có gì thay đổi -> không gọi API

      const boardId = board.id;
      const patchBoard = (fields: Partial<BoardDetails>) =>
        set((state) => (state.board?.id === boardId ? { board: { ...state.board, ...fields } } : {}));

      /** Ghi `source[key]` vào những field VẪN giữ giá trị optimistic của lần sửa này */
      const settle = (source: Pick<BoardDetails, keyof BoardChanges>, extra: Partial<BoardDetails> = {}) => {
        const current = get().board;
        if (current?.id !== boardId) return; // Đã rời board
        const fields: Partial<BoardDetails> = { ...extra };
        for (const key of keys) {
          if (current[key] === changes[key]) fields[key] = source[key] as never;
        }
        patchBoard(fields);
      };

      const previous = { title: board.title, description: board.description, background: board.background };
      patchBoard(changes);

      try {
        const { data } = await boardApi.updateBoard(boardId, changes);
        settle(data, { updatedAt: data.updatedAt });
        return true;
      } catch (error) {
        settle(previous);
        if (get().board?.id === boardId) set({ actionError: getErrorMessage(error) });
        return false;
      }
    },

    archiveBoard: async () => {
      const board = get().board;
      if (!board) return false;
      try {
        const { data } = await boardApi.updateBoard(board.id, { isArchived: true });
        set((state) =>
          state.board?.id === board.id
            ? { board: { ...state.board, isArchived: data.isArchived, updatedAt: data.updatedAt } }
            : {},
        );
        return true;
      } catch (error) {
        if (get().board?.id === board.id) set({ actionError: getErrorMessage(error) });
        return false;
      }
    },

    deleteBoard: async () => {
      const board = get().board;
      if (!board) return false;
      try {
        await boardApi.deleteBoard(board.id);
        return true;
      } catch (error) {
        // 404: board đã không còn -> kết quả cuối cùng vẫn đúng
        if (isApiError(error) && error.isNotFound) return true;
        if (get().board?.id === board.id) set({ actionError: getErrorMessage(error) });
        return false;
      }
    },

    // ============================================================
    // Tag
    // ============================================================

    createTag: async (name, color) => {
      const board = get().board;
      if (!board) return false;

      const value = name.trim();
      const hex = normalizeHexColor(color);
      if (!value || value.length > TAG_NAME_MAX || !isHexColor(hex)) return false;
      const duplicate = findTagByName(board.tags, value);
      if (duplicate) {
        set({ actionError: `Nhãn "${duplicate.name}" đã tồn tại trong board` });
        return false;
      }

      const boardId = board.id;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      setBoardTags(boardId, (tags) =>
        withTag(tags, { id, boardId, name: value, color: hex, createdAt: now, updatedAt: now }),
      );

      const request = (async () => {
        try {
          const { data } = await boardApi.createTag(boardId, { id, name: value, color: hex });
          // Server chuẩn hoá name / color giống client -> chỉ chốt mốc thời gian,
          // giữ nguyên tên / màu phòng khi user đã sửa tiếp trong lúc chờ
          patchTag(boardId, id, { createdAt: data.createdAt, updatedAt: data.updatedAt });
          return true;
        } catch (error) {
          // Gỡ cả khỏi card đã kịp gắn tag này trong lúc chờ
          removeTagEverywhere(boardId, id);
          if (get().board?.id === boardId) set({ actionError: getErrorMessage(error) });
          return false;
        } finally {
          tagCreations.delete(id);
        }
      })();
      tagCreations.set(id, request);
      return request;
    },

    updateTag: async (tagId, payload) => {
      const board = get().board;
      const tag = board?.tags.find((t) => t.id === tagId);
      if (!board || !tag) return false;

      const changes: { name?: string; color?: string } = {};
      if (payload.name !== undefined) {
        const value = payload.name.trim();
        if (!value || value.length > TAG_NAME_MAX) return false;
        if (value !== tag.name) changes.name = value;
      }
      if (payload.color !== undefined) {
        const hex = normalizeHexColor(payload.color);
        if (!isHexColor(hex)) return false;
        if (hex !== tag.color) changes.color = hex;
      }
      const keys = Object.keys(changes) as (keyof typeof changes)[];
      if (keys.length === 0) return true; // Không có gì thay đổi -> không gọi API

      if (changes.name !== undefined) {
        const duplicate = findTagByName(board.tags, changes.name, tagId);
        if (duplicate) {
          set({ actionError: `Nhãn "${duplicate.name}" đã tồn tại trong board` });
          return false;
        }
      }

      const boardId = board.id;
      const previous = { name: tag.name, color: tag.color };

      /** Ghi `source[key]` vào những field VẪN giữ giá trị optimistic của lần sửa này */
      const settle = (source: Pick<Tag, 'name' | 'color'>, extra: TagFields = {}) => {
        const current = get().board?.id === boardId ? get().board?.tags.find((t) => t.id === tagId) : null;
        if (!current) return; // Đã rời board / tag đã bị xoá
        const fields: TagFields = { ...extra };
        for (const key of keys) {
          if (current[key] === changes[key]) fields[key] = source[key];
        }
        patchTag(boardId, tagId, fields);
      };

      patchTag(boardId, tagId, changes);

      try {
        if (!(await waitForTagCreation(tagId))) return false;
        const { data } = await boardApi.updateTag(tagId, changes);
        settle(data, { updatedAt: data.updatedAt });
        return true;
      } catch (error) {
        settle(previous);
        if (get().board?.id === boardId) set({ actionError: getErrorMessage(error) });
        return false;
      }
    },

    deleteTag: async (tagId) => {
      const { board, moveSnapshot } = get();
      const tag = board?.tags.find((t) => t.id === tagId);
      if (!board || !tag) return false;

      const boardId = board.id;
      // Nhớ các card đang gắn tag (cả trong snapshot kéo thả) để gắn lại nếu lỗi
      const cardIds = new Set<string>();
      for (const lists of [board.lists, moveSnapshot ?? []]) {
        for (const l of lists) for (const c of l.cards) if (hasTag(c, tagId)) cardIds.add(c.id);
      }

      removeTagEverywhere(boardId, tagId);

      try {
        // Tạo thất bại -> tag vốn không tồn tại trên server, kết quả cuối cùng vẫn đúng
        if (!(await waitForTagCreation(tagId))) return true;
        await boardApi.deleteTag(tagId);
        return true;
      } catch (error) {
        // 404: tag đã không còn trên server -> không khôi phục
        if (isApiError(error) && error.isNotFound) return true;
        if (get().board?.id !== boardId) return false;

        setBoardTags(boardId, (tags) => (tags.some((t) => t.id === tagId) ? tags : withTag(tags, tag)));
        setCardTags(boardId, (card) =>
          cardIds.has(card.id) && !hasTag(card, tagId) ? withTag(card.tags, tag) : null,
        );
        set({ actionError: getErrorMessage(error) });
        return false;
      }
    },

    toggleCardTag: async (cardId, tagId) => {
      const board = get().board;
      const card = findCard(board, cardId);
      if (!board || !card) return false;

      const attach = !hasTag(card, tagId);
      if (attach && !board.tags.some((t) => t.id === tagId)) return false; // Tag không thuộc board

      const boardId = board.id;
      /** Đặt trạng thái gắn / gỡ cho card. Gắn lại tag đã bị xoá khỏi board -> bỏ qua. */
      const apply = (attached: boolean) =>
        setCardTags(boardId, (c) => {
          if (c.id !== cardId || hasTag(c, tagId) === attached) return null;
          if (!attached) return c.tags.filter((t) => t.id !== tagId);
          const latest = get().board?.tags.find((t) => t.id === tagId);
          return latest ? withTag(c.tags, latest) : null;
        });

      apply(attach);

      const key = `${cardId}:${tagId}`;
      const previousRequest = tagToggleQueue.get(key) ?? Promise.resolve(true);
      const request = previousRequest.then(async () => {
        try {
          // Tạo tag thất bại -> store đã gỡ tag khỏi mọi card, không cần gọi API
          if (!(await waitForTagCreation(tagId))) return false;
          if (attach) await boardApi.addTagToCard(cardId, { tagId });
          else await boardApi.removeTagFromCard(cardId, tagId);
          return true;
        } catch (error) {
          // Gỡ mà server báo 404 (card / tag đã bị xoá) -> kết quả cuối cùng vẫn đúng
          if (!attach && isApiError(error) && error.isNotFound) return true;
          if (get().board?.id !== boardId) return false;
          // Chỉ trả lại nếu card vẫn giữ trạng thái của lần bấm này (chưa bị bấm tiếp)
          if (hasTag(findCard(get().board, cardId), tagId) === attach) apply(!attach);
          set({ actionError: getErrorMessage(error) });
          return false;
        }
      });

      tagToggleQueue.set(key, request);
      void request.finally(() => {
        if (tagToggleQueue.get(key) === request) tagToggleQueue.delete(key);
      });
      return request;
    },
  };
});
