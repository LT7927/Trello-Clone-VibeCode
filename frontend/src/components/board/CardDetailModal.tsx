'use client';

import {
  Activity,
  AlertCircle,
  AlignLeft,
  Archive,
  CalendarClock,
  CheckCircle2,
  Circle,
  Loader2,
  RotateCw,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { isApiError } from '@/lib/axios';
import * as boardApi from '@/services/api';
import { findCard, useBoardStore } from '@/store/useBoardStore';
import type { ActivityLog, CardDetails, UpdateCardPayload } from '@/types';

/**
 * Modal chi tiết card.
 *
 * Nguồn dữ liệu:
 * - Field sửa được (title, description, dueDate, isCompleted, tags) đọc TRỰC TIẾP từ store
 *   -> sửa ở đây là thấy ngay trên board (Optimistic UI) và ngược lại.
 * - GET /cards/:id cung cấp danh sách activity + tên list; lần tải đầu tiên còn đồng bộ ngược
 *   các field vào store (phòng khi board đang giữ dữ liệu cũ).
 * - Sau mỗi lần sửa thành công -> tải lại ngầm để lịch sử hoạt động luôn mới.
 */

const TITLE_MAX = 500;
const DESCRIPTION_MAX = 10_000;

// ============================================================
// Format ngày giờ
// ============================================================

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const dueDateFormatter = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const relativeFormatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });

/** "Vừa xong", "5 phút trước", "3 giờ trước", "Hôm qua"... quá 7 ngày -> ngày giờ đầy đủ */
function formatRelativeTime(iso: string, now: number): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  const seconds = Math.round((now - time) / 1000);

  if (seconds < 45) return 'Vừa xong';
  let text: string;
  if (seconds < 3600) text = relativeFormatter.format(-Math.max(1, Math.round(seconds / 60)), 'minute');
  else if (seconds < 86_400) text = relativeFormatter.format(-Math.round(seconds / 3600), 'hour');
  else if (seconds < 7 * 86_400) text = relativeFormatter.format(-Math.round(seconds / 86_400), 'day');
  else return dateTimeFormatter.format(time);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** ISO -> "YYYY-MM-DD" theo giờ địa phương (giá trị của <input type="date">) */
function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * "YYYY-MM-DD" -> ISO. Lấy 12:00 giờ địa phương: người xem ở múi giờ lệch ±11h vẫn thấy đúng ngày.
 * Trả về null nếu chưa nhập xong (vd: đang gõ năm "0202" -> bỏ qua để không gọi API liên tục).
 */
function fromDateInputValue(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1900) return null;
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// ============================================================
// Mô tả activity bằng tiếng Việt
// ============================================================

const FIELD_LABELS: Record<string, string> = {
  title: 'tiêu đề',
  description: 'mô tả',
  dueDate: 'ngày hết hạn',
};

