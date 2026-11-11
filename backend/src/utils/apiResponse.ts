import type { Response } from 'express';

/** Chuẩn response chung của toàn bộ API */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message: string;
}

export function sendSuccess<T>(res: Response, data: T, message = 'OK', status = 200): Response {
  const body: ApiResponse<T> = { success: true, data, message };
  return res.status(status).json(body);
}

export function sendError(res: Response, message: string, status = 500, data: unknown = null): Response {
  const body: ApiResponse = { success: false, data, message };
  return res.status(status).json(body);
}
