import type { Transaction } from 'sequelize';
import { Board, Card, List, sequelize } from '../models';
import { logActivity } from '../services/activity.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { POSITION_GAP } from '../utils/position';
import {
  ensureBody,
  optionalBoolean,
  optionalString,
  optionalUuid,
  requiredString,
  type Body,
} from '../utils/validators';

const TITLE_MAX = 255;
const UPDATABLE_FIELDS = ['title', 'isArchived'] as const;
/** Các trường KHÔNG được sửa qua PATCH. position do API kéo thả (Ticket 3) đảm nhiệm. */
const FORBIDDEN_PATCH_FIELDS = ['position', 'boardId'] as const;

type BoardIdParams = { boardId: string };
type IdParams = { id: string };
type ListUpdates = Partial<Pick<List, (typeof UPDATABLE_FIELDS)[number]>>;

async function findListOrThrow(
  id: string,
  options: { transaction?: Transaction; lock?: boolean } = {},
): Promise<List> {
  const list = await List.findByPk(id, options);
  if (!list) throw AppError.notFound('Không tìm thấy list');
  return list;
}

function rejectForbiddenFields(body: Body): void {
  for (const field of FORBIDDEN_PATCH_FIELDS) {
    if (field in body) {
      throw AppError.badRequest(`Không được phép cập nhật trường "${field}" qua API này`, {
        field,
        allowedFields: UPDATABLE_FIELDS,
      });
    }
  }
}

/**
 * POST /api/boards/:boardId/lists  body: { id?, title }
 * position = MAX(position) của các list trong board + 65536; board trống -> 65536.
 * Khoá dòng board (FOR UPDATE) để các request tạo list đồng thời trong cùng board
 * chạy tuần tự, tránh 2 list nhận cùng một position.
 * MAX tính cả list đã lưu trữ để khi khôi phục không bị trùng position.
 */
export const createList = asyncHandler<BoardIdParams>(async (req, res) => {
  const body = ensureBody(req.body);
  if ('position' in body) {
    throw AppError.badRequest('Không được gửi "position", server tự tính vị trí', {
      field: 'position',
    });
  }
  const id = optionalUuid(body, 'id');
  const title = requiredString(body, 'title', TITLE_MAX);
  const { boardId } = req.params;

  const list = await sequelize.transaction(async (transaction) => {
    const board = await Board.findByPk(boardId, { transaction, lock: true });
    if (!board) throw AppError.notFound('Không tìm thấy board');

    const maxPosition = await List.max<number | null, List>('position', {
      where: { boardId },
      transaction,
    });
    const position = maxPosition == null ? POSITION_GAP : Number(maxPosition) + POSITION_GAP;

    // id trùng -> UniqueConstraintError -> errorHandler trả 409
    const created = await List.create({ id, boardId, title, position }, { transaction });
    await logActivity(
      {
        boardId,
        entityType: 'list',
        entityId: created.id,
        action: 'LIST_CREATED',
        metadata: { title: created.title, position: created.position },
      },
      transaction,
    );
    return created;
  });

  sendSuccess(res, list, 'Tạo list thành công', 201);
});

/**
 * PATCH /api/lists/:id  body: { title?, isArchived? }
 * Không cho phép sửa position / boardId (trả 400 nếu client gửi lên).
 */
export const updateList = asyncHandler<IdParams>(async (req, res) => {
  const body = ensureBody(req.body);
  rejectForbiddenFields(body);

  const updates: ListUpdates = {};
  const title = optionalString(body, 'title', TITLE_MAX);
  if (title != null) updates.title = title;
  const isArchived = optionalBoolean(body, 'isArchived');
  if (isArchived !== undefined) updates.isArchived = isArchived;

  if (Object.keys(updates).length === 0) {
    throw AppError.badRequest('Không có trường hợp lệ nào để cập nhật', {
      allowedFields: UPDATABLE_FIELDS,
    });
  }

  const list = await sequelize.transaction(async (transaction) => {
    const found = await findListOrThrow(req.params.id, { transaction, lock: true });
    const oldTitle = found.title;

    found.set(updates);
    const changed = found.changed() || [];
    if (changed.length === 0) return found; // Không có gì thay đổi -> không ghi DB, không ghi log

    await found.save({ transaction });

    if (changed.includes('title')) {
      await logActivity(
        {
          boardId: found.boardId,
          entityType: 'list',
          entityId: found.id,
          action: 'LIST_RENAMED',
          metadata: { oldTitle, newTitle: found.title },
        },
        transaction,
      );
    }

    if (changed.includes('isArchived')) {
      await logActivity(
        {
          boardId: found.boardId,
          entityType: 'list',
          entityId: found.id,
          action: found.isArchived ? 'LIST_ARCHIVED' : 'LIST_RESTORED',
          metadata: { title: found.title },
        },
        transaction,
      );
    }

    return found;
  });

  sendSuccess(res, list, 'Cập nhật list thành công');
});

/**
 * DELETE /api/lists/:id
 * Xoá cứng. FK ON DELETE CASCADE ở DB tự xoá cards (và card_tags) bên trong.
 * Log LIST_DELETED gắn với board nên vẫn được giữ lại; log của các card bị xoá
 * được giữ với card_id = NULL (ON DELETE SET NULL).
 */
export const deleteList = asyncHandler<IdParams>(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const list = await findListOrThrow(req.params.id, { transaction, lock: true });
    const deletedCardCount = await Card.count({ where: { listId: list.id }, transaction });

    await list.destroy({ transaction });
    await logActivity(
      {
        boardId: list.boardId,
        entityType: 'list',
        entityId: list.id,
        action: 'LIST_DELETED',
        metadata: { title: list.title, deletedCardCount },
      },
      transaction,
    );

    return { id: list.id, boardId: list.boardId, deletedCardCount };
  });

  sendSuccess(res, result, 'Đã xoá list và toàn bộ card bên trong');
});
