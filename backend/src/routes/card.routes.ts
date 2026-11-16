import { Router } from 'express';
import {
  createCard,
  deleteCard,
  getCard,
  moveCard,
  updateCard,
} from '../controllers/card.controller';
import { validateUuidParams } from '../middlewares/validateUuidParams';

/** Gắn tại /api/lists/:listId/cards (cần mergeParams để đọc :listId của router cha) */
export const listCardRoutes = Router({ mergeParams: true });

listCardRoutes.route('/').all(validateUuidParams('listId')).post(createCard);

/** Gắn tại /api/cards */
export const cardRoutes = Router();

cardRoutes.route('/:id/move').all(validateUuidParams('id')).patch(moveCard);

cardRoutes
  .route('/:id')
  .all(validateUuidParams('id'))
  .get(getCard)
  .patch(updateCard)
  .delete(deleteCard);
