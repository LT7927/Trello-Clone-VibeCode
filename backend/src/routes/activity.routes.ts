import { Router } from 'express';
import { listBoardActivities } from '../controllers/activity.controller';
import { validateUuidParams } from '../middlewares/validateUuidParams';

/** Gắn tại /api/boards/:boardId/activities (cần mergeParams để đọc :boardId của router cha) */
export const boardActivityRoutes = Router({ mergeParams: true });

boardActivityRoutes.route('/').all(validateUuidParams('boardId')).get(listBoardActivities);
