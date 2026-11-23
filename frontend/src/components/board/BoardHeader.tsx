'use client';

import { Activity, Archive, ArrowLeft, Check, Loader2, Settings, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  BOARD_COLORS,
  getBoardColor,
  HEADER_TONE_CLASSES as TONE_CLASSES,
  isSameColor,
  type BoardTone,
} from '@/lib/boardTheme';
import type { CardFilter } from '@/lib/cardFilter';
import { cn } from '@/lib/utils';
import { useBoardStore } from '@/store/useBoardStore';
import type { Board, Tag } from '@/types';
import { BoardFilter } from './BoardFilter';

const TITLE_MAX = 255;
const DESCRIPTION_MAX = 5000;

// ============================================================
// Tiêu đề board: click để sửa
// ============================================================

function BoardTitle({ title, tone }: { title: string; tone: BoardTone }) {
  const updateBoard = useBoardStore((state) => state.updateBoard);
  const [draft, setDraft] = useState<string | null>(null); // null = chế độ xem
  /** Enter / Escape làm input unmount -> có thể kèm 1 lần blur; chặn xử lý 2 lần */
  const finishedRef = useRef(false);
  const classes = TONE_CLASSES[tone];

  const finish = (save: boolean) => {
    if (finishedRef.current || draft === null) return;
    finishedRef.current = true;
    const value = draft.trim();
    setDraft(null);
    // Rỗng hoặc không đổi -> bỏ qua, hiển thị lại tên cũ
    if (save && value && value !== title) void updateBoard({ title: value });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  };

  if (draft !== null) {
    return (
      <input
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={handleKeyDown}
        maxLength={TITLE_MAX}
        aria-label="Tên board"
        className="field-sizing-content min-w-40 max-w-full rounded-md border border-blue-500 bg-white px-1.5 py-0.5 text-lg font-bold text-gray-900 outline-none ring-2 ring-blue-500/30"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        finishedRef.current = false;
        setDraft(title);
      }}
      title="Nhấn để đổi tên board"
      className={cn(
        'max-w-full truncate rounded-md border border-transparent px-1.5 py-0.5 text-left text-lg font-bold',
        classes.text,
        tone === 'dark' ? 'hover:bg-white/20' : 'hover:bg-black/10',
      )}
    >
      {title}
    </button>
  );
}

// ============================================================
// Menu cài đặt board
// ============================================================

type MenuMode = 'closed' | 'menu' | 'confirm-delete';
type Pending = 'archive' | 'delete' | null;

function DescriptionField({ description }: { description: string | null }) {
  const updateBoard = useBoardStore((state) => state.updateBoard);
  const inputId = useId();
  // Panel mount lại mỗi lần mở menu -> nháp luôn bắt đầu từ mô tả hiện tại
  const [draft, setDraft] = useState(description ?? '');
  const isDirty = (draft.trim() || null) !== (description?.trim() || null);

  const save = () => {
    if (isDirty) void updateBoard({ description: draft });
  };

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold text-gray-600">
        Mô tả
      </label>
      <textarea
        id={inputId}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            save();
          } else if (event.key === 'Escape' && isDirty) {
            event.preventDefault(); // Escape lần 1: bỏ nháp; lần 2 (hết nháp): đóng menu
            setDraft(description ?? '');
          }
        }}
        maxLength={DESCRIPTION_MAX}
        rows={3}
        placeholder="Board này dùng để làm gì?"
        className="w-full resize-y rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
      />
      {isDirty && (
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
          >
            Lưu
          </button>
          <button
            type="button"
            onClick={() => setDraft(description ?? '')}
            className="rounded-md px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Hủy
          </button>
        </div>
      )}
    </div>
  );
}

