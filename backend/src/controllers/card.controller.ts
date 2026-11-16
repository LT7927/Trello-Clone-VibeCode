import type { Transaction } from 'sequelize';
import { ActivityLog, Card, List, Tag, sequelize } from '../models';
import { logActivity } from '../services/activity.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { rebalanceCards } from '../services/position.service';
import {
  POSITION_GAP,
  calcPosition,
  needsRebalance,
  type PositionUpdate,
} from '../utils/position';
import {
  ensureBody,
  nullableUuid,
  optionalBoolean,
  optionalDate,
  optionalString,
  optionalUuid,
  rejectFields,
  requiredString,
  requiredUuid,
} from '../utils/validators';

const TITLE_MAX = 500;
const DESCRIPTION_MAX = 10000;
const RECENT_ACTIVITY_LIMIT = 20;
const UPDATABLE_FIELDS = ['title', 'description', 'dueDate', 'isCompleted', 'isArchived'] as const;
/** listId / position chỉ được đổi qua API kéo thả card */
const FORBIDDEN_FIELDS = ['listId', 'position'] as const;
/** Các trường nội dung -> gộp vào 1 log CARD_UPDATED */
const CONTENT_FIELDS: readonly string[] = ['title', 'description', 'dueDate'];

type ListIdParams = { listId: string };
type IdParams = { id: string };
type CardUpdates = Partial<Pick<Card, (typeof UPDATABLE_FIELDS)[number]>>;

/**
 * Khoá card (nếu cần) rồi lấy boardId qua list cha để ghi log.
 * Không JOIN vì Postgres không cho FOR UPDATE trên phía nullable của LEFT JOIN.
 */
async function findCardWithBoardId(
  id: string,
  transaction: Transaction,
): Promise<{ card: Card; boardId: string }> {
  const card = await Card.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!card) throw AppError.notFound('Không tìm thấy card');
  const list = await List.findByPk(card.listId, { attributes: ['id', 'boardId'], transaction });
  if (!list) throw AppError.notFound('Không tìm thấy list chứa card');
  return { card, boardId: list.boardId };
}

/**
 * POST /api/lists/:listId/cards  body: { id?, title, description?, dueDate? }
 * position = MAX(position) của card trong list + 65536; list trống -> 65536.
 * Khoá dòng list để các request tạo card đồng thời trong cùng list chạy tuần tự
 * (tránh trùng position) và chặn list bị xoá giữa chừng.
 */
export const createCard = asyncHandler<ListIdParams>(async (req, res) => {
  const body = ensureBody(req.body);
  if ('position' in body) {
    throw AppError.badRequest('Không được gửi "position", server tự tính vị trí', {
      field: 'position',
    });
  }
  const input = {
    id: optionalUuid(body, 'id'),
    title: requiredString(body, 'title', TITLE_MAX),
    description: optionalString(body, 'description', DESCRIPTION_MAX, { nullable: true }),
    dueDate: optionalDate(body, 'dueDate'),
  };
  const { listId } = req.params;

  const card = await sequelize.transaction(async (transaction) => {
    const list = await List.findByPk(listId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!list) throw AppError.notFound('Không tìm thấy list');
    if (list.isArchived) throw AppError.badRequest('Không thể thêm card vào list đã lưu trữ');

    const maxPosition = await Card.max<number | null, Card>('position', {
      where: { listId },
      transaction,
    });
    const position = maxPosition == null ? POSITION_GAP : Number(maxPosition) + POSITION_GAP;

    // id trùng -> UniqueConstraintError -> errorHandler trả 409
    const created = await Card.create({ ...input, listId, position }, { transaction });
    await logActivity(
      {
        boardId: list.boardId,
        entityType: 'card',
        entityId: created.id,
        cardId: created.id,
        action: 'CARD_CREATED',
        metadata: { title: created.title, listId, listTitle: list.title },
      },
      transaction,
    );
    return created;
  });

  sendSuccess(res, card, 'Tạo card thành công', 201);
});

