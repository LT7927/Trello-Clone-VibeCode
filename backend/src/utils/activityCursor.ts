import { AppError } from './AppError';
import { isUuid } from './validators';

/**
 * Cursor phân trang activity log: cặp (createdAt, id) mã hoá base64url.
 * Dùng cặp khoá thay vì chỉ timestamp để 2 log cùng thời điểm vẫn có thứ tự
 * xác định (createdAt DESC, id DESC) -> không bị sót / trùng bản ghi giữa các trang.
 */
export interface ActivityCursor {
  createdAt: Date;
  id: string;
}

export const DEFAULT_ACTIVITY_LIMIT = 20;
export const MAX_ACTIVITY_LIMIT = 50;

export function encodeActivityCursor({ createdAt, id }: ActivityCursor): string {
  return Buffer.from(JSON.stringify({ t: createdAt.toISOString(), id }), 'utf8').toString(
    'base64url',
  );
}

function invalidCursor(): never {
  throw AppError.badRequest('Query "before" không phải cursor hợp lệ', { field: 'before' });
}

/** undefined -> trang đầu tiên; cursor sai định dạng -> 400 */
export function parseActivityCursor(value: unknown): ActivityCursor | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value === '') invalidCursor();

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    invalidCursor();
  }
  if (typeof decoded !== 'object' || decoded === null) invalidCursor();

  const { t, id } = decoded as Record<string, unknown>;
  if (typeof t !== 'string' || !isUuid(id)) invalidCursor();
  const createdAt = new Date(t);
  if (Number.isNaN(createdAt.getTime())) invalidCursor();

  return { createdAt, id };
}

/** Mặc định 20; chỉ nhận số nguyên dương trong khoảng 1..50 */
export function parseActivityLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_ACTIVITY_LIMIT;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw AppError.badRequest('Query "limit" phải là số nguyên dương', { field: 'limit' });
  }
  const limit = Number(value);
  if (limit < 1 || limit > MAX_ACTIVITY_LIMIT) {
    throw AppError.badRequest(`Query "limit" phải trong khoảng 1 đến ${MAX_ACTIVITY_LIMIT}`, {
      field: 'limit',
    });
  }
  return limit;
}
