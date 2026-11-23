'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DroppableContainer,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { AlertCircle, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { getBoardColor, getBoardTone } from '@/lib/boardTheme';
import { cn } from '@/lib/utils';
import { useBoardStore } from '@/store/useBoardStore';
import type { CardWithTags, ListWithCards } from '@/types';
import { BoardHeader } from './BoardHeader';
import { BoardLoading } from './BoardLoading';
import { CardDetailModal } from './CardDetailModal';
import { getDragType, type DragItemType } from './dnd';
import { InlineAddForm } from './InlineAddForm';
import { CardPreview } from './KanbanCard';
import { KanbanList, ListPreview } from './KanbanList';

/**
 * Lắp ráp @dnd-kit (tránh lỗi nested context):
 *
 *   DndContext                         <- DUY NHẤT 1 cái cho cả board
 *   └─ SortableContext (lists, ngang)
 *      └─ KanbanList  (useSortable, type 'list')
 *         └─ SortableContext (cards của list đó, dọc)
 *            └─ KanbanCard (useSortable, type 'card')
 *   └─ DragOverlay
 *
 * - SortableContext lồng nhau trong cùng 1 DndContext là hợp lệ. KHÔNG lồng DndContext:
 *   context trong sẽ "nuốt" card và card không thể sang list khác.
 * - Khi kéo card sang list khác, `onDragOver` chỉ cập nhật bản xem trước `cardOrder` (state cục bộ),
 *   store chưa bị đụng tới. Chỉ `onDragEnd` mới gọi `moveCard` / `moveList` -> 1 lần thả = 1 snapshot + 1 API.
 */

/** listId -> mảng cardId, chỉ tồn tại trong lúc đang kéo card */
type CardOrder = Record<string, string[]>;

type ActiveDrag = { type: DragItemType; id: string };

const EMPTY_LISTS: ListWithCards[] = [];

function findListId(order: CardOrder, cardId: string): string | undefined {
  return Object.keys(order).find((listId) => order[listId].includes(cardId));
}

const containerType = (container: DroppableContainer | undefined) =>
  getDragType(container?.data.current);

