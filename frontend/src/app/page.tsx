import type { Metadata } from 'next';
import { BoardGallery } from '@/components/home/BoardGallery';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

export const metadata: Metadata = {
  title: 'Board của bạn',
};

/**
 * Trang chủ: phần khung là Server Component (nằm trong static shell),
 * danh sách board được tải phía client trong <BoardGallery />.
 */
export default function HomePage() {
  return (
    <main className="flex-1 bg-gray-100 dark:bg-gray-950">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Board của bạn</h1>
          <ThemeToggle className="text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white" />
        </header>
        <BoardGallery />
      </div>
    </main>
  );
}
