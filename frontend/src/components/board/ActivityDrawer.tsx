'use client';

import { Activity, AlertCircle, ChevronRight, Loader2, RotateCw, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { isApiError } from '@/lib/axios';
import { cn } from '@/lib/utils';
import * as boardApi from '@/services/api';
import { useBoardStore } from '@/store/useBoardStore';
import type { ActivityLog, BoardActivitiesResult } from '@/types';
import { ActivityEntry } from './activityFormat';

/**
 * Drawer lịch sử hoạt động toàn board (trượt từ cạnh phải).
 *
 * - Chỉ được mount khi mở -> mỗi lần mở tự tải 20 hoạt động mới nhất.
 * - Phân trang cursor: "Tải thêm" gọi tiếp với `before = nextCursor` và nối vào cuối danh sách.
 * - Mọi request dùng chung 1 AbortController: làm mới sẽ huỷ "tải thêm" đang chạy (tránh nối
 *   trang cũ vào danh sách mới); đóng drawer huỷ mọi request.
 * - Log có `cardId` và thẻ còn trên board (chưa xoá / lưu trữ) -> click để mở CardDetailModal.
 */

const PAGE_SIZE = 20;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type FeedState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | {
      status: 'ready';
      items: ActivityLog[];
      nextCursor: string | null;
      hasMore: boolean;
      /** Mốc tính "x phút trước" (không gọi Date.now() khi render) */
      loadedAt: number;
      /** Thao tác đang chạy trên danh sách đã có */
      busy: 'refresh' | 'more' | null;
      /** Lỗi khi làm mới / tải thêm — vẫn giữ danh sách đang hiển thị */
      notice: string | null;
    };

/** null = request bị huỷ (đóng drawer / bị request mới thay thế) -> bỏ qua kết quả */
type RequestResult = { ok: true; data: BoardActivitiesResult } | { ok: false; error: string } | null;

function toErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.isNotFound ? 'Board không còn tồn tại.' : error.message;
  }
  return error instanceof Error ? error.message : 'Không thể tải lịch sử hoạt động';
}

