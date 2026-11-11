import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { sendError, sendSuccess } from './utils/apiResponse';

export const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  sendSuccess(res, { status: 'up' }, 'Server đang hoạt động');
});

// TODO (chặng sau): app.use('/api/boards', boardRoutes) ...

app.use((req, res) => {
  sendError(res, `Không tìm thấy route ${req.method} ${req.originalUrl}`, 404);
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const message = err instanceof Error ? err.message : 'Lỗi máy chủ nội bộ';
  sendError(res, message, 500);
});