function BoardSettingsMenu({ board, tone }: { board: Board; tone: BoardTone }) {
  const router = useRouter();
  const updateBoard = useBoardStore((state) => state.updateBoard);
  const archiveBoard = useBoardStore((state) => state.archiveBoard);
  const deleteBoard = useBoardStore((state) => state.deleteBoard);

  const [mode, setMode] = useState<MenuMode>('closed');
  const [pending, setPending] = useState<Pending>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const confirmTitleId = useId();
  const confirmDescId = useId();

  const close = () => {
    if (pending) return; // Đang lưu trữ / xoá -> giữ menu cho tới khi có kết quả
    setMode('closed');
  };

  // Click ra ngoài hoặc Escape -> đóng
  useEffect(() => {
    if (mode === 'closed') return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !pending) setMode('closed');
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || pending) return;
      setMode('closed');
      buttonRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode, pending]);

  const runDangerous = async (kind: Exclude<Pending, null>) => {
    setPending(kind);
    const ok = kind === 'archive' ? await archiveBoard() : await deleteBoard();
    if (ok) {
      // replace: board không còn xem được -> nút Back không quay lại trang chết.
      // Giữ trạng thái "đang xử lý" cho tới khi trang chủ thay thế component này.
      router.replace('/');
      return;
    }
    // Lỗi đã nằm trong actionError (banner dưới header) -> đóng menu để người dùng thấy
    setPending(null);
    setMode('closed');
  };

  const currentColor = getBoardColor(board.background);
  const isOpen = mode !== 'closed';

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? close() : setMode('menu'))}
        aria-label="Cài đặt board"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        className={cn(
          'rounded-md p-1.5',
          TONE_CLASSES[tone].button,
          isOpen && TONE_CLASSES[tone].buttonActive,
        )}
      >
        <Settings className="size-5" aria-hidden />
      </button>

      {mode === 'menu' && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Cài đặt board"
          className="absolute right-0 top-full z-30 mt-1 flex max-h-[calc(100dvh-5rem)] w-80 max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto rounded-lg bg-white p-4 shadow-xl ring-1 ring-gray-900/10"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Cài đặt board</p>
            <button
              type="button"
              onClick={close}
              aria-label="Đóng cài đặt"
              className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          {/* ---------- Màu nền ---------- */}
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-gray-600">Màu nền</legend>
            <div className="grid grid-cols-4 gap-2">
              {BOARD_COLORS.map((color) => {
                const selected = isSameColor(currentColor, color.value);
                return (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => void updateBoard({ background: color.value })}
                    aria-pressed={selected}
                    aria-label={color.name}
                    title={color.name}
                    style={{ backgroundColor: color.value }}
                    className={cn(
                      'flex h-9 items-center justify-center rounded-md shadow-sm transition hover:brightness-110',
                      selected && 'ring-2 ring-blue-600 ring-offset-2',
                    )}
                  >
                    {selected && <Check className="size-4 text-white drop-shadow" aria-hidden />}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void updateBoard({ background: null })}
              aria-pressed={currentColor === null}
              className={cn(
                'mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200',
                currentColor === null && 'ring-2 ring-blue-600',
              )}
            >
              {currentColor === null && <Check className="size-4" aria-hidden />}
              Mặc định
            </button>
          </fieldset>

          {/* ---------- Mô tả ---------- */}
          <DescriptionField description={board.description} />

          {/* ---------- Thao tác nguy hiểm ---------- */}
          <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => void runDangerous('archive')}
              disabled={pending !== null}
              className="flex items-center gap-2 rounded-md bg-gray-100 px-3 py-1.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === 'archive' ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Archive className="size-4" aria-hidden />
              )}
              Lưu trữ board
            </button>
            <button
              type="button"
              onClick={() => setMode('confirm-delete')}
              disabled={pending !== null}
              className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-1.5 text-left text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="size-4" aria-hidden />
              Xóa vĩnh viễn board
            </button>
          </div>
        </div>
      )}

      {mode === 'confirm-delete' && (
        <div
          role="alertdialog"
          aria-labelledby={confirmTitleId}
          aria-describedby={confirmDescId}
          className="absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-white p-4 shadow-xl ring-1 ring-gray-900/10"
        >
          <p id={confirmTitleId} className="break-words text-sm font-semibold text-gray-900">
            Xóa vĩnh viễn board “{board.title}”?
          </p>
          <p id={confirmDescId} className="mt-1 text-xs text-gray-600">
            Toàn bộ danh sách, thẻ và lịch sử hoạt động của board sẽ bị xóa. Thao tác này không thể hoàn tác.
            Nếu chỉ muốn ẩn đi, hãy chọn “Lưu trữ”.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => void runDangerous('delete')}
              disabled={pending !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === 'delete' && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Xóa vĩnh viễn
            </button>
            <button
              type="button"
              onClick={() => setMode('menu')}
              disabled={pending !== null}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60"
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Header
// ============================================================

interface BoardHeaderProps {
  board: Board;
  tone: BoardTone;
  /** Tag của board -> lựa chọn trong bộ lọc */
  tags: Tag[];
  filter: CardFilter;
  onFilterChange: (filter: CardFilter) => void;
  /** Drawer lịch sử hoạt động đang mở (để tô nút + aria-expanded) */
  activityOpen: boolean;
  onOpenActivity: () => void;
}

export function BoardHeader({
  board,
  tone,
  tags,
  filter,
  onFilterChange,
  activityOpen,
  onOpenActivity,
}: BoardHeaderProps) {
  const classes = TONE_CLASSES[tone];

  return (
    <header className={cn('flex shrink-0 flex-wrap items-center gap-2 px-4 py-2.5', classes.header)}>
      <Link href="/" aria-label="Về danh sách board" className={cn('shrink-0 rounded-md p-1.5', classes.button)}>
        <ArrowLeft className="size-5" aria-hidden />
      </Link>
      {/* basis-40: tiêu đề dài không đẩy nhóm nút xuống dòng; chỉ xuống dòng khi màn hình hẹp thật sự */}
      <div className="flex min-w-0 flex-1 basis-40 flex-col items-start">
        <h1 className="flex min-w-0 max-w-full">
          <BoardTitle title={board.title} tone={tone} />
        </h1>
        {board.description && (
          <p className={cn('max-w-full truncate px-1.5 text-sm', classes.subtext)} title={board.description}>
            {board.description}
          </p>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <BoardFilter tone={tone} tags={tags} filter={filter} onChange={onFilterChange} />
        <button
          type="button"
          onClick={onOpenActivity}
          aria-label="Lịch sử hoạt động"
          title="Lịch sử hoạt động"
          aria-haspopup="dialog"
          aria-expanded={activityOpen}
          className={cn('shrink-0 rounded-md p-1.5', classes.button, activityOpen && classes.buttonActive)}
        >
          <Activity className="size-5" aria-hidden />
        </button>
        <BoardSettingsMenu board={board} tone={tone} />
      </div>
    </header>
  );
}
