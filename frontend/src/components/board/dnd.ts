import type { Data } from '@dnd-kit/core';

/**
 * Dữ liệu gắn vào mỗi sortable (useSortable({ data })) để phân biệt List và Card
 * trong collision detection và các handler onDragX.
 */
export type ListDragData = { type: 'list' };
export type CardDragData = { type: 'card'; listId: string };
export type DragItemType = 'list' | 'card';

/**
 * Gắn vào phần tử tương tác NẰM TRONG tay cầm kéo (input, nút menu...).
 * MouseSensor / TouchSensor kích hoạt từ bất kỳ phần tử con nào của activator,
 * nên phải chặn sự kiện nổi bọt lên header. (KeyboardSensor tự bỏ qua khi target
 * không phải chính activator nên không cần chặn phím.)
 */
export const stopDragPropagation = {
  onMouseDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onTouchStart: (event: { stopPropagation: () => void }) => event.stopPropagation(),
} as const;

export function getDragType(data: Data | undefined): DragItemType | null {
  const type = data?.type;
  return type === 'list' || type === 'card' ? type : null;
}