/**
 * GET /api/cards/:id
 * Trả card kèm list cha (id, title, boardId), tags và 20 activity gần nhất của card.
 */
export const getCard = asyncHandler<IdParams>(async (req, res) => {
  const card = await Card.findByPk(req.params.id, {
    include: [
      { model: List, as: 'list', attributes: ['id', 'title', 'boardId'] },
      {
        model: Tag,
        as: 'tags',
        through: { attributes: [] },
      },
      {
        model: ActivityLog,
        as: 'activities',
        separate: true,
        limit: RECENT_ACTIVITY_LIMIT,
        order: [['createdAt', 'DESC']],
      },
    ],
    order: [[{ model: Tag, as: 'tags' }, 'name', 'ASC']],
  });
  if (!card) throw AppError.notFound('Không tìm thấy card');
  sendSuccess(res, card, 'Lấy chi tiết card thành công');
});

/**
 * PATCH /api/cards/:id  body: { title?, description?, dueDate?, isCompleted?, isArchived? }
 * Không cho phép sửa listId / position (trả 400 nếu client gửi lên).
 */
export const updateCard = asyncHandler<IdParams>(async (req, res) => {
  const body = ensureBody(req.body);
  rejectFields(body, FORBIDDEN_FIELDS, UPDATABLE_FIELDS);

  const updates: CardUpdates = {};
  const title = optionalString(body, 'title', TITLE_MAX);
  if (title != null) updates.title = title;
  const description = optionalString(body, 'description', DESCRIPTION_MAX, { nullable: true });
  if (description !== undefined) updates.description = description;
  const dueDate = optionalDate(body, 'dueDate');
  if (dueDate !== undefined) updates.dueDate = dueDate;
  const isCompleted = optionalBoolean(body, 'isCompleted');
  if (isCompleted !== undefined) updates.isCompleted = isCompleted;
  const isArchived = optionalBoolean(body, 'isArchived');
  if (isArchived !== undefined) updates.isArchived = isArchived;

  if (Object.keys(updates).length === 0) {
    throw AppError.badRequest('Không có trường hợp lệ nào để cập nhật', {
      allowedFields: UPDATABLE_FIELDS,
    });
  }

  const card = await sequelize.transaction(async (transaction) => {
    const { card: found, boardId } = await findCardWithBoardId(req.params.id, transaction);
    const oldTitle = found.title;

    found.set(updates);
    const changed = found.changed() || [];
    if (changed.length === 0) return found; // Không có gì thay đổi -> không ghi DB, không ghi log

    await found.save({ transaction });

    const base = {
      boardId,
      entityType: 'card' as const,
      entityId: found.id,
      cardId: found.id,
    };

    const contentFields = changed.filter((field) => CONTENT_FIELDS.includes(field));
    if (contentFields.length > 0) {
      await logActivity(
        {
          ...base,
          action: 'CARD_UPDATED',
          metadata: {
            title: found.title,
            changedFields: contentFields,
            ...(contentFields.includes('title') && { oldTitle, newTitle: found.title }),
          },
        },
        transaction,
      );
    }

    if (changed.includes('isCompleted')) {
      await logActivity(
        {
          ...base,
          action: found.isCompleted ? 'CARD_COMPLETED' : 'CARD_UNCOMPLETED',
          metadata: { title: found.title },
        },
        transaction,
      );
    }

    if (changed.includes('isArchived')) {
      await logActivity(
        {
          ...base,
          action: found.isArchived ? 'CARD_ARCHIVED' : 'CARD_RESTORED',
          metadata: { title: found.title },
        },
        transaction,
      );
    }

    return found;
  });

  sendSuccess(res, card, 'Cập nhật card thành công');
});

