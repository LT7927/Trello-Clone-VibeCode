import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError';
import { isUuid } from '../utils/validators';

/**
 * Kiểm tra các route param là UUID hợp lệ trước khi chạm DB
 * (tránh lỗi Postgres "invalid input syntax for type uuid").
 *
 * Ví dụ: router.get('/:id', validateUuidParams('id'), getBoard)
 */
export function validateUuidParams(...names: string[]): RequestHandler {
  return (req, _res, next) => {
    for (const name of names) {
      const value = req.params[name];
      if (!isUuid(value)) {
        return next(AppError.badRequest(`Tham số "${name}" phải là UUID hợp lệ`, { field: name }));
      }
    }
    next();
  };
}
