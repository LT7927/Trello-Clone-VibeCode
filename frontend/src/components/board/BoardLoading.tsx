import { Loader2 } from 'lucide-react';

/** Màn hình chờ toàn trang của board — dùng cho Suspense fallback và lúc KanbanBoard đang tải */
export function BoardLoading() {
  return (
    <div className="flex h-dvh items-center justify-center bg-gray-100 text-gray-500 dark:bg-gray-950 dark:text-gray-400">
      <Loader2 className="size-6 animate-spin" aria-label="Đang tải board" />
    </div>
  );
}
