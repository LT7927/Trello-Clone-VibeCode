import { Router } from 'express';
import {
  addTagToCard,
  createTag,
  deleteTag,
  removeTagFromCard,
  updateTag,
} from '../controllers/tag.controller';
import { validateUuidParams } from '../middlewares/validateUuidParams';

/** Gắn tại /api/boards/:boardId/tags (cần mergeParams để đọc :boardId của router cha) */
export const boardTagRoutes = Router({ mergeParams: true });

boardTagRoutes.route('/').all(validateUuidParams('boardId')).post(createTag);

/** Gắn tại /api/cards/:cardId/tags (cần mergeParams để đọc :cardId của router cha) */
export const cardTagRoutes = Router({ mergeParams: true });

cardTagRoutes.route('/').all(validateUuidParams('cardId')).post(addTagToCard);

cardTagRoutes
  .route('/:tagId')
  .all(validateUuidParams('cardId', 'tagId'))
  .delete(removeTagFromCard);

/** Gắn tại /api/tags */
export const tagRoutes = Router();

tagRoutes.route('/:id').all(validateUuidParams('id')).patch(updateTag).delete(deleteTag);
