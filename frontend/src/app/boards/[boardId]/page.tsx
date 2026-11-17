import { Suspense } from 'react';
import { BoardLoading } from '@/components/board/BoardLoading';
import { KanbanBoard } from '@/components/board/KanbanBoard';

/**
 * Next.js 16 + cacheComponents:
 * - `params` là Promise. `boardId` không có trong generateStaticParams nên là dữ liệu runtime.
 * - Vì vậy page KHÔNG `await params` ở cấp cao nhất (sẽ chặn prerender -> lỗi "blocking route");
 *   thay vào đó resolve bên trong <Suspense> để fallback vẫn nằm trong static shell
 *   (theo docs: getting-started/caching -> "Maximizing the static shell").
 * - Dữ liệu board do KanbanBoard tải phía client qua Zustand store (để có Optimistic UI).
 */
export default function BoardPage({ params }: PageProps<'/boards/[boardId]'>) {
  return (
    <Suspense fallback={<BoardLoading />}>
      {params.then(({ boardId }) => (
        // key: đổi board -> mount lại sạch sẽ, không giữ state kéo thả của board cũ
        <KanbanBoard key={boardId} boardId={boardId} />
      ))}
    </Suspense>
  );
}
