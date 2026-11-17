'use client';

import { Plus, X } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

interface InlineAddFormProps {
  /** Nhãn nút khi form đang đóng, ví dụ "Thêm thẻ" */
  label: string;
  placeholder: string;
  submitLabel: string;
  /** Trả về true nếu tạo thành công (store đã tự rollback + báo lỗi khi thất bại) */
  onSubmit: (title: string) => Promise<boolean>;
  className?: string;
}

/** Nút "+ Thêm ..." mở ra ô nhập. Giữ form mở sau khi thêm để nhập liên tiếp. */
export function InlineAddForm({ label, placeholder, submitLabel, onSubmit, className }: InlineAddFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');

  const close = () => {
    setIsOpen(false);
    setTitle('');
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    // Optimistic: UI đã có item mới ngay, không cần chờ API
    setTitle('');
    void onSubmit(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') close();
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-300/60 hover:text-gray-900',
          className,
        )}
      >
        <Plus className="size-4" aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn('flex flex-col gap-2', className)}>
      <input
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={255}
        className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
      />
      <div className="flex items-center gap-1">
        <button
          type="submit"
          disabled={!title.trim()}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Huỷ"
          className="rounded-md p-1.5 text-gray-600 hover:bg-gray-300/60 hover:text-gray-900"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