function metaString(metadata: ActivityLog['metadata'], key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function joinVietnamese(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} và ${items[items.length - 1]}`;
}

function Quote({ children }: { children: ReactNode }) {
  return <span className="font-medium text-gray-900">“{children}”</span>;
}

function describeActivity(activity: ActivityLog): ReactNode {
  const { metadata } = activity;

  switch (activity.action) {
    case 'CARD_CREATED': {
      const listTitle = metaString(metadata, 'listTitle');
      return listTitle ? (
        <>
          Đã tạo thẻ trong danh sách <Quote>{listTitle}</Quote>
        </>
      ) : (
        'Đã tạo thẻ'
      );
    }

    case 'CARD_UPDATED': {
      const oldTitle = metaString(metadata, 'oldTitle');
      const newTitle = metaString(metadata, 'newTitle');
      const changed = Array.isArray(metadata?.changedFields)
        ? metadata.changedFields.filter((f): f is string => typeof f === 'string')
        : [];
      const others = changed.filter((f) => f !== 'title').map((f) => FIELD_LABELS[f] ?? f);

      if (oldTitle && newTitle) {
        return (
          <>
            Đã đổi tiêu đề từ <Quote>{oldTitle}</Quote> thành <Quote>{newTitle}</Quote>
            {others.length > 0 && `, đồng thời cập nhật ${joinVietnamese(others)}`}
          </>
        );
      }
      const labels = changed.map((f) => FIELD_LABELS[f] ?? f);
      return labels.length > 0 ? `Đã cập nhật ${joinVietnamese(labels)}` : 'Đã cập nhật thẻ';
    }

    case 'CARD_COMPLETED':
      return 'Đã đánh dấu thẻ là hoàn thành';
    case 'CARD_UNCOMPLETED':
      return 'Đã bỏ đánh dấu hoàn thành';
    case 'CARD_ARCHIVED':
      return 'Đã lưu trữ thẻ';
    case 'CARD_RESTORED':
      return 'Đã khôi phục thẻ từ lưu trữ';

    case 'CARD_MOVED': {
      const from = metaString(metadata, 'fromListTitle');
      const to = metaString(metadata, 'toListTitle');
      if (from && to) {
        return (
          <>
            Đã chuyển thẻ từ <Quote>{from}</Quote> sang <Quote>{to}</Quote>
          </>
        );
      }
      return to ? (
        <>
          Đã chuyển thẻ sang <Quote>{to}</Quote>
        </>
      ) : (
        'Đã di chuyển thẻ'
      );
    }

    case 'CARD_DELETED':
      return 'Đã xóa thẻ';

    default:
      return `Hoạt động: ${activity.action}`;
  }
}

function activityIcon(action: string) {
  if (action === 'CARD_COMPLETED') return <CheckCircle2 className="size-3.5 text-green-600" aria-hidden />;
  if (action === 'CARD_ARCHIVED') return <Archive className="size-3.5 text-amber-600" aria-hidden />;
  if (action === 'CARD_DELETED') return <Trash2 className="size-3.5 text-red-600" aria-hidden />;
  return <span className="size-1.5 rounded-full bg-gray-400" aria-hidden />;
}

// ============================================================
// Các khối con
// ============================================================

/** Tiêu đề sửa inline: Enter / blur -> lưu, Escape -> huỷ (không đóng modal) */
function TitleEditor({ title, onSave }: { title: string; onSave: (title: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null); // null = không sửa -> hiển thị title từ store
  const cancelledRef = useRef(false);

  const commit = () => {
    if (draft === null) return;
    const value = draft.replace(/\s+/g, ' ').trim();
    setDraft(null);
    if (!cancelledRef.current && value && value !== title) onSave(value);
    cancelledRef.current = false;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault(); // Tiêu đề 1 dòng
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault(); // Báo cho modal: Escape đã được xử lý
      cancelledRef.current = true;
      event.currentTarget.blur();
    }
  };

  return (
    <textarea
      value={draft ?? title}
      onFocus={() => {
        cancelledRef.current = false;
        setDraft(title);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      rows={1}
      maxLength={TITLE_MAX}
      aria-label="Tiêu đề thẻ"
      className="field-sizing-content w-full resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-lg font-semibold text-gray-900 outline-none hover:bg-gray-100 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/30"
    />
  );
}

function DescriptionEditor({
  description,
  onSave,
}: {
  description: string | null;
  onSave: (description: string | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null); // null = chế độ xem

  const save = () => {
    if (draft === null) return;
    const value = draft.trim() || null;
    setDraft(null);
    if (value !== (description?.trim() || null)) onSave(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(null);
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save();
    }
  };

  if (draft === null) {
    return description ? (
      <button
        type="button"
        onClick={() => setDraft(description)}
        title="Nhấn để sửa mô tả"
        className="block w-full whitespace-pre-wrap break-words rounded-md px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-100"
      >
        {description}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setDraft('')}
        className="block w-full rounded-md bg-gray-100 px-3 py-3 text-left text-sm text-gray-500 hover:bg-gray-200"
      >
        Thêm mô tả chi tiết hơn...
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={DESCRIPTION_MAX}
        placeholder="Thêm mô tả chi tiết hơn..."
        aria-label="Mô tả thẻ"
        className="field-sizing-content min-h-28 w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Lưu
        </button>
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Hủy
        </button>
        <span className="ml-auto text-xs text-gray-400">Ctrl + Enter để lưu</span>
      </div>
    </div>
  );
}

function DueDateEditor({
  dueDate,
  isCompleted,
  now,
  onChange,
}: {
  dueDate: string | null;
  isCompleted: boolean;
  /** null -> chưa biết giờ hiện tại (chưa tải xong), chưa hiển thị trạng thái quá hạn */
  now: number | null;
  onChange: (dueDate: string | null) => void;
}) {
  const inputId = useId();
  // Bản nháp trong lúc gõ dở (vd: năm "0202") -> input không bị nhảy về giá trị từ store
  const [draft, setDraft] = useState<string | null>(null);
  const isOverdue = dueDate !== null && now !== null && !isCompleted && new Date(dueDate).getTime() < now;

  return (
    <div>
      <label htmlFor={inputId} className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
        <CalendarClock className="size-3.5" aria-hidden />
        Ngày hết hạn
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={inputId}
          type="date"
          value={draft ?? toDateInputValue(dueDate)}
          onChange={(event) => {
            const { value } = event.target;
            setDraft(value);
            if (value === '') {
              if (dueDate !== null) onChange(null);
              return;
            }
            const iso = fromDateInputValue(value);
            if (iso && toDateInputValue(iso) !== toDateInputValue(dueDate)) onChange(iso);
          }}
          onBlur={() => setDraft(null)}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
        />
        {dueDate && (
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              onChange(null);
            }}
            aria-label="Xóa ngày hết hạn"
            title="Xóa ngày hết hạn"
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
        {isOverdue && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">Quá hạn</span>
        )}
        {dueDate && isCompleted && (
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">Đã xong</span>
        )}
      </div>
      {dueDate && <p className="mt-1 text-xs capitalize text-gray-500">{dueDateFormatter.format(new Date(dueDate))}</p>}
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
      {icon}
      {children}
    </h3>
  );
}

// ============================================================
// Modal
// ============================================================

type DetailsState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  /** `loadedAt`: mốc thời gian để tính "x phút trước" (không gọi Date.now() khi render) */
  | { status: 'success'; data: CardDetails; loadedAt: number };

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface CardDetailModalProps {
  cardId: string;
  onClose: () => void;
}

export function CardDetailModal({ cardId, onClose }: CardDetailModalProps) {
  const card = useBoardStore((state) => findCard(state.board, cardId));
  const listTitle = useBoardStore(
    (state) => state.board?.lists.find((l) => l.cards.some((c) => c.id === cardId))?.title,
  );
  const editCard = useBoardStore((state) => state.editCard);
  const deleteCard = useBoardStore((state) => state.deleteCard);

  const [details, setDetails] = useState<DetailsState>({ status: 'loading' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  /** Đã sửa gì trong modal chưa -> nếu rồi thì không ghi đè store bằng dữ liệu tải về (tránh mất optimistic) */
  const editedRef = useRef(false);
  /** Nơi bắt đầu mousedown -> chỉ đóng khi cả mousedown và click đều ở backdrop (bôi đen text kéo ra ngoài không đóng) */
  const pointerDownOnBackdrop = useRef(false);

  // ---------- Tải chi tiết ----------
  /**
   * Gọi API, trả về state mới cho `details` (không tự setState).
   * null = bỏ qua kết quả: request đã bị huỷ / bị request mới thay thế, hoặc tải ngầm thất bại.
   */
  const fetchDetails = useCallback(
    async (silent: boolean): Promise<DetailsState | null> => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;

      try {
        const { data } = await boardApi.getCardDetails(cardId, { signal: controller.signal });
        if (controller.signal.aborted) return null;

        if (!editedRef.current) {
          // Lần đầu mở: đồng bộ field mới nhất từ server vào board
          const current = findCard(useBoardStore.getState().board, cardId);
          if (current && current.updatedAt !== data.updatedAt) {
            useBoardStore.getState().updateCard(cardId, {
              title: data.title,
              description: data.description,
              dueDate: data.dueDate,
              isCompleted: data.isCompleted,
              isArchived: data.isArchived,
              tags: data.tags,
              updatedAt: data.updatedAt,
            });
          }
        }
        return { status: 'success', data, loadedAt: Date.now() };
      } catch (error) {
        if (controller.signal.aborted) return null;
        // Tải lại ngầm thất bại -> giữ lịch sử đang có, không làm phiền user
        if (silent) return null;
        const message =
          isApiError(error) && error.isNotFound
            ? 'Thẻ không còn tồn tại hoặc chưa được lưu xong.'
            : isApiError(error) || error instanceof Error
              ? error.message
              : 'Không thể tải chi tiết thẻ';
        return { status: 'error', error: message };
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    },
    [cardId],
  );

  const loadDetails = useCallback(
    (silent: boolean) =>
      fetchDetails(silent).then((next) => {
        if (next) setDetails(next);
      }),
    [fetchDetails],
  );

  useEffect(() => {
    void fetchDetails(false).then((next) => {
      if (next) setDetails(next);
    });
    return () => requestRef.current?.abort();
  }, [fetchDetails]);

  const retry = () => {
    setDetails({ status: 'loading' });
    void loadDetails(false);
  };

  // ---------- Đóng modal: Escape ----------
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      // Ô nhập bên trong đã tự xử lý Escape (huỷ sửa) -> không đóng modal
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (confirmDelete) setConfirmDelete(false);
      else onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [confirmDelete, onClose]);

  // ---------- Focus: đưa vào modal khi mở, trả về chỗ cũ khi đóng ----------
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  /** Giữ Tab / Shift+Tab trong modal */
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const activeEl = document.activeElement;

    if (event.shiftKey && (activeEl === first || activeEl === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeEl === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    pointerDownOnBackdrop.current = event.target === event.currentTarget;
  };
  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (pointerDownOnBackdrop.current && event.target === event.currentTarget) onClose();
    pointerDownOnBackdrop.current = false;
  };

  // ---------- Thao tác ----------
  const save = (payload: UpdateCardPayload) => {
    editedRef.current = true;
    void editCard(cardId, payload).then((ok) => {
      if (ok) void loadDetails(true); // Cập nhật lịch sử hoạt động
    });
  };

  const handleArchive = () => {
    onClose(); // Card biến mất khỏi board ngay (optimistic); lỗi -> store đưa card về + báo lỗi
    void editCard(cardId, { isArchived: true });
  };

  const handleDelete = () => {
    onClose();
    void deleteCard(cardId);
  };

  // Card vừa biến mất khỏi store (bị xoá / lưu trữ) -> KanbanBoard sẽ gỡ modal ngay sau đó
  if (!card) return null;

  const loadedData = details.status === 'success' ? details.data : null;
  const now = details.status === 'success' ? details.loadedAt : null;
  const parentListTitle = listTitle ?? loadedData?.list.title;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/60 p-4 sm:py-12"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapFocus}
        className="relative w-full max-w-3xl rounded-xl bg-white shadow-2xl outline-none"
      >
        {/* ---------- Header ---------- */}
        <div className="flex items-start gap-2 border-b border-gray-100 px-4 pb-3 pt-4 sm:px-6">
          <button
            type="button"
            onClick={() => save({ isCompleted: !card.isCompleted })}
            aria-pressed={card.isCompleted}
            aria-label={card.isCompleted ? 'Bỏ đánh dấu hoàn thành' : 'Đánh dấu hoàn thành'}
            title={card.isCompleted ? 'Bỏ đánh dấu hoàn thành' : 'Đánh dấu hoàn thành'}
            className="mt-1.5 shrink-0 rounded-full text-gray-400 hover:text-green-600"
          >
            {card.isCompleted ? (
              <CheckCircle2 className="size-5 text-green-600" aria-hidden />
            ) : (
              <Circle className="size-5" aria-hidden />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="sr-only">
              {card.title}
            </h2>
            <TitleEditor title={card.title} onSave={(title) => save({ title })} />
            {parentListTitle && (
              <p className="px-1.5 text-xs text-gray-500">
                trong danh sách <span className="font-medium text-gray-700">{parentListTitle}</span>
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="grid gap-6 px-4 py-4 sm:px-6 md:grid-cols-[1fr_12rem]">
          {/* ---------- Cột chính ---------- */}
          <div className="flex min-w-0 flex-col gap-6">
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-600">Trạng thái</p>
                <button
                  type="button"
                  onClick={() => save({ isCompleted: !card.isCompleted })}
                  aria-pressed={card.isCompleted}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium ring-1',
                    card.isCompleted
                      ? 'bg-green-50 text-green-700 ring-green-200 hover:bg-green-100'
                      : 'bg-gray-50 text-gray-700 ring-gray-200 hover:bg-gray-100',
                  )}
                >
                  {card.isCompleted ? (
                    <CheckCircle2 className="size-4" aria-hidden />
                  ) : (
                    <Circle className="size-4" aria-hidden />
                  )}
                  {card.isCompleted ? 'Đã hoàn thành' : 'Chưa hoàn thành'}
                </button>
              </div>

              <DueDateEditor
                dueDate={card.dueDate}
                isCompleted={card.isCompleted}
                now={now}
                onChange={(dueDate) => save({ dueDate })}
              />
            </div>

            {card.tags.length > 0 && (
              <section>
                <SectionTitle icon={<Tags className="size-4 text-gray-500" aria-hidden />}>Nhãn</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {card.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded px-2 py-0.5 text-xs font-medium text-white shadow-sm"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionTitle icon={<AlignLeft className="size-4 text-gray-500" aria-hidden />}>Mô tả</SectionTitle>
              <DescriptionEditor description={card.description} onSave={(description) => save({ description })} />
            </section>

            <section>
              <SectionTitle icon={<Activity className="size-4 text-gray-500" aria-hidden />}>
                Lịch sử hoạt động
              </SectionTitle>
              <ActivityFeed details={details} onRetry={retry} />
            </section>
          </div>

          {/* ---------- Cột thao tác ---------- */}
          <aside className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-600">Thao tác</p>
            {confirmDelete ? (
              <div role="alertdialog" aria-label="Xác nhận xóa thẻ" className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200">
                <p className="text-sm font-semibold text-red-800">Xóa thẻ này?</p>
                <p className="mt-1 text-xs text-red-700">
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
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-red-100"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleArchive}
                  className="flex items-center gap-2 rounded-md bg-gray-100 px-3 py-1.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  <Archive className="size-4" aria-hidden />
                  Lưu trữ thẻ
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-1.5 text-left text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="size-4" aria-hidden />
                  Xóa thẻ
                </button>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function ActivityFeed({ details, onRetry }: { details: DetailsState; onRetry: () => void }) {
  if (details.status === 'loading') {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Đang tải lịch sử...
      </div>
    );
  }

  if (details.status === 'error') {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        <AlertCircle className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">{details.error}</span>
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1 rounded px-2 py-0.5 font-medium hover:bg-red-100"
        >
          <RotateCw className="size-3.5" aria-hidden />
          Thử lại
        </button>
      </div>
    );
  }

  const { activities } = details.data;
  if (activities.length === 0) return <p className="text-sm text-gray-500">Chưa có hoạt động nào.</p>;

  return (
    <ol className="flex flex-col gap-3">
      {activities.map((activity) => (
        <li key={activity.id} className="flex gap-3 text-sm">
          <span className="mt-1.5 flex size-4 shrink-0 items-center justify-center">
            {activityIcon(activity.action)}
          </span>
          <div className="min-w-0">
            <p className="break-words text-gray-700">{describeActivity(activity)}</p>
            <time
              dateTime={activity.createdAt}
              title={dateTimeFormatter.format(new Date(activity.createdAt))}
              className="text-xs text-gray-500"
            >
              {formatRelativeTime(activity.createdAt, details.loadedAt)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
