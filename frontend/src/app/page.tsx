import type { Metadata } from 'next';
import { BoardGallery } from '@/components/home/BoardGallery';

export const metadata: Metadata = {
  title: 'Board của bạn',
};

/**
 * Trang chủ: phần khung là Server Component (nằm trong static shell),
 * danh sách board được tải phía client trong <BoardGallery />.
 */
export default function HomePage() {
  return (
    <main className="flex-1 bg-gray-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Board của bạn</h1>
        <BoardGallery />
      </div>
    </main>
  );
}
