import type { Transaction } from 'sequelize';
import { ActivityLog, type EntityType } from '../models/activityLog.model';

/** Danh sách action hợp lệ. Thêm action mới tại đây để có type-safety. */
export const ACTIVITY_ACTIONS = [
  'BOARD_CREATED',
  'BOARD_UPDATED',
  'BOARD_ARCHIVED',
  'BOARD_RESTORED',
  'LIST_CREATED',
  'LIST_RENAMED',
  'LIST_ARCHIVED',
  'LIST_RESTORED',
  'LIST_DELETED',
  'LIST_MOVED',
  'CARD_CREATED',
  'CARD_UPDATED',
  'CARD_COMPLETED',
  'CARD_UNCOMPLETED',
  'CARD_ARCHIVED',
  'CARD_RESTORED',
  'CARD_DELETED',
  // Chỉ ghi khi card chuyển sang list KHÁC (kéo trong cùng list không ghi log)
  'CARD_MOVED',
  // Quản lý tag cấp board (cardId = null)
  'TAG_CREATED',
  'TAG_UPDATED',
  'TAG_DELETED',
  // Gắn / gỡ tag trên card (có cardId -> hiển thị trong Modal Chi tiết Card)
  'TAG_ADDED',
  'TAG_REMOVED',
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export interface LogActivityInput {
  boardId: string;
  entityType: EntityType;
  entityId: string;
  action: ActivityAction;
  cardId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Ghi một activity log. Nên truyền transaction của thao tác chính để
 * log và dữ liệu cùng commit / rollback (không có log "ma").
 */
export function logActivity(
  input: LogActivityInput,
  transaction?: Transaction,
): Promise<ActivityLog> {
  return ActivityLog.create(
    {
      boardId: input.boardId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      cardId: input.cardId ?? null,
      metadata: input.metadata ?? null,
    },
    { transaction },
  );
}
