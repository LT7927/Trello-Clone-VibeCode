'use client';

import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useBoardStore } from '@/store/useBoardStore';
import type { CardWithTags, List } from '@/types';
import type { ListDragData } from './dnd';
import { InlineAddForm } from './InlineAddForm';
import { CardPreview, KanbanCard } from './KanbanCard';

const LIST_CLASS = 'flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-gray-200';

/** Bản sao tĩnh của list để hiển thị trong DragOverlay khi kéo list */
export function ListPreview({ list, cards }: { list: List; cards: CardWithTags[] }) {
  return (
    <div className={cn(LIST_CLASS, 'rotate-2 shadow-xl ring-1 ring-gray-900/10')}>
      <div className="px-3 py-2.5 text-sm font-semibold text-gray-800">{list.title}</div>
      <div className="flex flex-col gap-2 overflow-hidden px-2 pb-2">
        {cards.map((card) => (
          <CardPreview key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}

interface KanbanListProps {
  list: List;
  /** Card cần hiển thị — có thể là bản xem trước khi đang kéo card giữa các list */
  cards: CardWithTags[];
}

/**
 * Một cột. Bản thân cột là sortable (kéo bằng header) và đồng thời là droppable
 * cho card (cần khi list rỗng). Card bên trong nằm trong SortableContext riêng của cột.
 */
export const KanbanList = memo(function KanbanList({ list, cards }: KanbanListProps) {
  const createCard = useBoardStore((state) => state.createCard);
  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);

  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: list.id, data: { type: 'list' } satisfies ListDragData });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={list.title}
      className={cn(LIST_CLASS, isDragging && 'opacity-40')}
    >
      {/* Chỉ header là tay cầm kéo list -> kéo card bên trong không kéo theo cả cột */}
      <header
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="flex cursor-grab touch-manipulation items-center justify-between gap-2 rounded-t-xl px-3 py-2.5 active:cursor-grabbing"
      >
        <h2 className="truncate text-sm font-semibold text-gray-800">{list.title}</h2>
        <span className="shrink-0 rounded-full bg-gray-300/70 px-2 text-xs font-medium text-gray-600">
          {cards.length}
        </span>
      </header>

      <SortableContext id={list.id} items={cardIds} strategy={verticalListSortingStrategy}>
        {/* min-h giữ vùng thả cho list rỗng */}
        <div className="flex min-h-2 flex-col gap-2 overflow-y-auto px-2 pb-1">
          {cards.map((card) => (
            <KanbanCard key={card.id} card={card} listId={list.id} />
          ))}
        </div>
      </SortableContext>

      <div className="p-2 pt-1">
        <InlineAddForm
          label="Thêm thẻ"
          placeholder="Nhập tiêu đề cho thẻ này..."
          submitLabel="Thêm thẻ"
          onSubmit={(title) => createCard(list.id, title)}
        />
      </div>
    </section>
  );
});
