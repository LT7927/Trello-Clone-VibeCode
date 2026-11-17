import axios, { AxiosError, type AxiosResponse } from 'axios';
import type { ApiResponse } from '@/types';

/** Có thể ghi đè qua biến môi trường NEXT_PUBLIC_API_URL (file .env.local) */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

/**
 * Lỗi đã được chuẩn hoá từ mọi nguồn (HTTP 4xx/5xx, mất mạng, timeout, response sai chuẩn).
 * Store / UI chỉ cần bắt một loại lỗi duy nhất.
 */
export class ApiError extends Error {
  /** HTTP status; 0 = không nhận được response (mất mạng, server tắt, timeout) */
  readonly status: number;
  /** Trường `data` trong body lỗi, ví dụ { field } hoặc { errors: [...] } */
  readonly details: unknown;

  constructor(message: string, status: number, details: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  /** 409: dữ liệu trên server đã thay đổi (vd: vị trí kéo thả không còn hợp lệ) -> nên tải lại board */
  get isConflict(): boolean {
    return this.status === 409;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function isApiResponse(body: unknown): body is ApiResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as ApiResponse).success === 'boolean' &&
    'data' in body &&
    typeof (body as ApiResponse).message === 'string'
  );
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isCancel(error)) {
    return new ApiError('Yêu cầu đã bị huỷ', 0);
  }

  if (error instanceof AxiosError) {
    const { response } = error;
    if (response) {
      if (isApiResponse(response.data)) {
        return new ApiError(response.data.message, response.status, response.data.data);
      }
      return new ApiError(`Lỗi máy chủ (HTTP ${response.status})`, response.status);
    }
    if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
      return new ApiError('Máy chủ phản hồi quá lâu, vui lòng thử lại', 0);
    }
    return new ApiError('Không thể kết nối tới máy chủ', 0);
  }

  return new ApiError(error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định', 0);
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Đảm bảo response 2xx cũng đúng chuẩn { success, data, message }
    if (!isApiResponse(response.data)) {
      return Promise.reject(new ApiError('Response từ máy chủ không đúng định dạng', response.status));
    }
    if (!response.data.success) {
      return Promise.reject(
        new ApiError(response.data.message, response.status, response.data.data),
      );
    }
    return response;
  },
  (error: unknown) => Promise.reject(toApiError(error)),
);
