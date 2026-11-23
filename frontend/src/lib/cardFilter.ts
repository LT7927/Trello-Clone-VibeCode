import type { CardWithTags, Tag } from '@/types';

/**
 * Bộ lọc card phía client (không gọi API).
 *
 * 3 tiêu chí kết hợp AND; trong cùng 1 tiêu chí các lựa chọn kết hợp OR:
 * - keyword : chứa trong title hoặc description (không phân biệt hoa thường, không phân biệt dấu).
 * - tags    : card có ít nhất 1 tag đã chọn, HOẶC (noTags) card không có tag nào.
 * - statuses: 'incomplete' | 'completed' | 'overdue' (quá hạn = có dueDate < now và chưa hoàn thành).
 */

export const CARD_STATUS_FILTERS = [
  { value: 'incomplete', label: 'Chưa hoàn thành' },
  { value: 'completed', label: 'Đã hoàn thành' },
  { value: 'overdue', label: 'Quá hạn' },
] as const;

export type CardStatusFilter = (typeof CARD_STATUS_FILTERS)[number]['value'];

export interface CardFilter {
  keyword: string;
  tagIds: string[];
  /** Lựa chọn "Không có nhãn" */
  noTags: boolean;
  statuses: CardStatusFilter[];
}

export const EMPTY_CARD_FILTER: CardFilter = { keyword: '', tagIds: [], noTags: false, statuses: [] };

/** Chữ thường + bỏ dấu tiếng Việt: "Làm Đẹp" -> "lam dep" */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bỏ tag không còn trong board (vd: vừa bị xoá) để không "lọc ma" */
export function sanitizeCardFilter(filter: CardFilter, boardTags: Tag[]): CardFilter {
  if (filter.tagIds.length === 0) return filter;
  const valid = new Set(boardTags.map((tag) => tag.id));
  const tagIds = filter.tagIds.filter((id) => valid.has(id));
  return tagIds.length === filter.tagIds.length ? filter : { ...filter, tagIds };
}

/** Số lựa chọn đang bật (từ khoá tính 1) — dùng cho badge */
export function countActiveFilters(filter: CardFilter): number {
  return (
    (normalizeSearchText(filter.keyword) ? 1 : 0) +
    filter.tagIds.length +
    (filter.noTags ? 1 : 0) +
    filter.statuses.length
  );
}

export function isCardFilterActive(filter: CardFilter): boolean {
  return countActiveFilters(filter) > 0;
}

export function isCardOverdue(card: Pick<CardWithTags, 'dueDate' | 'isCompleted'>, now: number): boolean {
  if (!card.dueDate || card.isCompleted) return false;
  const due = new Date(card.dueDate).getTime();
  return !Number.isNaN(due) && due < now;
}

/**
 * Tạo hàm kiểm tra card khớp bộ lọc. Chuẩn hoá từ khoá / set tag 1 lần, gọi lại cho từng card.
 * `now`: mốc thời gian để xét "Quá hạn" (caller truyền vào -> không gọi Date.now() khi render).
 */
export function createCardMatcher(filter: CardFilter, now: number): (card: CardWithTags) => boolean {
  const keyword = normalizeSearchText(filter.keyword);
  const tagIds = new Set(filter.tagIds);
  const filterByTags = tagIds.size > 0 || filter.noTags;
  const statuses = new Set(filter.statuses);

  return (card) => {
    if (keyword) {
      const haystack = normalizeSearchText(`${card.title}\n${card.description ?? ''}`);
      if (!haystack.includes(keyword)) return false;
    }

    if (filterByTags) {
      const matchesTag = card.tags.some((tag) => tagIds.has(tag.id));
      const matchesNoTag = filter.noTags && card.tags.length === 0;
      if (!matchesTag && !matchesNoTag) return false;
    }

    if (statuses.size > 0) {
      const matchesStatus =
        (statuses.has('incomplete') && !card.isCompleted) ||
        (statuses.has('completed') && card.isCompleted) ||
        (statuses.has('overdue') && isCardOverdue(card, now));
      if (!matchesStatus) return false;
    }

    return true;
  };
}
