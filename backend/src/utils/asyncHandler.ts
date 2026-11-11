import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Bọc controller async: mọi lỗi (throw / reject) được chuyển tới errorHandler qua next().
 *
 * Ghi chú: Express 5 đã tự bắt Promise bị reject, nhưng vẫn giữ wrapper này để
 * luồng lỗi tường minh, độc lập phiên bản Express và gom type cho controller.
 */
export function asyncHandler<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>,
>(
  fn: (
    req: Request<P, ResBody, ReqBody, ReqQuery>,
    res: Response<ResBody>,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
