'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { CardWithTags } from '@/types';
import type { CardDragData } from './dnd';

const dueDateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' });

/** Phần hiển thị thuần của card — dùng chung cho card thật và DragOverlay */
export function CardPreview({ card, className }: { card: CardWithTags; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg bg-white px-3 py-2 text-sm text-gray-900 shadow-sm ring-1 ring-gray-900/5',
        className,
      )}
    >
      {card.tags.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {card.tags.map((tag) => (
            <span
              key={tag.id}
              title={tag.name}
              className="h-2 w-10 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
          ))}
        </div>
      )}

      <p className={cn('break-words', card.isCompleted && 'text-gray-500 line-through')}>{card.title}</p>

      {(card.dueDate || card.isCompleted) && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-500">
          {card.isCompleted && <CheckCircle2 className="size-3.5 text-green-600" aria-label="Đã hoàn thành" />}
          {card.dueDate && (
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden />
              {dueDateFormatter.format(new Date(card.dueDate))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface KanbanCardProps {
  card: CardWithTags;
  listId: string;
}

/** Card kéo được. Kéo trên toàn bộ thẻ (sensor có ngưỡng nên click vẫn hoạt động). */
export const KanbanCard = memo(function KanbanCard({ card, listId }: KanbanCardProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', listId } satisfies CardDragData,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        // Translate (không scale) để card không bị méo khi đi qua card có chiều cao khác
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn('cursor-grab touch-manipulation active:cursor-grabbing', isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
    >
      <CardPreview card={card} className={cn(!isDragging && 'hover:ring-gray-900/20')} />
    </div>
  );
});
