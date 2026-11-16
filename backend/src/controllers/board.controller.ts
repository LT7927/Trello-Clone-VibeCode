import type { Transaction } from 'sequelize';
import { Board, Card, List, Tag, sequelize } from '../models';
import { logActivity } from '../services/activity.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import {
  ensureBody,
  optionalBoolean,
  optionalString,
  optionalUuid,
  requiredString,
} from '../utils/validators';

const TITLE_MAX = 255;
const BACKGROUND_MAX = 255;
const DESCRIPTION_MAX = 5000;
const UPDATABLE_FIELDS = ['title', 'description', 'background', 'isArchived'] as const;

type IdParams = { id: string };
type BoardUpdates = Partial<Pick<Board, (typeof UPDATABLE_FIELDS)[number]>>;

async function findBoardOrThrow(
  id: string,
  options: { transaction?: Transaction; lock?: boolean } = {},
): Promise<Board> {
  const board = await Board.findByPk(id, options);
  if (!board) throw AppError.notFound('Không tìm thấy board');
  return board;
}

/** ?archived=true -> board đã lưu trữ; mặc định (hoặc false) -> board đang hoạt động */
function parseArchivedQuery(value: unknown): boolean {
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  throw AppError.badRequest('Query "archived" chỉ nhận true hoặc false', { field: 'archived' });
}

/** GET /api/boards */
export const listBoards = asyncHandler(async (req, res) => {
  const isArchived = parseArchivedQuery(req.query.archived);
  const boards = await Board.findAll({
    where: { isArchived },
    order: [['updatedAt', 'DESC']],
  });
  sendSuccess(res, boards, 'Lấy danh sách board thành công');
});

/**
 * GET /api/boards/:id
 * Trả toàn bộ dữ liệu để render Kanban: lists -> cards -> tags, sắp theo position.
 * Dùng `separate: true` để tách thành nhiều query nhỏ, tránh JOIN bùng nổ số dòng.
 * Chỉ lấy list/card chưa lưu trữ.
 */
export const getBoard = asyncHandler<IdParams>(async (req, res) => {
  const board = await Board.findByPk(req.params.id, {
    include: [
      {
        model: List,
        as: 'lists',
        where: { isArchived: false },
        required: false,
        separate: true,
        order: [
          ['position', 'ASC'],
          ['createdAt', 'ASC'],
        ],
        include: [
          {
            model: Card,
            as: 'cards',
            where: { isArchived: false },
            required: false,
            separate: true,
            order: [
              ['position', 'ASC'],
              ['createdAt', 'ASC'],
            ],
            include: [{ model: Tag, as: 'tags', through: { attributes: [] } }],
          },
        ],
      },
      {
        model: Tag,
        as: 'tags',
        separate: true,
        order: [['name', 'ASC']],
      },
    ],
  });
  if (!board) throw AppError.notFound('Không tìm thấy board');
  sendSuccess(res, board, 'Lấy chi tiết board thành công');
});

/** POST /api/boards  body: { id?, title, description?, background? } */
export const createBoard = asyncHandler(async (req, res) => {
  const body = ensureBody(req.body);
  const input = {
    id: optionalUuid(body, 'id'),
    title: requiredString(body, 'title', TITLE_MAX),
    description: optionalString(body, 'description', DESCRIPTION_MAX, { nullable: true }),
    background: optionalString(body, 'background', BACKGROUND_MAX, { nullable: true }),
  };

  const board = await sequelize.transaction(async (transaction) => {
    // id trùng -> UniqueConstraintError -> errorHandler trả 409
    const created = await Board.create(input, { transaction });
    await logActivity(
      {
        boardId: created.id,
        entityType: 'board',
        entityId: created.id,
        action: 'BOARD_CREATED',
        metadata: { title: created.title },
      },
      transaction,
    );
    return created;
  });

  sendSuccess(res, board, 'Tạo board thành công', 201);
});

/** PATCH /api/boards/:id  body: { title?, description?, background?, isArchived? } */
export const updateBoard = asyncHandler<IdParams>(async (req, res) => {
  const body = ensureBody(req.body);
  const updates: BoardUpdates = {};

  const title = optionalString(body, 'title', TITLE_MAX);
  if (title != null) updates.title = title;
  const description = optionalString(body, 'description', DESCRIPTION_MAX, { nullable: true });
  if (description !== undefined) updates.description = description;
  const background = optionalString(body, 'background', BACKGROUND_MAX, { nullable: true });
  if (background !== undefined) updates.background = background;
  const isArchived = optionalBoolean(body, 'isArchived');
  if (isArchived !== undefined) updates.isArchived = isArchived;

  if (Object.keys(updates).length === 0) {
    throw AppError.badRequest('Không có trường hợp lệ nào để cập nhật', {
      allowedFields: UPDATABLE_FIELDS,
    });
  }

  const board = await sequelize.transaction(async (transaction) => {
    const found = await findBoardOrThrow(req.params.id, { transaction, lock: true });
    const oldTitle = found.title;

    found.set(updates);
    const changed = found.changed() || [];
    if (changed.length === 0) return found; // Không có gì thay đổi -> không ghi DB, không ghi log

    await found.save({ transaction });

    const contentFields = changed.filter((field) => field !== 'isArchived');
    if (contentFields.length > 0) {
      await logActivity(
        {
          boardId: found.id,
          entityType: 'board',
          entityId: found.id,
          action: 'BOARD_UPDATED',
          metadata: {
            changedFields: contentFields,
            ...(contentFields.includes('title') && { oldTitle, newTitle: found.title }),
          },
        },
        transaction,
      );
    }

    if (changed.includes('isArchived')) {
      await logActivity(
        {
          boardId: found.id,
          entityType: 'board',
          entityId: found.id,
          action: found.isArchived ? 'BOARD_ARCHIVED' : 'BOARD_RESTORED',
        },
        transaction,
      );
    }

    return found;
  });

  sendSuccess(res, board, 'Cập nhật board thành công');
});

/**
 * DELETE /api/boards/:id
 * Xoá cứng. FK ON DELETE CASCADE ở DB tự xoá lists, cards, tags, card_tags, activity_logs.
 * Không ghi log BOARD_DELETED vì log của board cũng bị xoá theo.
 */
export const deleteBoard = asyncHandler<IdParams>(async (req, res) => {
  const board = await findBoardOrThrow(req.params.id);
  await board.destroy();
  sendSuccess(res, { id: board.id }, 'Đã xoá board và toàn bộ dữ liệu liên quan');
});
