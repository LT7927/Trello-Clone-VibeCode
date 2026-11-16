import { Router } from 'express';
import {
  createBoard,
  deleteBoard,
  getBoard,
  listBoards,
  updateBoard,
} from '../controllers/board.controller';
import { validateUuidParams } from '../middlewares/validateUuidParams';

export const boardRoutes = Router();

boardRoutes.route('/').get(listBoards).post(createBoard);

boardRoutes
  .route('/:id')
  .all(validateUuidParams('id'))
  .get(getBoard)
  .patch(updateBoard)
  .delete(deleteBoard);
