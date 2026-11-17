'use client';

import { AlertCircle, LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isApiError } from '@/lib/axios';
import { getBoards } from '@/services/api';
import type { Board } from '@/types';
import { CreateBoardForm } from './CreateBoardForm';

/** `background` là chuỗi tự do -> chỉ dùng khi là mã màu hex hợp lệ */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const DEFAULT_BACKGROUND = '#0079BF';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; boards: Board[] };

/** Lưới board trên trang chủ: tải qua GET /boards, xử lý đủ 4 trạng thái loading / lỗi / rỗng / có dữ liệu */
export function BoardGallery() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    getBoards({}, { signal: controller.signal })
      .then(({ data }) => setState({ status: 'success', boards: data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return; // Rời trang / StrictMode huỷ request -> bỏ qua
        setState({
          status: 'error',
          message: isApiError(error) ? error.message : 'Không thể tải danh sách board',
        });
      });

    return () => controller.abort();
  }, [reloadKey]);

  const retry = () => {
    setState({ status: 'loading' });
    setReloadKey((key) => key + 1);
  };

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
          onClick={retry}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Thử lại
        </button>
      </div>
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
      {state.boards.map((board) => (
        <li key={board.id}>
          <Link
            href={`/boards/${board.id}`}
            style={{
              backgroundColor:
                board.background && HEX_COLOR.test(board.background) ? board.background : DEFAULT_BACKGROUND,
            }}
            className="flex h-28 flex-col justify-between rounded-xl p-3 text-white shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <span className="line-clamp-2 font-semibold drop-shadow-sm">{board.title}</span>
            {board.description && (
              <span className="line-clamp-1 text-xs text-white/85">{board.description}</span>
            )}
          </Link>
        </li>
      ))}
      <li>
        <CreateBoardForm />
      </li>
    </ul>
  );
}
