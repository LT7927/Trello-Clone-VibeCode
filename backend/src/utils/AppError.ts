/**
 * Lỗi nghiệp vụ có chủ đích. errorHandler sẽ chuyển thành response
 * { success: false, data: details, message } với đúng HTTP status.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly details: unknown;

  constructor(statusCode: number, message: string, details: unknown = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message: string, details: unknown = null): AppError {
    return new AppError(400, message, details);
  }

  static notFound(message: string): AppError {
    return new AppError(404, message);
  }

  static conflict(message: string, details: unknown = null): AppError {
    return new AppError(409, message, details);
  }
}
