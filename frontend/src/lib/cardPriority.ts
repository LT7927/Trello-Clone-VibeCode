import { CARD_PRIORITIES, type CardPriority } from '@/types';

/**
 * Cấu hình hiển thị mức độ ưu tiên — dùng chung cho KanbanCard, CardDetailModal, BoardFilter, lịch sử.
 */

interface PriorityMeta {
  label: string;
  /** Badge trên card / lịch sử */
  badgeClass: string;
  /** Nút đang chọn trong modal */
  activeClass: string;
  /** Chấm màu trong bộ lọc */
  dotClass: string;
}

export const PRIORITY_META: Record<CardPriority, PriorityMeta> = {
  low: {
    label: 'Thấp',
    badgeClass: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-800',
    activeClass: 'bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-900/60 dark:text-sky-200 dark:ring-sky-700',
    dotClass: 'bg-sky-400',
  },
  medium: {
    label: 'Trung bình',
    badgeClass:
      'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800',
    activeClass:
      'bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:ring-amber-700',
    dotClass: 'bg-amber-400',
  },
  high: {
    label: 'Cao',
    badgeClass: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-800',
    activeClass: 'bg-red-100 text-red-800 ring-red-300 dark:bg-red-900/60 dark:text-red-200 dark:ring-red-700',
    dotClass: 'bg-red-500',
  },
};

export function isCardPriority(value: unknown): value is CardPriority {
  return typeof value === 'string' && (CARD_PRIORITIES as readonly string[]).includes(value);
}
