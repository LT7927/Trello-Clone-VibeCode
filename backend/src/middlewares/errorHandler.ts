import type { ErrorRequestHandler, RequestHandler } from 'express';
import {
  DatabaseError,
  ForeignKeyConstraintError,
  UniqueConstraintError,
  ValidationError,
} from 'sequelize';
import { AppError } from '../utils/AppError';
import { sendError } from '../utils/apiResponse';

/** 404 cho mọi route không khớp. Đặt sau tất cả routes. */
export const notFoundHandler: RequestHandler = (req, res) => {
  sendError(res, `Không tìm thấy route ${req.method} ${req.originalUrl}`, 404);
};

/** Error handler trung tâm: luôn trả { success: false, data, message }. Đặt cuối cùng. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode, err.details);
    return;
  }

  // Body JSON sai cú pháp (từ express.json)
  if (isBodyParserError(err)) {
    sendError(res, 'Body JSON không hợp lệ', 400);
    return;
  }

  // Phải kiểm tra UniqueConstraintError TRƯỚC ValidationError (nó là lớp con)
  if (err instanceof UniqueConstraintError) {
    sendError(res, 'Dữ liệu bị trùng lặp', 409, {
      fields: err.errors.map((e) => e.path),
    });
    return;
  }

  if (err instanceof ValidationError) {
    sendError(res, 'Dữ liệu không hợp lệ', 400, {
      errors: err.errors.map((e) => ({ field: e.path, message: e.message })),
    });
    return;
  }

  if (err instanceof ForeignKeyConstraintError) {
    sendError(res, 'Dữ liệu tham chiếu không tồn tại', 400);
    return;
  }

  // Ví dụ: sai kiểu UUID lọt qua validate
  if (err instanceof DatabaseError && /invalid input syntax/i.test(err.message)) {
    sendError(res, 'Dữ liệu đầu vào sai định dạng', 400);
    return;
  }

  console.error('[UnhandledError]', err);
  const isProduction = process.env.NODE_ENV === 'production';
  const message = !isProduction && err instanceof Error ? err.message : 'Lỗi máy chủ nội bộ';
  sendError(res, message, 500);
};

function isBodyParserError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: unknown }).type === 'entity.parse.failed'
  );
}
