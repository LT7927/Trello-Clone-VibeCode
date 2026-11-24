import { AppError } from './AppError';
import { CARD_PRIORITIES, type CardPriority } from '../constants/cardPriority';

/**
 * Bộ kiểm tra input tối giản (chưa dùng thư viện).
 * Mọi hàm ném AppError 400 kèm data = { field } khi dữ liệu sai.
 * Quy ước trả về: undefined = client không gửi field (không cập nhật).
 */

export type Body = Record<string, unknown>;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function fail(field: string, message: string): never {
  throw AppError.badRequest(message, { field });
}

/** Express 5 để req.body = undefined khi không có body -> coi như {} */
export function ensureBody(body: unknown): Body {
  if (body === undefined || body === null) return {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.badRequest('Body phải là một JSON object');
  }
  return body as Body;
}

export function requiredString(body: Body, field: string, maxLength: number): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') {
    fail(field, `Trường "${field}" là bắt buộc và phải là chuỗi không rỗng`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    fail(field, `Trường "${field}" tối đa ${maxLength} ký tự`);
  }
  return trimmed;
}

/**
 * - nullable = false: nếu gửi lên thì phải là chuỗi không rỗng (vd: title khi PATCH)
 * - nullable = true : chấp nhận null; chuỗi rỗng được chuyển thành null (vd: description)
 */
export function optionalString(
  body: Body,
  field: string,
  maxLength: number,
  { nullable = false }: { nullable?: boolean } = {},
): string | null | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (value === null) {
    if (nullable) return null;
    fail(field, `Trường "${field}" không được null`);
  }
  if (typeof value !== 'string') fail(field, `Trường "${field}" phải là chuỗi`);

  const trimmed = value.trim();
  if (trimmed === '') {
    if (nullable) return null;
    fail(field, `Trường "${field}" không được để trống`);
  }
  if (trimmed.length > maxLength) fail(field, `Trường "${field}" tối đa ${maxLength} ký tự`);
  return trimmed;
}

/** Ném 400 nếu body chứa bất kỳ trường bị cấm nào (vd: position, listId khi PATCH) */
export function rejectFields(
  body: Body,
  forbidden: readonly string[],
  allowedFields: readonly string[],
): void {
  for (const field of forbidden) {
    if (field in body) {
      throw AppError.badRequest(`Không được phép cập nhật trường "${field}" qua API này`, {
        field,
        allowedFields,
      });
    }
  }
}

export function optionalBoolean(body: Body, field: string): boolean | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') fail(field, `Trường "${field}" phải là boolean`);
  return value;
}

export function requiredUuid(body: Body, field: string): string {
  const value = body[field];
  if (!isUuid(value)) fail(field, `Trường "${field}" là bắt buộc và phải là UUID hợp lệ`);
  return value;
}

/** Dùng cho id do Frontend tự sinh khi tạo mới (Optimistic UI) */
export function optionalUuid(body: Body, field: string): string | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (!isUuid(value)) fail(field, `Trường "${field}" phải là UUID hợp lệ`);
  return value;
}

/** Dùng cho prevId / nextId khi kéo thả: UUID hoặc null (không gửi = null) */
export function nullableUuid(body: Body, field: string): string | null {
  const value = body[field];
  if (value === undefined || value === null) return null;
  if (!isUuid(value)) fail(field, `Trường "${field}" phải là UUID hợp lệ hoặc null`);
  return value;
}

const HEX_COLOR_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Mã màu hex #RGB hoặc #RRGGBB, chuẩn hoá về chữ in hoa (vd: #61BD4F) */
export function requiredHexColor(body: Body, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || !HEX_COLOR_REGEX.test(value.trim())) {
    fail(field, `Trường "${field}" là bắt buộc và phải là mã màu hex dạng #RGB hoặc #RRGGBB`);
  }
  return value.trim().toUpperCase();
}

export function optionalHexColor(body: Body, field: string): string | undefined {
  if (body[field] === undefined) return undefined;
  return requiredHexColor(body, field);
}

/** Giá trị phải thuộc danh sách cho phép (không nhận null) */
export function optionalEnum<T extends string>(
  body: Body,
  field: string,
  allowed: readonly T[],
): T | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw AppError.badRequest(`Trường "${field}" phải là một trong: ${allowed.join(', ')}`, {
      field,
      allowedValues: allowed,
    });
  }
  return value as T;
}

/** Mức độ ưu tiên của card: 'low' | 'medium' | 'high' */
export function optionalPriority(body: Body, field = 'priority'): CardPriority | undefined {
  return optionalEnum(body, field, CARD_PRIORITIES);
}

/** Nhận chuỗi ISO 8601; null để xoá giá trị */
export function optionalDate(body: Body, field: string): Date | null | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') fail(field, `Trường "${field}" phải là chuỗi ngày ISO 8601 hoặc null`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(field, `Trường "${field}" không phải ngày hợp lệ`);
  return date;
}
