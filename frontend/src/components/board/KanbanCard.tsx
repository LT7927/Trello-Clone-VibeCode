'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { CardWithTags } from '@/types';
import type { CardDragData } from './dnd';
import { PriorityBadge } from './PriorityBadge';

const dueDateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' });

/** Phần hiển thị thuần của card — dùng chung cho card thật và DragOverlay */
export function CardPreview({ card, className }: { card: CardWithTags; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg bg-white px-3 py-2 text-sm text-gray-900 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-800 dark:text-gray-100 dark:ring-white/10',
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

      <p className={cn('break-words', card.isCompleted && 'text-gray-500 line-through dark:text-gray-400')}>
        {card.title}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <PriorityBadge priority={card.priority} />
        {card.isCompleted && <CheckCircle2 className="size-3.5 text-green-600" aria-label="Đã hoàn thành" />}
        {card.dueDate && (
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3.5" aria-hidden />
            {dueDateFormatter.format(new Date(card.dueDate))}
          </span>
        )}
      </div>
    </div>
  );
}

interface KanbanCardProps {
  card: CardWithTags;
  listId: string;
  /** Mở modal chi tiết. Nên là hàm ổn định (setState) để không phá memo. */
  onOpen: (cardId: string) => void;
  /**
   * Khoá kéo thả (đang bật bộ lọc): danh sách hiển thị thiếu card nên prev/next tính từ UI
   * sẽ sai so với server. Click / Enter vẫn mở chi tiết bình thường.
   */
  dragDisabled?: boolean;
}

/**
 * Card kéo được. Kéo trên toàn bộ thẻ (MouseSensor cần di chuyển > 5px mới kéo -> click = mở chi tiết).
 * Bàn phím: Enter -> mở chi tiết, Space -> bắt đầu kéo bằng bàn phím.
 */
export const KanbanCard = memo(function KanbanCard({ card, listId, onOpen, dragDisabled = false }: KanbanCardProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', listId } satisfies CardDragData,
    disabled: dragDisabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        // Translate (không scale) để card không bị méo khi đi qua card có chiều cao khác
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn(
        dragDisabled ? 'cursor-pointer' : 'cursor-grab touch-manipulation active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
      {...attributes}
      {...listeners}
      // useSortable({ disabled }) gắn aria-disabled -> bỏ đi vì card vẫn click để mở được
      aria-disabled={undefined}
      aria-label={`Mở chi tiết thẻ ${card.title}`}
      title={dragDisabled ? 'Tắt bộ lọc để kéo thả thẻ' : undefined}
      onClick={() => {
        if (!isDragging) onOpen(card.id);
      }}
      onKeyDown={(event) => {
        // Không chuyển Enter cho KeyboardSensor -> Enter chỉ mở modal, Space vẫn kéo được
        if (event.key === 'Enter' && !isDragging) {
          event.preventDefault();
          onOpen(card.id);
          return;
        }
        listeners?.onKeyDown?.(event);
      }}
    >
      <CardPreview card={card} className={cn(!isDragging && 'hover:ring-gray-900/20 dark:hover:ring-white/25')} />
    </div>
  );
});