/** Nối trang mới, bỏ log trùng id (phòng khi có log mới chen vào giữa 2 lần tải) */
function appendUnique(current: ActivityLog[], incoming: ActivityLog[]): ActivityLog[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

interface ActivityDrawerProps {
  boardId: string;
  onClose: () => void;
  /** Mở modal chi tiết thẻ (caller tự đóng drawer) */
  onOpenCard: (cardId: string) => void;
}

export function ActivityDrawer({ boardId, onClose, onOpenCard }: ActivityDrawerProps) {
  const [feed, setFeed] = useState<FeedState>({ status: 'loading' });

  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  // Thẻ còn hiển thị trên board -> log của thẻ đó click được
  const lists = useBoardStore((state) => state.board?.lists);
  const cardIdsOnBoard = useMemo(
    () => new Set(lists?.flatMap((list) => list.cards.map((card) => card.id)) ?? []),
    [lists],
  );

  // ---------- Gọi API ----------
  const request = useCallback(
    async (before?: string): Promise<RequestResult> => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;

      try {
        const { data } = await boardApi.getBoardActivities(
          boardId,
          { limit: PAGE_SIZE, before },
          { signal: controller.signal },
        );
        return controller.signal.aborted ? null : { ok: true, data };
      } catch (error) {
        return controller.signal.aborted ? null : { ok: false, error: toErrorMessage(error) };
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    },
    [boardId],
  );

  /** Áp kết quả trang đầu: thành công -> thay toàn bộ; lỗi -> giữ danh sách cũ (nếu có) + báo lỗi */
  const applyFirstPage = useCallback((result: RequestResult) => {
    if (!result) return;
    if (result.ok) {
      setFeed({ status: 'ready', ...result.data, loadedAt: Date.now(), busy: null, notice: null });
      return;
    }
    setFeed((prev) =>
      prev.status === 'ready'
        ? { ...prev, busy: null, notice: `Không thể làm mới: ${result.error}` }
        : { status: 'error', error: result.error },
    );
  }, []);

  useEffect(() => {
    void request().then(applyFirstPage);
    return () => requestRef.current?.abort();
  }, [request, applyFirstPage]);

  const refresh = () => {
    if (feed.status === 'loading' || (feed.status === 'ready' && feed.busy === 'refresh')) return;
    // Lỗi -> hiện lại trạng thái tải; đã có dữ liệu -> giữ danh sách, chỉ quay icon
    setFeed((prev) => (prev.status === 'ready' ? { ...prev, busy: 'refresh', notice: null } : { status: 'loading' }));
    void request().then(applyFirstPage);
  };

  const loadMore = () => {
    if (feed.status !== 'ready' || feed.busy || !feed.hasMore || !feed.nextCursor) return;
    const cursor = feed.nextCursor;
    setFeed({ ...feed, busy: 'more', notice: null });

    void request(cursor).then((result) => {
      if (!result) return;
      setFeed((prev) => {
        if (prev.status !== 'ready') return prev;
        if (!result.ok) return { ...prev, busy: null, notice: `Không thể tải thêm: ${result.error}` };
        return {
          ...prev,
          items: appendUnique(prev.items, result.data.items),
          nextCursor: result.data.nextCursor,
          hasMore: result.data.hasMore,
          busy: null,
        };
      });
    });
  };

  // ---------- Đóng: Escape ----------
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // ---------- Focus: đưa vào drawer khi mở, trả về nút mở khi đóng ----------
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  /** Giữ Tab / Shift+Tab trong drawer */
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

  const isRefreshing = feed.status === 'loading' || (feed.status === 'ready' && feed.busy === 'refresh');

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop: click ra ngoài -> đóng */}
      <div className="absolute inset-0 bg-gray-900/50 motion-safe:animate-fade-in" onClick={onClose} aria-hidden />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapFocus}
        className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-white shadow-2xl outline-none motion-safe:animate-drawer-in"
      >
        {/* ---------- Header ---------- */}
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-3">
          <Activity className="size-5 text-gray-500" aria-hidden />
          <h2 id={titleId} className="flex-1 text-base font-semibold text-gray-900">
            Hoạt động
          </h2>
          <button
            type="button"
            onClick={refresh}
            disabled={isRefreshing}
            aria-label="Làm mới lịch sử"
            title="Làm mới"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RotateCw className={cn('size-4', isRefreshing && 'animate-spin')} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng lịch sử hoạt động"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* ---------- Nội dung ---------- */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-busy={isRefreshing}>
          {feed.status === 'loading' && (
            <div className="flex items-center gap-2 px-2 py-2 text-sm text-gray-500">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Đang tải lịch sử...
            </div>
          )}

          {feed.status === 'error' && (
            <div role="alert" className="mx-2 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{feed.error}</span>
              <button
                type="button"
                onClick={refresh}
                className="flex items-center gap-1 rounded px-2 py-0.5 font-medium hover:bg-red-100"
              >
                <RotateCw className="size-3.5" aria-hidden />
                Thử lại
              </button>
            </div>
          )}

          {feed.status === 'ready' && (
            <>
              {feed.notice && (
                <div role="alert" className="mx-2 mb-2 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{feed.notice}</span>
                </div>
              )}

              {feed.items.length === 0 ? (
                <p className="px-2 py-2 text-sm text-gray-500">Chưa có hoạt động nào.</p>
              ) : (
                <ol className="flex flex-col gap-0.5">
                  {feed.items.map((activity) => {
                    const cardId = activity.cardId;
                    const canOpen = cardId !== null && cardIdsOnBoard.has(cardId);
                    return (
                      <li key={activity.id}>
                        {canOpen ? (
                          <button
                            type="button"
                            onClick={() => onOpenCard(cardId)}
                            title="Mở thẻ"
                            className="group flex w-full gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                          >
                            <ActivityEntry activity={activity} now={feed.loadedAt} scope="board" />
                            <ChevronRight
                              className="ml-auto mt-1 size-4 shrink-0 text-gray-300 group-hover:text-gray-500"
                              aria-hidden
                            />
                          </button>
                        ) : (
                          <div className="flex gap-3 px-2 py-2 text-sm">
                            <ActivityEntry activity={activity} now={feed.loadedAt} scope="board" />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}

              {feed.hasMore ? (
                <div className="px-2 pt-3">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={feed.busy !== null}
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {feed.busy === 'more' && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    {feed.busy === 'more' ? 'Đang tải...' : 'Tải thêm'}
                  </button>
                </div>
              ) : (
                feed.items.length > 0 && (
                  <p className="px-2 pt-3 text-center text-xs text-gray-400">Đã hiển thị toàn bộ lịch sử</p>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
