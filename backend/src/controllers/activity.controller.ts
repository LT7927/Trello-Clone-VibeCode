import { Op, type WhereOptions } from 'sequelize';
import { ActivityLog, Board } from '../models';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import {
  encodeActivityCursor,
  parseActivityCursor,
  parseActivityLimit,
} from '../utils/activityCursor';

type BoardParams = { boardId: string };

/**
 * GET /api/boards/:boardId/activities?limit=20&before=<cursor>
 * Phân trang cursor-based theo (createdAt DESC, id DESC), khớp index
 * activity_logs_board_id_created_at_idx. Lấy dư 1 bản ghi để biết hasMore
 * mà không cần COUNT.
 */
export const listBoardActivities = asyncHandler<BoardParams>(async (req, res) => {
  const limit = parseActivityLimit(req.query.limit);
  const cursor = parseActivityCursor(req.query.before);
  const { boardId } = req.params;

  const board = await Board.findByPk(boardId, { attributes: ['id'] });
  if (!board) throw AppError.notFound('Không tìm thấy board');

  const where: WhereOptions<ActivityLog> = cursor
    ? {
        boardId,
        [Op.or]: [
          { createdAt: { [Op.lt]: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { [Op.lt]: cursor.id } },
        ],
      }
    : { boardId };

  const rows = await ActivityLog.findAll({
    where,
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeActivityCursor(last) : null;

  sendSuccess(res, { items, nextCursor, hasMore }, 'Lấy lịch sử hoạt động thành công');
});
