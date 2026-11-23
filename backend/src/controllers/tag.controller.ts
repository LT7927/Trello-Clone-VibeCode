import { Op, type Transaction } from 'sequelize';
import { Board, Card, CardTag, List, Tag, sequelize } from '../models';
import { logActivity } from '../services/activity.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import {
  ensureBody,
  optionalHexColor,
  optionalString,
  optionalUuid,
  requiredHexColor,
  requiredString,
  requiredUuid,
} from '../utils/validators';

/** Khớp với STRING(50) trong tag.model.ts */
const NAME_MAX = 50;
const UPDATABLE_FIELDS = ['name', 'color'] as const;

type BoardIdParams = { boardId: string };
type IdParams = { id: string };
type CardIdParams = { cardId: string };
type CardTagParams = { cardId: string; tagId: string };
type TagUpdates = Partial<Pick<Tag, (typeof UPDATABLE_FIELDS)[number]>>;

/**
 * Khoá dòng board (FOR NO KEY UPDATE) để các request tạo / đổi tên tag trong
 * cùng board chạy tuần tự -> kiểm tra trùng tên không bị race.
 * NO KEY UPDATE không chặn các INSERT có FK trỏ tới board (list, activity_logs...).
 */
async function lockBoard(boardId: string, transaction: Transaction): Promise<Board> {
  const board = await Board.findByPk(boardId, {
    attributes: ['id'],
    transaction,
    lock: transaction.LOCK.NO_KEY_UPDATE,
  });
  if (!board) throw AppError.notFound('Không tìm thấy board');
  return board;
}

/**
 * Trùng tên được so sánh KHÔNG phân biệt hoa thường ("Bug" == "bug").
 * Unique index (board_id, name) ở DB vẫn là lớp chặn cuối (-> 409 qua errorHandler).
 */
async function assertNameAvailable(
  boardId: string,
  name: string,
  transaction: Transaction,
  excludeTagId?: string,
): Promise<void> {
  const existing = await Tag.findOne({
    attributes: ['id', 'name'],
    where: {
      [Op.and]: [
        { boardId },
        sequelize.where(sequelize.fn('LOWER', sequelize.col('name')), name.toLowerCase()),
        ...(excludeTagId ? [{ id: { [Op.ne]: excludeTagId } }] : []),
      ],
    },
    transaction,
  });
  if (existing) {
    throw AppError.conflict(`Tag "${existing.name}" đã tồn tại trong board`, {
      field: 'name',
      existingTagId: existing.id,
    });
  }
}

/**
 * Khoá card (NO KEY UPDATE) để gắn / gỡ tag trên cùng card chạy tuần tự,
 * rồi lấy boardId qua list cha (không JOIN, giống card.controller).
 */
async function lockCardWithBoardId(
  cardId: string,
  transaction: Transaction,
): Promise<{ card: Card; boardId: string }> {
  const card = await Card.findByPk(cardId, {
    attributes: ['id', 'listId', 'title'],
    transaction,
    lock: transaction.LOCK.NO_KEY_UPDATE,
  });
  if (!card) throw AppError.notFound('Không tìm thấy card');
  const list = await List.findByPk(card.listId, { attributes: ['id', 'boardId'], transaction });
  if (!list) throw AppError.notFound('Không tìm thấy list chứa card');
  return { card, boardId: list.boardId };
}

async function findTagOrThrow(id: string, transaction: Transaction, lock = false): Promise<Tag> {
  const tag = await Tag.findByPk(id, {
    transaction,
    ...(lock && { lock: transaction.LOCK.UPDATE }),
  });
  if (!tag) throw AppError.notFound('Không tìm thấy tag');
  return tag;
}

/* ------------------------------------------------------------------ */
/*  Quản lý tag cấp board                                              */
/* ------------------------------------------------------------------ */

/**
 * POST /api/boards/:boardId/tags  body: { id?, name, color }
 * color: #RGB hoặc #RRGGBB (lưu dạng in hoa). Trùng tên trong board -> 409.
 */
export const createTag = asyncHandler<BoardIdParams>(async (req, res) => {
  const body = ensureBody(req.body);
  const input = {
    id: optionalUuid(body, 'id'),
    name: requiredString(body, 'name', NAME_MAX),
    color: requiredHexColor(body, 'color'),
  };
  const { boardId } = req.params;

  const tag = await sequelize.transaction(async (transaction) => {
    await lockBoard(boardId, transaction);
    await assertNameAvailable(boardId, input.name, transaction);

    // id trùng -> UniqueConstraintError -> errorHandler trả 409
    const created = await Tag.create({ ...input, boardId }, { transaction });
    await logActivity(
      {
        boardId,
        entityType: 'tag',
        entityId: created.id,
        action: 'TAG_CREATED',
        metadata: { name: created.name, color: created.color },
      },
      transaction,
    );
    return created;
  });

  sendSuccess(res, tag, 'Tạo tag thành công', 201);
});