/**
 * PATCH /api/cards/:id/move  body: { toListId, prevCardId: string | null, nextCardId: string | null }
 *
 * prev / next là 2 card ĐANG HOẠT ĐỘNG liền kề tại vị trí thả trong list đích
 * (theo góc nhìn client, không tính card đang kéo). null = đầu / cuối list.
 *
 * Luồng (1 transaction):
 *  1. Đọc card (chưa khoá) để biết list nguồn.
 *  2. Khoá list nguồn + list đích trong 1 câu, sắp theo id (cùng thứ tự khoá với
 *     createCard / moveList -> không deadlock).
 *  3. Khoá lại card; nếu listId đã đổi (bị kéo đồng thời) -> 409.
 *  4. Kiểm tra list đích cùng board, chưa lưu trữ; card chưa lưu trữ.
 *  5. Khoá card của list đích; kiểm tra prev / next thuộc list đích và liền kề -> sai thì 409.
 *  6. Cùng list + đã đúng vị trí -> trả về luôn.
 *  7. needsRebalance -> rebalanceCards(list đích) -> calcPosition -> 1 câu UPDATE (listId + position).
 *  8. Khác list -> log CARD_MOVED; cùng list -> không ghi log.
 */
export const moveCard = asyncHandler<IdParams>(async (req, res) => {
  const body = ensureBody(req.body);
  const toListId = requiredUuid(body, 'toListId');
  const prevCardId = nullableUuid(body, 'prevCardId');
  const nextCardId = nullableUuid(body, 'nextCardId');
  const { id } = req.params;

  if (prevCardId === id || nextCardId === id) {
    throw AppError.badRequest('prevCardId / nextCardId không được trùng với card đang di chuyển');
  }
  if (prevCardId !== null && prevCardId === nextCardId) {
    throw AppError.badRequest('prevCardId và nextCardId không được trùng nhau');
  }

  const result = await sequelize.transaction(async (transaction) => {
    // 1. Biết list nguồn để khoá
    const snapshot = await Card.findByPk(id, { attributes: ['id', 'listId'], transaction });
    if (!snapshot) throw AppError.notFound('Không tìm thấy card');
    const fromListId = snapshot.listId;

    // 2. Khoá list nguồn + list đích theo thứ tự id
    const lockedLists = await List.findAll({
      where: { id: [...new Set([fromListId, toListId])] },
      order: [['id', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    const fromList = lockedLists.find((item) => item.id === fromListId);
    const toList = lockedLists.find((item) => item.id === toListId);
    if (!toList) throw AppError.notFound('Không tìm thấy list đích');
    if (!fromList) throw AppError.notFound('Không tìm thấy list chứa card');

    // 3. Khoá card; kiểm tra không bị kéo đi bởi request khác trong lúc chờ khoá
    const card = await Card.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!card) throw AppError.notFound('Không tìm thấy card');
    if (card.listId !== fromListId) {
      throw AppError.conflict('Card vừa được di chuyển bởi thao tác khác, vui lòng tải lại board');
    }

    // 4. Ràng buộc board / trạng thái
    if (toList.boardId !== fromList.boardId) {
      throw AppError.badRequest('Không thể di chuyển card sang board khác', { field: 'toListId' });
    }
    if (toList.isArchived) {
      throw AppError.badRequest('Không thể di chuyển card vào list đã lưu trữ', {
        field: 'toListId',
      });
    }
    if (card.isArchived) throw AppError.badRequest('Không thể di chuyển card đã lưu trữ');

    // 5. Khoá toàn bộ card của list đích (rebalance yêu cầu các dòng đã được khoá)
    const destCards = await Card.findAll({
      where: { listId: toListId },
      order: [['id', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    const byId = new Map(destCards.map((item) => [item.id, item]));

    const resolveNeighbor = (neighborId: string | null, field: string): Card | null => {
      if (neighborId === null) return null;
      const neighbor = byId.get(neighborId);
      if (!neighbor) {
        throw AppError.badRequest(`"${field}" không tồn tại hoặc không nằm trong list đích`, {
          field,
        });
      }
      if (neighbor.isArchived) {
        throw AppError.badRequest(`"${field}" là card đã lưu trữ`, { field });
      }
      return neighbor;
    };
    const prev = resolveNeighbor(prevCardId, 'prevCardId');
    const next = resolveNeighbor(nextCardId, 'nextCardId');

    const activeOrdered = destCards
      .filter((item) => !item.isArchived && item.id !== id)
      .sort(
        (a, b) =>
          a.position - b.position ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
    const prevIndex = prev ? activeOrdered.indexOf(prev) : -1;
    const expectedNext = activeOrdered[prevIndex + 1] ?? null;
    if (expectedNext !== next) {
      throw AppError.conflict('Vị trí thả không còn hợp lệ, vui lòng tải lại board', {
        prevCardId,
        nextCardId,
      });
    }

    // 6. Cùng list và đã đúng vị trí -> không làm gì
    const isSameList = fromListId === toListId;
    const fromPosition = card.position;
    if (
      isSameList &&
      (prev === null || prev.position < fromPosition) &&
      (next === null || fromPosition < next.position)
    ) {
      return { card, rebalanced: false, positions: undefined as PositionUpdate[] | undefined };
    }

    // 7. Tính position mới, rebalance list đích nếu khoảng cách quá nhỏ
    let prevPos = prev ? prev.position : null;
    let nextPos = next ? next.position : null;
    let rebalanced = false;
    let positions: PositionUpdate[] | undefined;

    if (needsRebalance(prevPos, nextPos)) {
      positions = await rebalanceCards(toListId, transaction);
      rebalanced = true;
      const newPositions = new Map(positions.map((p) => [p.id, p.position]));
      prevPos = prev ? (newPositions.get(prev.id) ?? null) : null;
      nextPos = next ? (newPositions.get(next.id) ?? null) : null;
    }

    const toPosition = calcPosition(prevPos, nextPos);
    // set() cả 2 trường rồi save() -> 1 câu UPDATE duy nhất (listId + position)
    card.set({ listId: toListId, position: toPosition });
    await card.save({ transaction });

    if (positions) {
      // Đưa vị trí mới của card vừa kéo vào kết quả (thay thế nếu cùng list, thêm mới nếu khác list)
      positions = [
        ...positions.filter((p) => p.id !== card.id),
        { id: card.id, position: toPosition },
      ].sort((a, b) => a.position - b.position);
    }

    // 8. Chỉ ghi log khi chuyển sang list khác
    if (!isSameList) {
      await logActivity(
        {
          boardId: toList.boardId,
          entityType: 'card',
          entityId: card.id,
          cardId: card.id,
          action: 'CARD_MOVED',
          metadata: {
            title: card.title,
            fromListId,
            toListId,
            fromListTitle: fromList.title,
            toListTitle: toList.title,
          },
        },
        transaction,
      );
    }

    return { card, rebalanced, positions };
  });

  sendSuccess(
    res,
    {
      card: result.card,
      rebalanced: result.rebalanced,
      ...(result.positions && { positions: result.positions }),
    },
    'Di chuyển card thành công',
  );
});

/**
 * DELETE /api/cards/:id
 * Xoá cứng. card_tags bị xoá theo (CASCADE); log cũ của card được giữ với card_id = NULL.
 * Log CARD_DELETED để cardId = null (card không còn tồn tại -> FK sẽ chặn),
 * tra cứu qua entityId; tiêu đề card lưu trong metadata.
 */
export const deleteCard = asyncHandler<IdParams>(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const { card, boardId } = await findCardWithBoardId(req.params.id, transaction);

    await card.destroy({ transaction });
    await logActivity(
      {
        boardId,
        entityType: 'card',
        entityId: card.id,
        cardId: null,
        action: 'CARD_DELETED',
        metadata: { title: card.title, listId: card.listId },
      },
      transaction,
    );

    return { id: card.id, listId: card.listId, boardId };
  });

  sendSuccess(res, result, 'Đã xoá card');
});
