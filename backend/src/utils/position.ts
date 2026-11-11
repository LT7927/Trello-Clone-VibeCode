/**
 * Logic thuần (không đụng DB) để tính `position` kiểu số thực cho kéo thả.
 * Frontend có thể dùng lại đúng công thức này cho Optimistic UI.
 *
 *   - Danh sách rỗng           -> POSITION_GAP
 *   - Thêm vào cuối (chỉ prev) -> prev + POSITION_GAP
 *   - Thêm vào đầu (chỉ next)  -> next / 2
 *   - Chèn giữa prev và next   -> (prev + next) / 2
 *
 * Mỗi lần chèn giữa, khoảng cách bị chia đôi. Khi khoảng cách < MIN_POSITION_GAP
 * (hoặc dữ liệu sai thứ tự), cần đánh số lại toàn bộ danh sách (rebalance).
 */

/** Khoảng cách chuẩn giữa 2 phần tử liền kề sau khi tạo mới / rebalance */
export const POSITION_GAP = 65536;

/** Ngưỡng khoảng cách tối thiểu, nhỏ hơn mức này thì phải rebalance */
export const MIN_POSITION_GAP = 1e-6;

export interface PositionUpdate {
  id: string;
  position: number;
}

/**
 * True nếu không thể chèn an toàn giữa prev và next mà không rebalance trước.
 * `null` nghĩa là không có phần tử ở phía đó (đầu / cuối danh sách).
 */
export function needsRebalance(prev: number | null, next: number | null): boolean {
  if (prev !== null && next !== null) {
    // Bao gồm cả trường hợp prev >= next (dữ liệu trùng / sai thứ tự)
    return next - prev < MIN_POSITION_GAP;
  }
  if (next !== null) {
    // Chèn đầu danh sách: khoảng cách mới = next / 2
    return next / 2 < MIN_POSITION_GAP;
  }
  // Chèn cuối hoặc danh sách rỗng: luôn đủ chỗ
  return false;
}

/**
 * Tính position mới giữa prev và next.
 * Gọi needsRebalance() trước; hàm này ném lỗi nếu khoảng cách không hợp lệ
 * để tránh âm thầm tạo ra position trùng nhau.
 */
export function calcPosition(prev: number | null, next: number | null): number {
  if (needsRebalance(prev, next)) {
    throw new Error(
      `Khoảng cách position không đủ (prev=${prev}, next=${next}). Cần rebalance trước.`,
    );
  }
  if (prev === null && next === null) return POSITION_GAP;
  if (next === null) return (prev as number) + POSITION_GAP;
  if (prev === null) return next / 2;
  return (prev + next) / 2;
}

/**
 * Đánh số lại một danh sách id ĐÃ SẮP XẾP: GAP, 2*GAP, 3*GAP...
 * Dùng cho test và cho Frontend khi nhận cờ `rebalanced`.
 */
export function rebalancePositions(orderedIds: readonly string[]): PositionUpdate[] {
  return orderedIds.map((id, index) => ({ id, position: (index + 1) * POSITION_GAP }));
}