/** PATCH /api/tags/:id  body: { name?, color? } */
export const updateTag = asyncHandler<IdParams>(async (req, res) => {
  const body = ensureBody(req.body);
  const updates: TagUpdates = {};
  const name = optionalString(body, 'name', NAME_MAX);
  if (name != null) updates.name = name;
  const color = optionalHexColor(body, 'color');
  if (color !== undefined) updates.color = color;

  if (Object.keys(updates).length === 0) {
    throw AppError.badRequest('Không có trường hợp lệ nào để cập nhật', {
      allowedFields: UPDATABLE_FIELDS,
    });
  }

  const tag = await sequelize.transaction(async (transaction) => {
    // Thứ tự khoá: board -> tag (giống createTag) để tránh deadlock
    const snapshot = await findTagOrThrow(req.params.id, transaction);
    await lockBoard(snapshot.boardId, transaction);
    const found = await findTagOrThrow(req.params.id, transaction, true);

    const oldName = found.name;
    const oldColor = found.color;
    found.set(updates);
    const changed = found.changed() || [];
    if (changed.length === 0) return found; // Không có gì thay đổi -> không ghi DB, không ghi log

    // Cho phép đổi hoa/thường của chính nó ("bug" -> "Bug") nhờ excludeTagId
    if (changed.includes('name')) {
      await assertNameAvailable(found.boardId, found.name, transaction, found.id);
    }

    await found.save({ transaction });
    await logActivity(
      {
        boardId: found.boardId,
        entityType: 'tag',
        entityId: found.id,
        action: 'TAG_UPDATED',
        metadata: {
          name: found.name,
          changedFields: changed,
          ...(changed.includes('name') && { oldName, newName: found.name }),
          ...(changed.includes('color') && { oldColor, newColor: found.color }),
        },
      },
      transaction,
    );
    return found;
  });

  sendSuccess(res, tag, 'Cập nhật tag thành công');
});

/**
 * DELETE /api/tags/:id
 * Xoá cứng tag + toàn bộ liên kết card_tags. Xoá card_tags tường minh trong cùng
 * transaction (không phụ thuộc hoàn toàn vào FK CASCADE của DB) và trả về
 * affectedCardIds để Frontend gỡ tag khỏi các card đang hiển thị.
 */
export const deleteTag = asyncHandler<IdParams>(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const tag = await findTagOrThrow(req.params.id, transaction, true);

    const links = await CardTag.findAll({
      attributes: ['cardId'],
      where: { tagId: tag.id },
      transaction,
    });
    const affectedCardIds = links.map((link) => link.cardId);

    await CardTag.destroy({ where: { tagId: tag.id }, transaction });
    await tag.destroy({ transaction });

    await logActivity(
      {
        boardId: tag.boardId,
        entityType: 'tag',
        entityId: tag.id,
        action: 'TAG_DELETED',
        metadata: { name: tag.name, color: tag.color, affectedCardIds },
      },
      transaction,
    );

    return { id: tag.id, boardId: tag.boardId, affectedCardIds };
  });

  sendSuccess(res, result, 'Đã xoá tag');
});

/* ------------------------------------------------------------------ */
/*  Gắn / gỡ tag trên card                                             */
/* ------------------------------------------------------------------ */

/**
 * POST /api/cards/:cardId/tags  body: { tagId }
 * - Card và tag phải cùng board, khác board -> 400.
 * - IDEMPOTENT: đã gắn rồi -> 200, alreadyAttached = true, không ghi log.
 *   Gắn mới -> 201 + log TAG_ADDED.
 * data: { cardId, tag, alreadyAttached }
 */
export const addTagToCard = asyncHandler<CardIdParams>(async (req, res) => {
  const body = ensureBody(req.body);
  const tagId = requiredUuid(body, 'tagId');
  const { cardId } = req.params;

  const result = await sequelize.transaction(async (transaction) => {
    const { card, boardId } = await lockCardWithBoardId(cardId, transaction);
    const tag = await findTagOrThrow(tagId, transaction);

    if (tag.boardId !== boardId) {
      throw AppError.badRequest('Tag và card không thuộc cùng một board', { field: 'tagId' });
    }

    const existing = await CardTag.findOne({ where: { cardId, tagId }, transaction });
    if (existing) return { cardId, tag, alreadyAttached: true };

    await CardTag.create({ cardId, tagId }, { transaction });
    await logActivity(
      {
        boardId,
        entityType: 'tag',
        entityId: tag.id,
        cardId: card.id,
        action: 'TAG_ADDED',
        metadata: {
          title: card.title,
          tagId: tag.id,
          tagName: tag.name,
          tagColor: tag.color,
        },
      },
      transaction,
    );
    return { cardId, tag, alreadyAttached: false };
  });

  if (result.alreadyAttached) {
    sendSuccess(res, result, 'Tag đã được gắn vào card từ trước');
  } else {
    sendSuccess(res, result, 'Gắn tag vào card thành công', 201);
  }
});

/**
 * DELETE /api/cards/:cardId/tags/:tagId
 * IDEMPOTENT: card / tag không tồn tại -> 404; chưa gắn -> 200, removed = false, không ghi log.
 * data: { cardId, tagId, removed }
 */
export const removeTagFromCard = asyncHandler<CardTagParams>(async (req, res) => {
  const { cardId, tagId } = req.params;

  const result = await sequelize.transaction(async (transaction) => {
    const { card, boardId } = await lockCardWithBoardId(cardId, transaction);
    const tag = await findTagOrThrow(tagId, transaction);

    const removedCount = await CardTag.destroy({ where: { cardId, tagId }, transaction });
    if (removedCount === 0) return { cardId, tagId, removed: false };

    await logActivity(
      {
        boardId,
        entityType: 'tag',
        entityId: tag.id,
        cardId: card.id,
        action: 'TAG_REMOVED',
        metadata: {
          title: card.title,
          tagId: tag.id,
          tagName: tag.name,
          tagColor: tag.color,
        },
      },
      transaction,
    );
    return { cardId, tagId, removed: true };
  });

  sendSuccess(
    res,
    result,
    result.removed ? 'Đã gỡ tag khỏi card' : 'Tag chưa được gắn vào card',
  );
});
