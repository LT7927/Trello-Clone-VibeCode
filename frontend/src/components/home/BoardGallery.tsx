'use client';

import { AlertCircle, Archive, ArchiveRestore, LayoutGrid, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { isApiError } from '@/lib/axios';
import { DEFAULT_TILE_BACKGROUND, getBoardColor, isDarkColor } from '@/lib/boardTheme';
import { cn } from '@/lib/utils';
import { deleteBoard, getBoards, updateBoard } from '@/services/api';
import type { Board } from '@/types';
import { CreateBoardForm } from './CreateBoardForm';

type View = 'active' | 'archived';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  /** `view`: danh sách này thuộc tab nào -> rollback không chèn nhầm board sang tab khác */
  | { status: 'success'; view: View; boards: Board[] };

const TABS: { view: View; label: string }[] = [
  { view: 'active', label: 'Đang hoạt động' },
  { view: 'archived', label: 'Đã lưu trữ' },
];

function errorMessage(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback;
}

function tileStyle(board: Board) {
  const color = getBoardColor(board.background) ?? DEFAULT_TILE_BACKGROUND;
  return { color, dark: isDarkColor(color) };
}

// ============================================================
// Tile board đã lưu trữ: Khôi phục / Xóa vĩnh viễn
// ============================================================

interface ArchivedBoardTileProps {
  board: Board;
  onRestore: (board: Board) => void;
  onDelete: (board: Board) => void;
}

function ArchivedBoardTile({ board, onRestore, onDelete }: ArchivedBoardTileProps) {
  const [confirming, setConfirming] = useState(false);
  const confirmTitleId = useId();
  const { color, dark } = tileStyle(board);

  if (confirming) {
    return (
      <div
        role="alertdialog"
        aria-labelledby={confirmTitleId}
        onKeyDown={(event) => event.key === 'Escape' && setConfirming(false)}
        className="flex min-h-28 flex-col justify-between gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-red-200"
      >
        <div>
          <p id={confirmTitleId} className="line-clamp-2 break-words text-sm font-semibold text-gray-900">
            Xóa vĩnh viễn “{board.title}”?
          </p>
          <p className="mt-0.5 text-xs text-gray-600">Toàn bộ dữ liệu của board sẽ mất, không thể hoàn tác.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => onDelete(board)}
            className="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700"
          >
            Xóa
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Hủy
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ backgroundColor: color }}
      className={cn(
        'flex min-h-28 flex-col justify-between gap-2 rounded-xl p-3 shadow-sm',
        dark ? 'text-white' : 'text-gray-900',
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-semibold">
          <Archive className="size-4 shrink-0 opacity-80" aria-hidden />
          <span className="line-clamp-2 break-words">{board.title}</span>
        </p>
        {board.description && (
          <p className={cn('line-clamp-1 text-xs', dark ? 'text-white/85' : 'text-gray-700')}>{board.description}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onRestore(board)}
          className="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-gray-800 shadow-sm hover:bg-white"
        >
          <ArchiveRestore className="size-3.5" aria-hidden />
          Khôi phục
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-red-700 shadow-sm hover:bg-white"
        >
          <Trash2 className="size-3.5" aria-hidden />
          Xóa vĩnh viễn
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Gallery
// ============================================================

/** Lưới board trên trang chủ: tab "Đang hoạt động" / "Đã lưu trữ", xử lý đủ loading / lỗi / rỗng / có dữ liệu */
export function BoardGallery() {
  const [view, setView] = useState<View>('active');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  /** Lỗi khi khôi phục / xóa -> banner, danh sách vẫn giữ nguyên */
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    getBoards({ archived: view === 'archived' }, { signal: controller.signal })
      .then(({ data }) => setState({ status: 'success', view, boards: data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return; // Đổi tab / rời trang / StrictMode huỷ request -> bỏ qua
        setState({ status: 'error', message: errorMessage(error, 'Không thể tải danh sách board') });
      });

    return () => controller.abort();
  }, [view, reloadKey]);

  const changeView = (next: View) => {
    if (next === view) return;
    setState({ status: 'loading' });
    setActionError(null);
    setView(next);
  };

  const retry = () => {
    setState({ status: 'loading' });
    setReloadKey((key) => key + 1);
  };

  /** Optimistic: gỡ tile ngay, API lỗi -> chèn lại đúng vị trí cũ (nếu vẫn đang ở tab đó) */
  const removeOptimistic = async (board: Board, request: () => Promise<unknown>, fallback: string) => {
    if (state.status !== 'success') return;
    const tab = state.view;
    const index = state.boards.findIndex((b) => b.id === board.id);
    if (index === -1) return;

    setActionError(null);
    setState((prev) =>
      prev.status === 'success' ? { ...prev, boards: prev.boards.filter((b) => b.id !== board.id) } : prev,
    );

    try {
      await request();
    } catch (error) {
      // 404 khi xóa: board đã không còn -> kết quả cuối cùng vẫn đúng
      if (isApiError(error) && error.isNotFound) return;
      setState((prev) => {
        if (prev.status !== 'success' || prev.view !== tab || prev.boards.some((b) => b.id === board.id)) {
          return prev;
        }
        const at = Math.min(index, prev.boards.length);
        return { ...prev, boards: [...prev.boards.slice(0, at), board, ...prev.boards.slice(at)] };
      });
      setActionError(errorMessage(error, fallback));
    }
  };

  const handleRestore = (board: Board) =>
    void removeOptimistic(board, () => updateBoard(board.id, { isArchived: false }), 'Không thể khôi phục board');

  const handleDelete = (board: Board) =>
    void removeOptimistic(board, () => deleteBoard(board.id), 'Không thể xóa board');

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Lọc board" className="flex w-fit gap-1 rounded-lg bg-gray-200 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.view}
            type="button"
            role="tab"
            aria-selected={view === tab.view}
            onClick={() => changeView(tab.view)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              view === tab.view ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900',
            )}
          >
            {tab.view === 'archived' && <Archive className="size-4" aria-hidden />}
            {tab.label}
          </button>
        ))}
      </div>

      {actionError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Đóng thông báo"
            className="rounded p-0.5 hover:bg-red-100"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      <div role="tabpanel">
        <GalleryContent
          view={view}
          state={state}
          onRetry={retry}
          onRestore={handleRestore}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

interface GalleryContentProps {
  view: View;
  state: LoadState;
  onRetry: () => void;
  onRestore: (board: Board) => void;
  onDelete: (board: Board) => void;
}

function GalleryContent({ view, state, onRetry, onRestore, onDelete }: GalleryContentProps) {
  if (state.status === 'loading') {
    return (
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Đang tải board">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="h-28 animate-pulse rounded-xl bg-gray-200" />
        ))}
      </ul>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-12 text-center shadow-sm ring-1 ring-gray-900/5">
        <AlertCircle className="size-8 text-red-500" aria-hidden />
        <p className="text-sm text-gray-700">{state.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (view === 'archived') {
    if (state.boards.length === 0) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-white/60 px-6 py-16 text-center">
          <div className="rounded-full bg-gray-100 p-4">
            <Archive className="size-8 text-gray-500" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Không có board nào đã lưu trữ</h2>
            <p className="mt-1 text-sm text-gray-600">
              Board được lưu trữ từ trang cài đặt board sẽ xuất hiện ở đây để bạn khôi phục hoặc xóa.
            </p>
          </div>
        </div>
      );
    }

    return (
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {state.boards.map((board) => (
          <li key={board.id}>
            <ArchivedBoardTile board={board} onRestore={onRestore} onDelete={onDelete} />
          </li>
        ))}
      </ul>
    );
  }

  if (state.boards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-gray-300 bg-white/60 px-6 py-16 text-center">
        <div className="rounded-full bg-blue-50 p-4">
          <LayoutGrid className="size-8 text-blue-600" aria-hidden />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Chưa có board nào</h2>
          <p className="mt-1 text-sm text-gray-600">Tạo board đầu tiên để bắt đầu sắp xếp công việc.</p>
        </div>
        <CreateBoardForm variant="cta" />
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {state.boards.map((board) => {
        const { color, dark } = tileStyle(board);
        return (
          <li key={board.id}>
            <Link
              href={`/boards/${board.id}`}
              style={{ backgroundColor: color }}
              className={cn(
                'flex h-28 flex-col justify-between rounded-xl p-3 shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600',
                dark ? 'text-white' : 'text-gray-900',
              )}
            >
              <span className={cn('line-clamp-2 font-semibold', dark && 'drop-shadow-sm')}>{board.title}</span>
              {board.description && (
                <span className={cn('line-clamp-1 text-xs', dark ? 'text-white/85' : 'text-gray-700')}>
                  {board.description}
                </span>
              )}
            </Link>
          </li>
        );
      })}
      <li>
        <CreateBoardForm />
      </li>
    </ul>
  );
}
