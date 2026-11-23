'use client';

import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, MoreHorizontal, Trash2 } from 'lucide-react';
import { memo, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { useBoardStore } from '@/store/useBoardStore';
import type { CardWithTags, List } from '@/types';
import { stopDragPropagation, type ListDragData } from './dnd';
import { InlineAddForm } from './InlineAddForm';
import { CardPreview, KanbanCard } from './KanbanCard';

const LIST_CLASS = 'flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-gray-200';

// ============================================================
// Tiêu đề cột: click để sửa tên
// ============================================================

/**
 * - Chế độ xem: <button>. KHÔNG chặn mousedown -> vẫn kéo được cột từ tiêu đề
 *   (sensor cần di chuyển > 5px mới kéo, nên click đứng yên = vào chế độ sửa).
 * - Chế độ sửa: <input> chặn mousedown/touchstart -> bôi đen text bằng chuột không kéo cột.
 */
function ListTitle({ listId, title }: { listId: string; title: string }) {
  const renameList = useBoardStore((state) => state.renameList);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Enter/Escape làm input unmount -> có thể kèm thêm 1 lần blur; chặn xử lý 2 lần */
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  const startEditing = () => {
    finishedRef.current = false;
    setDraft(title);
    setIsEditing(true);
  };

  const finishEditing = (save: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsEditing(false);

    const value = draft.trim();
    // Rỗng hoặc không đổi -> bỏ qua, hiển thị lại tên cũ
    if (save && value && value !== title) void renameList(listId, value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finishEditing(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finishEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finishEditing(true)}
        onKeyDown={handleKeyDown}
        {...stopDragPropagation}
        maxLength={255}
        aria-label="Tên danh sách"
        className="min-w-0 flex-1 cursor-text rounded-md border border-blue-500 bg-white px-1.5 py-0.5 text-sm font-semibold text-gray-900 outline-none ring-2 ring-blue-500/30"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      title="Nhấn để đổi tên"
      className="min-w-0 flex-1 truncate rounded-md border border-transparent px-1.5 py-0.5 text-left text-sm font-semibold text-gray-800 hover:bg-gray-300/60"
    >
      {title}
    </button>
  );
}

// ============================================================
// Menu thao tác (...)
// ============================================================

type MenuMode = 'closed' | 'menu' | 'confirm-delete';

const MENU_PANEL_CLASS =
  'absolute right-0 top-full z-20 mt-1 rounded-lg bg-white shadow-lg ring-1 ring-gray-900/10';
const MENU_ITEM_CLASS =
  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:outline-none';

/** Toàn bộ menu (nút + dropdown) chặn mousedown/touchstart -> không kích hoạt kéo cột */
function ListActionsMenu({ listId, title, cardCount }: { listId: string; title: string; cardCount: number }) {
  const archiveList = useBoardStore((state) => state.archiveList);
  const deleteList = useBoardStore((state) => state.deleteList);
  const [mode, setMode] = useState<MenuMode>('closed');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const confirmTitleId = useId();
  const confirmDescId = useId();

  // Click ra ngoài hoặc Escape -> đóng
  useEffect(() => {
    if (mode === 'closed') return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMode('closed');
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMode('closed');
      buttonRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode]);

  const handleArchive = () => {
    setMode('closed');
    void archiveList(listId); // List biến mất ngay (optimistic), component này unmount theo
  };

  const handleDelete = () => {
    setMode('closed');
    void deleteList(listId);
  };

  return (
    <div ref={rootRef} className="relative shrink-0" {...stopDragPropagation}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setMode((current) => (current === 'closed' ? 'menu' : 'closed'))}
        aria-label={`Thao tác với danh sách ${title}`}
        aria-haspopup="menu"
        aria-expanded={mode !== 'closed'}
        className={cn(
          'rounded-md p-1 text-gray-600 hover:bg-gray-300/70 hover:text-gray-900',
          mode !== 'closed' && 'bg-gray-300/70 text-gray-900',
        )}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>

      {mode === 'menu' && (
        <div role="menu" aria-label="Thao tác với danh sách" className={cn(MENU_PANEL_CLASS, 'w-56 py-1')}>
          <p className="border-b border-gray-100 px-3 pb-1.5 pt-1 text-center text-xs font-medium text-gray-500">
            Thao tác
          </p>
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={handleArchive}
            className={cn(MENU_ITEM_CLASS, 'text-gray-700')}
          >
            <Archive className="size-4" aria-hidden />
            Lưu trữ danh sách
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => setMode('confirm-delete')}
            className={cn(MENU_ITEM_CLASS, 'text-red-600 hover:bg-red-50 focus-visible:bg-red-50')}
          >
            <Trash2 className="size-4" aria-hidden />
            Xóa danh sách
          </button>
        </div>
      )}

      {mode === 'confirm-delete' && (
        <div
          role="alertdialog"
          aria-labelledby={confirmTitleId}
          aria-describedby={confirmDescId}
          className={cn(MENU_PANEL_CLASS, 'w-64 p-3')}
        >
          <p id={confirmTitleId} className="break-words text-sm font-semibold text-gray-900">
            Xóa danh sách “{title}”?
          </p>
          <p id={confirmDescId} className="mt-1 text-xs text-gray-600">
            {cardCount > 0 && `${cardCount} thẻ trong danh sách cũng sẽ bị xóa. `}
            Thao tác này không thể hoàn tác. Nếu chỉ muốn ẩn đi, hãy chọn “Lưu trữ”.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              autoFocus
              onClick={handleDelete}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Xóa
            </button>
            <button
              type="button"
              onClick={() => setMode('menu')}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
  onOpenCard: (cardId: string) => void;
}

/**
 * Một cột. Bản thân cột là sortable (kéo bằng header) và đồng thời là droppable
 * cho card (cần khi list rỗng). Card bên trong nằm trong SortableContext riêng của cột.
 */
export const KanbanList = memo(function KanbanList({ list, cards, onOpenCard }: KanbanListProps) {
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
      {/*
        Chỉ header là tay cầm kéo list -> kéo card bên trong không kéo theo cả cột.
        Ô sửa tên và menu (...) tự chặn mousedown/touchstart nên không kích hoạt kéo.
      */}
      <header
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="flex cursor-grab touch-manipulation items-center gap-1 rounded-t-xl px-2 py-2 active:cursor-grabbing"
      >
        <h2 className="flex min-w-0 flex-1">
          <ListTitle listId={list.id} title={list.title} />
        </h2>
        <span className="shrink-0 rounded-full bg-gray-300/70 px-2 text-xs font-medium text-gray-600">
          {cards.length}
        </span>
        <ListActionsMenu listId={list.id} title={list.title} cardCount={cards.length} />
      </header>

      <SortableContext id={list.id} items={cardIds} strategy={verticalListSortingStrategy}>
        {/* min-h giữ vùng thả cho list rỗng */}
        <div className="flex min-h-2 flex-col gap-2 overflow-y-auto px-2 pb-1">
          {cards.map((card) => (
            <KanbanCard key={card.id} card={card} listId={list.id} onOpen={onOpenCard} />
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
