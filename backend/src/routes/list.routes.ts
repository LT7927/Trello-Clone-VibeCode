import { Router } from 'express';
import { createList, deleteList, moveList, updateList } from '../controllers/list.controller';
import { validateUuidParams } from '../middlewares/validateUuidParams';

/** Gắn tại /api/boards/:boardId/lists (cần mergeParams để đọc :boardId của router cha) */
export const boardListRoutes = Router({ mergeParams: true });

boardListRoutes.route('/').all(validateUuidParams('boardId')).post(createList);

/** Gắn tại /api/lists */
export const listRoutes = Router();

listRoutes.route('/:id/move').all(validateUuidParams('id')).patch(moveList);

listRoutes.route('/:id').all(validateUuidParams('id')).patch(updateList).delete(deleteList);
