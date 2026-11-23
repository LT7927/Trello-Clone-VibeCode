/**
 * Interfaces phía Frontend, ánh xạ 1-1 với Sequelize models của Backend.
 * Lưu ý: Date được serialize thành chuỗi ISO 8601 qua JSON -> khai báo là `string`.
 */

/** Chuỗi ngày giờ ISO 8601, ví dụ "2026-11-17T08:30:00.000Z" */
export type ISODateString = string;

// ============================================================
// Chuẩn response chung của API
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message: string;
}

// ============================================================
// Entities
// ============================================================

export interface Tag {
  id: string;
  boardId: string;
  name: string;
  /** Mã màu hex, ví dụ #61BD4F */
  color: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Board {
  id: string;
  title: string;
  description: string | null;
  background: string | null;
  isArchived: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface List {
  id: string;
  boardId: string;
  title: string;
  /** Số thực, sắp xếp tăng dần. Server tự tính, client không gửi lên. */
  position: number;
  isArchived: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Card {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  /** Số thực, sắp xếp tăng dần trong list. Server tự tính, client không gửi lên. */
  position: number;
  dueDate: ISODateString | null;
  isCompleted: boolean;
  isArchived: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export const ENTITY_TYPES = ['board', 'list', 'card', 'tag'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export type ActivityAction =
  | 'BOARD_CREATED'
  | 'BOARD_UPDATED'
  | 'BOARD_ARCHIVED'
  | 'BOARD_RESTORED'
  | 'LIST_CREATED'
  | 'LIST_RENAMED'
  | 'LIST_ARCHIVED'
  | 'LIST_RESTORED'
  | 'LIST_MOVED'
  | 'LIST_DELETED'
  | 'CARD_CREATED'
  | 'CARD_UPDATED'
  | 'CARD_COMPLETED'
  | 'CARD_UNCOMPLETED'
  | 'CARD_ARCHIVED'
  | 'CARD_RESTORED'
  | 'CARD_MOVED'
  | 'CARD_DELETED'
  | 'TAG_CREATED'
  | 'TAG_UPDATED'
  | 'TAG_DELETED'
  | 'TAG_ADDED'
  | 'TAG_REMOVED'
  // Cho phép action mới từ Backend mà không vỡ type, vẫn giữ gợi ý autocomplete
  | (string & {});

export interface ActivityLog {
  id: string;
  boardId: string;
  /** null khi card đã bị xoá (log vẫn được giữ lại) */
  cardId: string | null;
  entityType: EntityType;
  entityId: string;
  action: ActivityAction;
  /** Ví dụ: { fromListId, toListId, title, oldTitle, newTitle } */
  metadata: Record<string, unknown> | null;
  createdAt: ISODateString;
}

// ============================================================
// Dữ liệu lồng nhau (include) trả về từ các API chi tiết
// ============================================================

/** Card trong GET /boards/:id (kèm tags) */
export interface CardWithTags extends Card {
  tags: Tag[];
}

/** List trong GET /boards/:id (kèm cards đã sắp theo position) */
export interface ListWithCards extends List {
  cards: CardWithTags[];
}

/** GET /boards/:id -> dữ liệu đầy đủ để render Kanban */
export interface BoardDetails extends Board {
  lists: ListWithCards[];
  /** Toàn bộ tag của board, sắp theo name */
  tags: Tag[];
}

/** GET /cards/:id -> card kèm list cha, tags và 20 activity gần nhất */
export interface CardDetails extends Card {
  list: Pick<List, 'id' | 'title' | 'boardId'>;
  tags: Tag[];
  activities: ActivityLog[];
}

// ============================================================
// Payload (request body)
// ============================================================

/** `id` tuỳ chọn: Frontend tự sinh UUID để Optimistic UI không phải đổi id sau khi server trả về */
export interface CreateBoardPayload {
  id?: string;
  title: string;
  description?: string | null;
  background?: string | null;
}

export interface UpdateBoardPayload {
  title?: string;
  description?: string | null;
  background?: string | null;
  isArchived?: boolean;
}

export interface CreateListPayload {
  id?: string;
  title: string;
}

export interface UpdateListPayload {
  title?: string;
  isArchived?: boolean;
}

/** prev / next là 2 list đang hoạt động liền kề tại vị trí thả (không tính list đang kéo). null = đầu / cuối. */
export interface MoveListPayload {
  prevListId: string | null;
  nextListId: string | null;
}

export interface CreateCardPayload {
  id?: string;
  title: string;
  description?: string | null;
  /** Chuỗi ISO 8601 */
  dueDate?: ISODateString | null;
}

export interface UpdateCardPayload {
  title?: string;
  description?: string | null;
  dueDate?: ISODateString | null;
  isCompleted?: boolean;
  isArchived?: boolean;
}

/** prev / next là 2 card đang hoạt động liền kề trong list đích (không tính card đang kéo). null = đầu / cuối. */
export interface MoveCardPayload {
  toListId: string;
  prevCardId: string | null;
  nextCardId: string | null;
}

export interface CreateTagPayload {
  id?: string;
  /** Tối đa 50 ký tự, không trùng (không phân biệt hoa thường) trong board */
  name: string;
  /** #RGB hoặc #RRGGBB — server lưu dạng in hoa */
  color: string;
}

export interface UpdateTagPayload {
  name?: string;
  color?: string;
}

export interface AddTagToCardPayload {
  tagId: string;
}

// ============================================================
// Response data đặc thù
// ============================================================

export interface PositionUpdate {
  id: string;
  position: number;
}

/**
 * Kết quả kéo thả. Khi `rebalanced = true`, server đã đánh số lại toàn bộ
 * position trong board (list) / list đích (card) -> client phải áp `positions` vào store.
 */
export interface MoveListResult {
  list: List;
  rebalanced: boolean;
  positions?: PositionUpdate[];
}

export interface MoveCardResult {
  card: Card;
  rebalanced: boolean;
  positions?: PositionUpdate[];
}

export interface DeleteBoardResult {
  id: string;
}

export interface DeleteListResult {
  id: string;
  boardId: string;
  deletedCardCount: number;
}

export interface DeleteCardResult {
  id: string;
  listId: string;
  boardId: string;
}

export interface DeleteTagResult {
  id: string;
  boardId: string;
  /** Các card đã bị gỡ tag này */
  affectedCardIds: string[];
}

/** Idempotent: `alreadyAttached = true` -> tag đã được gắn từ trước (HTTP 200 thay vì 201) */
export interface AddTagToCardResult {
  cardId: string;
  tag: Tag;
  alreadyAttached: boolean;
}

/** Idempotent: `removed = false` -> tag chưa từng được gắn vào card */
export interface RemoveTagFromCardResult {
  cardId: string;
  tagId: string;
  removed: boolean;
}

/**
 * GET /boards/:boardId/activities — 1 trang lịch sử, mới nhất trước (createdAt DESC, id DESC).
 * `nextCursor` là chuỗi mờ (opaque): truyền nguyên vào `before` để lấy trang kế tiếp; null khi hết.
 */
export interface BoardActivitiesResult {
  items: ActivityLog[];
  nextCursor: string | null;
  hasMore: boolean;
}
