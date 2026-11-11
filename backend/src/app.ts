import express from 'express';
import cors from 'cors';
import { sendSuccess } from './utils/apiResponse';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

export const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  sendSuccess(res, { status: 'up' }, 'Server đang hoạt động');
});

// TODO (Ticket 1+): app.use('/api/boards', boardRoutes) ...

app.use(notFoundHandler);
app.use(errorHandler);
