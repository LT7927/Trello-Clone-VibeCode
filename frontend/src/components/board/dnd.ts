import type { Data } from '@dnd-kit/core';

/**
 * Dữ liệu gắn vào mỗi sortable (useSortable({ data })) để phân biệt List và Card
 * trong collision detection và các handler onDragX.
 */
export type ListDragData = { type: 'list' };
export type CardDragData = { type: 'card'; listId: string };
export type DragItemType = 'list' | 'card';

export function getDragType(data: Data | undefined): DragItemType | null {
  const type = data?.type;
  return type === 'list' || type === 'card' ? type : null;
}
