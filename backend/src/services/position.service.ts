import { QueryTypes, type Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import { POSITION_GAP, type PositionUpdate } from '../utils/position';

/**
 * Rebalance phía DB: đánh số lại toàn bộ position trong 1 câu UPDATE duy nhất
 * (ROW_NUMBER theo thứ tự hiện tại), trả về danh sách position mới để gửi cho Frontend.
 *
 * BẮT BUỘC gọi trong transaction mà caller đã khoá các dòng liên quan (FOR UPDATE).
 * Thứ tự hiện tại: position ASC, rồi created_at, rồi id (để ổn định khi trùng position).
 */
async function rebalance(
  table: 'lists' | 'cards',
  parentColumn: 'board_id' | 'list_id',
  parentId: string,
  transaction: Transaction,
): Promise<PositionUpdate[]> {
  const rows = await sequelize.query<{ id: string; position: number }>(
    `
    UPDATE "${table}" AS t
    SET "position" = r.rn * :gap, "updated_at" = NOW()
    FROM (
      SELECT "id", ROW_NUMBER() OVER (ORDER BY "position" ASC, "created_at" ASC, "id" ASC) AS rn
      FROM "${table}"
      WHERE "${parentColumn}" = :parentId
    ) AS r
    WHERE t."id" = r."id"
    RETURNING t."id", t."position"
    `,
    {
      replacements: { gap: POSITION_GAP, parentId },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  return rows
    .map((row) => ({ id: row.id, position: Number(row.position) }))
    .sort((a, b) => a.position - b.position);
}

/** Đánh số lại toàn bộ List trong một Board */
export function rebalanceLists(boardId: string, transaction: Transaction): Promise<PositionUpdate[]> {
  return rebalance('lists', 'board_id', boardId, transaction);
}

/** Đánh số lại toàn bộ Card trong một List */
export function rebalanceCards(listId: string, transaction: Transaction): Promise<PositionUpdate[]> {
  return rebalance('cards', 'list_id', listId, transaction);
}
