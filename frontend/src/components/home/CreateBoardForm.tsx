'use client';

import { Loader2, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { isApiError } from '@/lib/axios';
import { cn } from '@/lib/utils';
import { createBoard } from '@/services/api';

interface CreateBoardFormProps {
  /** 'tile': ô trong lưới board; 'cta': nút lớn ở màn hình rỗng */
  variant?: 'tile' | 'cta';
  className?: string;
}

/**
 * Nút "Tạo Board mới" mở ra ô nhập tiêu đề.
 * Tạo xong mới chuyển trang: nếu chuyển ngay (optimistic) thì trang board sẽ GET một board chưa tồn tại -> 404.
 */
export function CreateBoardForm({ variant = 'tile', className }: CreateBoardFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (isSubmitting) return;
    setIsOpen(false);
    setTitle('');
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const value = title.trim();
    if (!value || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const { data } = await createBoard({ id: crypto.randomUUID(), title: value });
      router.push(`/boards/${data.id}`);
      // Giữ trạng thái "đang tạo" cho tới khi trang mới thay thế component này
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Không thể tạo board, vui lòng thử lại');
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          variant === 'cta'
            ? 'inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700'
            : 'flex h-28 w-full items-center justify-center gap-2 rounded-xl bg-gray-200 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
          className,
        )}
      >
        <Plus className="size-4" aria-hidden />
        Tạo Board mới
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'flex w-full flex-col gap-2 rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-gray-900/10 dark:bg-gray-900 dark:ring-white/10',
        variant === 'cta' && 'max-w-sm',
        className,
      )}
    >
      <label htmlFor="new-board-title" className="text-xs font-semibold text-gray-600 dark:text-gray-400">
        Tiêu đề board
      </label>
      <input
        id="new-board-title"
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && close()}
        disabled={isSubmitting}
        maxLength={255}
        placeholder="Ví dụ: Dự án Website"
        className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-800/60"
      />
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-center gap-1">
        <button
          type="submit"
          disabled={!title.trim() || isSubmitting}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Tạo board
        </button>
        <button
          type="button"
          onClick={close}
          disabled={isSubmitting}
          aria-label="Huỷ"
          className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
