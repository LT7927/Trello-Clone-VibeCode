'use client';

import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from './ThemeProvider';

/**
 * Nút chuyển sáng / tối.
 * Icon chọn bằng CSS (`dark:`) -> hiển thị đúng ngay từ HTML server, không nháy icon khi hydrate.
 * `className` để nơi gắn truyền màu phù hợp nền (vd: header board có màu).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const label =
    theme === 'dark' ? 'Chuyển sang giao diện sáng' : theme === 'light' ? 'Chuyển sang giao diện tối' : 'Đổi giao diện sáng / tối';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={cn('shrink-0 rounded-md p-1.5', className)}
    >
      <Moon className="size-5 dark:hidden" aria-hidden />
      <Sun className="hidden size-5 dark:block" aria-hidden />
    </button>
  );
}
