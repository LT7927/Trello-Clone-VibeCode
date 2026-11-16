import type { Transaction } from 'sequelize';
import { Board, Card, List, sequelize } from '../models';
import { logActivity } from '../services/activity.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { rebalanceLists } from '../services/position.service';
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
  optionalString,
  optionalUuid,
  rejectFields,
  requiredString,
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
  rejectFields(body, FORBIDDEN_PATCH_FIELDS, UPDATABLE_FIELDS);

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
 * PATCH /api/lists/:id/move  body: { prevListId: string | null, nextListId: string | null }
 *
 * prev / next là 2 list ĐANG HOẠT ĐỘNG liền kề tại vị trí thả (theo góc nhìn của client,
 * không tính list đang kéo). null = thả ở đầu / cuối board.
 *
 * Luồng (1 transaction):
 *  1. Đọc list để lấy boardId.
 *  2. Khoá toàn bộ list của board (FOR UPDATE, sắp theo id để thứ tự khoá cố định -> tránh deadlock).
 *  3. Kiểm tra prev / next tồn tại, cùng board, chưa lưu trữ.
 *  4. Kiểm tra prev / next đang liền kề trên server; không khớp -> 409 (client nên tải lại board).
 *  5. Đã đúng vị trí -> trả về luôn, không ghi DB / log.
 *  6. needsRebalance -> rebalanceLists rồi tính lại; calcPosition -> lưu -> log LIST_MOVED.
 */
export const moveList = asyncHandler<IdParams>(async (req, res) => {
  const body = ensureBody(req.body);
  const prevListId = nullableUuid(body, 'prevListId');
  const nextListId = nullableUuid(body, 'nextListId');
  const { id } = req.params;

  if (prevListId === id || nextListId === id) {
    throw AppError.badRequest('prevListId / nextListId không được trùng với list đang di chuyển');
  }
  if (prevListId !== null && prevListId === nextListId) {
    throw AppError.badRequest('prevListId và nextListId không được trùng nhau');
  }

  const result = await sequelize.transaction(async (transaction) => {
    // 1. Lấy boardId của list (chưa khoá, chỉ để biết cần khoá board nào)
    const target = await findListOrThrow(id, { transaction });
    const { boardId } = target;

    // 2. Khoá toàn bộ list trong board
    const boardLists = await List.findAll({
      where: { boardId },
      order: [['id', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    const byId = new Map(boardLists.map((item) => [item.id, item]));
    const list = byId.get(id);
    // List có thể vừa bị xoá bởi request khác trước khi ta khoá được
    if (!list) throw AppError.notFound('Không tìm thấy list');
    if (list.isArchived) throw AppError.badRequest('Không thể di chuyển list đã lưu trữ');

    // 3. prev / next phải cùng board và đang hoạt động
    const resolveNeighbor = (neighborId: string | null, field: string): List | null => {
      if (neighborId === null) return null;
      const neighbor = byId.get(neighborId);
      if (!neighbor) {
        throw AppError.badRequest(`"${field}" không tồn tại hoặc không thuộc cùng board`, { field });
      }
      if (neighbor.isArchived) {
        throw AppError.badRequest(`"${field}" là list đã lưu trữ`, { field });
      }
      return neighbor;
    };
    const prev = resolveNeighbor(prevListId, 'prevListId');
    const next = resolveNeighbor(nextListId, 'nextListId');

    // 4. Kiểm tra prev / next liền kề trong danh sách đang hoạt động (bỏ list đang kéo)
    const activeOrdered = boardLists
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
        prevListId,
        nextListId,
      });
    }

    // 5. Đã ở đúng vị trí -> không làm gì
    const fromPosition = list.position;
    const alreadyInPlace =
      (prev === null || prev.position < fromPosition) &&
      (next === null || fromPosition < next.position);
    if (alreadyInPlace) {
      return { list, rebalanced: false, positions: undefined as PositionUpdate[] | undefined };
    }

    // 6. Tính position mới, rebalance nếu khoảng cách quá nhỏ
    let prevPos = prev ? prev.position : null;
    let nextPos = next ? next.position : null;
    let rebalanced = false;
    let positions: PositionUpdate[] | undefined;

    if (needsRebalance(prevPos, nextPos)) {
      positions = await rebalanceLists(boardId, transaction);
      rebalanced = true;
      const newPositions = new Map(positions.map((p) => [p.id, p.position]));
      prevPos = prev ? (newPositions.get(prev.id) ?? null) : null;
      nextPos = next ? (newPositions.get(next.id) ?? null) : null;
    }

    const toPosition = calcPosition(prevPos, nextPos);
    list.position = toPosition;
    await list.save({ transaction });

    if (positions) {
      // Cập nhật vị trí mới của list vừa kéo vào kết quả rebalance để client đồng bộ 1 lần
      positions = positions
        .map((p) => (p.id === list.id ? { id: p.id, position: toPosition } : p))
        .sort((a, b) => a.position - b.position);
    }

    await logActivity(
      {
        boardId,
        entityType: 'list',
        entityId: list.id,
        action: 'LIST_MOVED',
        metadata: {
          title: list.title,
          fromPosition,
          toPosition,
          prevListId,
          nextListId,
          rebalanced,
        },
      },
      transaction,
    );

    return { list, rebalanced, positions };
  });

  sendSuccess(
    res,
    {
      list: result.list,
      rebalanced: result.rebalanced,
      ...(result.positions && { positions: result.positions }),
    },
    'Di chuyển list thành công',
  );
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
