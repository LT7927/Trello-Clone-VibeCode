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
    badgeClass: 'bg-sky-50 text-sky-700 ring-sky-200',
    activeClass: 'bg-sky-100 text-sky-800 ring-sky-300',
    dotClass: 'bg-sky-400',
  },
  medium: {
    label: 'Trung bình',
    badgeClass: 'bg-amber-50 text-amber-700 ring-amber-200',
    activeClass: 'bg-amber-100 text-amber-800 ring-amber-300',
    dotClass: 'bg-amber-400',
  },
  high: {
    label: 'Cao',
    badgeClass: 'bg-red-50 text-red-700 ring-red-200',
    activeClass: 'bg-red-100 text-red-800 ring-red-300',
    dotClass: 'bg-red-500',
  },
};

export function isCardPriority(value: unknown): value is CardPriority {
  return typeof value === 'string' && (CARD_PRIORITIES as readonly string[]).includes(value);
}