export function KanbanBoard({ boardId }: { boardId: string }) {
  const board = useBoardStore((state) => state.board);
  const status = useBoardStore((state) => state.status);
  const error = useBoardStore((state) => state.error);
  const actionError = useBoardStore((state) => state.actionError);
  const fetchBoard = useBoardStore((state) => state.fetchBoard);
  const reset = useBoardStore((state) => state.reset);
  const clearActionError = useBoardStore((state) => state.clearActionError);
  const moveCard = useBoardStore((state) => state.moveCard);
  const moveList = useBoardStore((state) => state.moveList);
  const createList = useBoardStore((state) => state.createList);

  useEffect(() => {
    void fetchBoard(boardId);
    return () => reset();
  }, [boardId, fetchBoard, reset]);

  // ---------- Trạng thái kéo thả cục bộ ----------
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [cardOrder, setCardOrder] = useState<CardOrder | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);

  // ---------- Modal chi tiết card ----------
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const closeCardModal = useCallback(() => setOpenCardId(null), []);
  const recentlyMovedToNewList = useRef(false);

  // Sau khi card đổi list, layout dịch chuyển -> bỏ qua 1 frame collision để tránh nhảy qua lại
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      recentlyMovedToNewList.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [cardOrder]);

  const lists = board?.lists ?? EMPTY_LISTS;
  const listIds = useMemo(() => lists.map((list) => list.id), [lists]);

  const cardsById = useMemo(
    () => new Map(lists.flatMap((list) => list.cards.map((card) => [card.id, card] as const))),
    [lists],
  );

  /** Card hiển thị cho từng list: lấy từ bản xem trước nếu đang kéo card, ngược lại lấy từ store */
  const cardsByList = useMemo(() => {
    const result: Record<string, CardWithTags[]> = {};
    for (const list of lists) {
      const previewIds = cardOrder?.[list.id];
      result[list.id] = previewIds
        ? previewIds.flatMap((id) => {
            const card = cardsById.get(id);
            return card ? [card] : [];
          })
        : list.cards;
    }
    return result;
  }, [lists, cardOrder, cardsById]);

  // ---------- Sensors ----------
  const dndId = useId(); // id ổn định giữa server/client -> tránh lỗi hydration aria-describedby
  const sensors = useSensors(
    // distance: phải kéo > 5px mới bắt đầu kéo -> click vào card/nút vẫn hoạt động
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // delay: giữ 200ms mới kéo -> vuốt để cuộn trên mobile vẫn hoạt động
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ---------- Collision detection ----------
  const collisionDetection: CollisionDetection = useCallback((args) => {
    // Kéo list: chỉ xét các list, bỏ qua card bên trong
    if (getDragType(args.active.data.current) === 'list') {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => containerType(c) === 'list'),
      });
    }

    // Kéo card: ưu tiên card dưới con trỏ, sau đó tới list chứa con trỏ
    const pointerHits = pointerWithin(args);
    const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args);
    const cardHit = hits.find((hit) => containerType(hit.data?.droppableContainer) === 'card');
    let overId = cardHit ? cardHit.id : getFirstCollision(hits, 'id');

    if (overId != null) {
      const overContainer = args.droppableContainers.find((c) => c.id === overId);
      if (containerType(overContainer) === 'list') {
        // Con trỏ ở vùng trống của list -> nhắm tới card gần nhất trong list đó (nếu có)
        const cardsInList = args.droppableContainers.filter(
          (c) => containerType(c) === 'card' && c.data.current?.listId === overId,
        );
        if (cardsInList.length > 0) {
          overId = closestCenter({ ...args, droppableContainers: cardsInList })[0]?.id ?? overId;
        }
      }
      lastOverId.current = overId;
      return [{ id: overId }];
    }

    // Layout vừa đổi khiến không có va chạm -> giữ mục tiêu cũ thay vì trả rỗng (tránh giật)
    if (recentlyMovedToNewList.current) lastOverId.current = args.active.id;
    return lastOverId.current != null ? [{ id: lastOverId.current }] : [];
  }, []);

  // ---------- Handlers ----------
  const resetDrag = () => {
    setActive(null);
    setCardOrder(null);
    lastOverId.current = null;
  };

  const handleDragStart = ({ active: dragged }: DragStartEvent) => {
    const type = getDragType(dragged.data.current);
    if (!type) return;

    if (type === 'card') {
      setCardOrder(Object.fromEntries(lists.map((list) => [list.id, list.cards.map((c) => c.id)])));
    }
    setActive({ type, id: String(dragged.id) });
  };

  /** Chỉ xử lý card đổi list. Sắp xếp trong cùng list do SortableContext tự hiển thị. */
  const handleDragOver = ({ active: dragged, over }: DragOverEvent) => {
    if (!over || getDragType(dragged.data.current) !== 'card') return;

    const activeId = String(dragged.id);
    const overId = String(over.id);

    setCardOrder((prev) => {
      if (!prev) return prev;

      const fromListId = findListId(prev, activeId);
      const toListId = getDragType(over.data.current) === 'list' ? overId : findListId(prev, overId);
      if (!fromListId || !toListId || fromListId === toListId) return prev;

      const target = prev[toListId];
      let index = target.length; // Thả vào vùng trống của list -> cuối list
      if (overId !== toListId) {
        const overIndex = target.indexOf(overId);
        const translated = dragged.rect.current.translated;
        const isBelowOver = translated !== null && translated.top > over.rect.top + over.rect.height / 2;
        index = overIndex === -1 ? target.length : overIndex + (isBelowOver ? 1 : 0);
      }

      recentlyMovedToNewList.current = true;
      return {
        ...prev,
        [fromListId]: prev[fromListId].filter((id) => id !== activeId),
        [toListId]: [...target.slice(0, index), activeId, ...target.slice(index)],
      };
    });
  };

  const handleDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    const type = getDragType(dragged.data.current);
    const order = cardOrder;

    // Thả ra ngoài mọi vùng hợp lệ -> huỷ, không gọi API
    if (!over) {
      resetDrag();
      return;
    }

    if (type === 'list') {
      const listId = String(dragged.id);
      // toIndex của store tính trên mảng đã bỏ list đang kéo == vị trí của over sau arrayMove
      const toIndex = listIds.indexOf(String(over.id));
      if (toIndex !== -1 && over.id !== dragged.id) void moveList({ listId, toIndex });
    }

    if (type === 'card' && order) {
      const cardId = String(dragged.id);
      const toListId = findListId(order, cardId);
      if (toListId) {
        let items = order[toListId];
        // Sắp xếp trong list đích (SortableContext chỉ dịch chuyển bằng transform, chưa đổi mảng)
        if (getDragType(over.data.current) === 'card' && over.id !== dragged.id) {
          const overIndex = items.indexOf(String(over.id));
          if (overIndex !== -1) items = arrayMove(items, items.indexOf(cardId), overIndex);
        }
        // Store tự bỏ qua nếu card không đổi chỗ (không gọi API)
        void moveCard({ cardId, toListId, toIndex: items.indexOf(cardId) });
      }
    }

    // moveX đã cập nhật store đồng bộ (optimistic) trước khi xoá bản xem trước -> không bị nháy
    resetDrag();
  };

  // ---------- Render ----------
  if (!board) {
    if (status === 'error') {
      return (
        <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-gray-100 p-4 text-center">
          <AlertCircle className="size-8 text-red-500" aria-hidden />
          <p className="text-sm text-gray-700">{error ?? 'Không thể tải board'}</p>
          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Về trang chủ
            </Link>
            <button
              type="button"
              onClick={() => void fetchBoard(boardId)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Thử lại
            </button>
          </div>
        </div>
      );
    }
    return <BoardLoading />;
  }

  const activeList = active?.type === 'list' ? lists.find((l) => l.id === active.id) : undefined;
  const activeCard = active?.type === 'card' ? cardsById.get(active.id) : undefined;
  const boardColor = getBoardColor(board.background);
  const tone = getBoardTone(board.background);
  // Card không còn trên board (bị xoá / lưu trữ / tải lại) -> tự gỡ modal
  const selectedCardId = openCardId && cardsById.has(openCardId) ? openCardId : null;

  return (
    <div
      className={cn('flex h-dvh flex-col transition-colors', !boardColor && 'bg-gray-100')}
      style={boardColor ? { backgroundColor: boardColor } : undefined}
    >
      <BoardHeader board={board} tone={tone} />

      {actionError && (
        <div
          role="alert"
          className="mx-4 my-2 flex shrink-0 items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{actionError}</span>
          <button type="button" onClick={clearActionError} aria-label="Đóng thông báo" className="rounded p-0.5 hover:bg-red-100">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={collisionDetection}
        // Đo lại vị trí droppable liên tục: card đổi list làm layout thay đổi giữa lúc kéo
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={resetDrag}
      >
        {/* Cuộn ngang toàn board; mỗi list tự cuộn dọc bên trong */}
        <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto px-4 pb-4 pt-3">
          <SortableContext items={listIds} strategy={horizontalListSortingStrategy}>
            {lists.map((list) => (
              <KanbanList
                key={list.id}
                list={list}
                cards={cardsByList[list.id]}
                onOpenCard={setOpenCardId}
              />
            ))}
          </SortableContext>

          {/* Trên nền màu: nền trắng mờ để chữ xám của form vẫn đủ tương phản */}
          <div className={cn('w-72 shrink-0 rounded-xl p-2', boardColor ? 'bg-white/75' : 'bg-gray-200/70')}>
            <InlineAddForm
              label="Thêm danh sách"
              placeholder="Nhập tiêu đề danh sách..."
              submitLabel="Thêm danh sách"
              onSubmit={createList}
            />
          </div>
        </div>

        <DragOverlay>
          {activeList && <ListPreview list={activeList} cards={activeList.cards} />}
          {activeCard && <CardPreview card={activeCard} className="rotate-2 cursor-grabbing shadow-lg" />}
        </DragOverlay>
      </DndContext>

      {/* key: đổi card -> mount lại modal, state (nháp, lịch sử) không bị lẫn giữa các card */}
      {selectedCardId && (
        <CardDetailModal key={selectedCardId} cardId={selectedCardId} onClose={closeCardModal} />
      )}
    </div>
  );
}
