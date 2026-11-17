import type { AxiosRequestConfig } from 'axios';
import { api } from '@/lib/axios';
import type {
  ApiResponse,
  Board,
  BoardDetails,
  Card,
  CardDetails,
  CreateBoardPayload,
  CreateCardPayload,
  CreateListPayload,
  DeleteBoardResult,
  DeleteCardResult,
  DeleteListResult,
  List,
  MoveCardPayload,
  MoveCardResult,
  MoveListPayload,
  MoveListResult,
  UpdateBoardPayload,
  UpdateCardPayload,
  UpdateListPayload,
} from '@/types';

/**
 * Lớp gọi REST API.
 * - Mọi hàm trả về nguyên envelope `ApiResponse<T>` = { success: true, data, message }.
 * - Lỗi luôn được ném ra dưới dạng `ApiError` (xem lib/axios.ts) -> caller try/catch để rollback Optimistic UI.
 * - `options.signal` cho phép huỷ request (vd: rời trang trước khi tải xong board).
 */

type RequestOptions = Pick<AxiosRequestConfig, 'signal'>;

const enc = encodeURIComponent;

async function get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
  const res = await api.get<ApiResponse<T>>(url, config);
  return res.data;
}

async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
  const res = await api.post<ApiResponse<T>>(url, body, config);
  return res.data;
}

async function patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
  const res = await api.patch<ApiResponse<T>>(url, body, config);
  return res.data;
}

async function del<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
  const res = await api.delete<ApiResponse<T>>(url, config);
  return res.data;
}

// ============================================================
// Board
// ============================================================

/** GET /boards?archived=  — mặc định lấy board đang hoạt động, sắp theo updatedAt giảm dần */
export function getBoards(
  params: { archived?: boolean } = {},
  options?: RequestOptions,
): Promise<ApiResponse<Board[]>> {
  return get<Board[]>('/boards', {
    ...options,
    params: params.archived === undefined ? undefined : { archived: String(params.archived) },
  });
}

/** GET /boards/:id — board kèm lists -> cards -> tags (đã sắp theo position, bỏ mục đã lưu trữ) */
export function getBoardDetails(
  boardId: string,
  options?: RequestOptions,
): Promise<ApiResponse<BoardDetails>> {
  return get<BoardDetails>(`/boards/${enc(boardId)}`, options);
}

/** POST /boards */
export function createBoard(payload: CreateBoardPayload): Promise<ApiResponse<Board>> {
  return post<Board>('/boards', payload);
}

/** PATCH /boards/:id */
export function updateBoard(
  boardId: string,
  payload: UpdateBoardPayload,
): Promise<ApiResponse<Board>> {
  return patch<Board>(`/boards/${enc(boardId)}`, payload);
}

/** DELETE /boards/:id — xoá cứng, cascade toàn bộ dữ liệu */
export function deleteBoard(boardId: string): Promise<ApiResponse<DeleteBoardResult>> {
  return del<DeleteBoardResult>(`/boards/${enc(boardId)}`);
}

// ============================================================
// List
// ============================================================

/** POST /boards/:boardId/lists — server tự đặt list vào cuối board */
export function createList(
  boardId: string,
  payload: CreateListPayload,
): Promise<ApiResponse<List>> {
  return post<List>(`/boards/${enc(boardId)}/lists`, payload);
}

/** PATCH /lists/:id — chỉ title / isArchived (không gửi position, boardId) */
export function updateList(listId: string, payload: UpdateListPayload): Promise<ApiResponse<List>> {
  return patch<List>(`/lists/${enc(listId)}`, payload);
}

/**
 * PATCH /lists/:id/move
 * 409 -> vị trí thả không còn hợp lệ, nên rollback và tải lại board.
 * `rebalanced = true` -> áp `positions` cho toàn bộ list trong board.
 */
export function moveList(listId: string, payload: MoveListPayload): Promise<ApiResponse<MoveListResult>> {
  return patch<MoveListResult>(`/lists/${enc(listId)}/move`, payload);
}

/** DELETE /lists/:id — xoá cứng kèm toàn bộ card bên trong */
export function deleteList(listId: string): Promise<ApiResponse<DeleteListResult>> {
  return del<DeleteListResult>(`/lists/${enc(listId)}`);
}

// ============================================================
// Card
// ============================================================

/** POST /lists/:listId/cards — server tự đặt card vào cuối list */
export function createCard(listId: string, payload: CreateCardPayload): Promise<ApiResponse<Card>> {
  return post<Card>(`/lists/${enc(listId)}/cards`, payload);
}

/** GET /cards/:id — card kèm list cha, tags và 20 activity gần nhất */
export function getCardDetails(
  cardId: string,
  options?: RequestOptions,
): Promise<ApiResponse<CardDetails>> {
  return get<CardDetails>(`/cards/${enc(cardId)}`, options);
}

/** PATCH /cards/:id — không gửi listId / position (dùng moveCard) */
export function updateCard(cardId: string, payload: UpdateCardPayload): Promise<ApiResponse<Card>> {
  return patch<Card>(`/cards/${enc(cardId)}`, payload);
}

/**
 * PATCH /cards/:id/move — di chuyển trong cùng list hoặc sang list khác (cùng board).
 * 409 -> card / vị trí đã bị thay đổi bởi thao tác khác, nên rollback và tải lại board.
 * `rebalanced = true` -> áp `positions` cho toàn bộ card trong list đích.
 */
export function moveCard(cardId: string, payload: MoveCardPayload): Promise<ApiResponse<MoveCardResult>> {
  return patch<MoveCardResult>(`/cards/${enc(cardId)}/move`, payload);
}

/** DELETE /cards/:id */
export function deleteCard(cardId: string): Promise<ApiResponse<DeleteCardResult>> {
  return del<DeleteCardResult>(`/cards/${enc(cardId)}`);
}

// ============================================================
// Health
// ============================================================

/** GET /health — kiểm tra kết nối tới Backend */
export function checkHealth(): Promise<ApiResponse<{ status: string }>> {
  return get<{ status: string }>('/health');
}
