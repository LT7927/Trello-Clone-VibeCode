'use client';

import { Filter, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { HEADER_TONE_CLASSES, type BoardTone } from '@/lib/boardTheme';
import {
  CARD_STATUS_FILTERS,
  EMPTY_CARD_FILTER,
  isCardFilterActive,
  type CardFilter,
  type CardStatusFilter,
} from '@/lib/cardFilter';
import { PRIORITY_META } from '@/lib/cardPriority';
import { cn } from '@/lib/utils';
import { CARD_PRIORITIES, type CardPriority, type Tag } from '@/types';
import { TagChip } from './TagPicker';

/**
 * Ô tìm kiếm + nút "Lọc" (popover chọn nhãn / trạng thái) trên header board.
 * Component "controlled": không giữ state bộ lọc, mọi thay đổi gửi lên qua `onChange`
 * (KanbanBoard giữ state vì còn cần nó để khoá kéo thả card).
 */

const KEYWORD_MAX = 200;

function toggle<T>(items: T[], item: T): T[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

function CheckboxRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-4 shrink-0 cursor-pointer rounded accent-blue-600"
      />
      <span className="flex min-w-0 flex-1 items-center">{children}</span>
    </label>
  );
}

interface BoardFilterProps {
  tone: BoardTone;
  tags: Tag[];
  filter: CardFilter;
  onChange: (filter: CardFilter) => void;
}

export function BoardFilter({ tone, tags, filter, onChange }: BoardFilterProps) {
  const classes = HEADER_TONE_CLASSES[tone];
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  /** Số lựa chọn trong popover (từ khoá đã hiện sẵn trong ô tìm kiếm nên không tính) */
  const popoverCount =
    filter.tagIds.length + (filter.noTags ? 1 : 0) + filter.statuses.length + filter.priorities.length;
  const isActive = isCardFilterActive(filter);

  const update = (changes: Partial<CardFilter>) => onChange({ ...filter, ...changes });

  // Click ra ngoài hoặc Escape -> đóng popover
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      setOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="flex items-center gap-1.5">
      {/* ---------- Ô tìm kiếm nhanh ---------- */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-gray-500 dark:text-gray-400"
          aria-hidden
        />
        <input
          type="search"
          value={filter.keyword}
          onChange={(event) => update({ keyword: event.target.value })}
          onKeyDown={(event) => {
            // Escape: xoá từ khoá (không đóng thứ khác)
            if (event.key === 'Escape' && filter.keyword) {
              event.preventDefault();
              update({ keyword: '' });
            }
          }}
          maxLength={KEYWORD_MAX}
          placeholder="Tìm thẻ..."
          aria-label="Tìm thẻ theo tiêu đề hoặc mô tả"
          className="w-32 rounded-md bg-white/90 py-1.5 pl-7 pr-7 text-sm text-gray-900 shadow-sm outline-none ring-1 ring-gray-900/10 placeholder:text-gray-500 focus:bg-white focus:ring-2 focus:ring-blue-500 sm:w-52 dark:bg-gray-800/90 dark:text-gray-100 dark:ring-white/15 dark:placeholder:text-gray-400 dark:focus:bg-gray-800 [&::-webkit-search-cancel-button]:hidden"
        />
        {filter.keyword && (
          <button
            type="button"
            onClick={() => update({ keyword: '' })}
            aria-label="Xóa từ khóa"
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* ---------- Nút Lọc + popover ---------- */}
      <div ref={rootRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={popoverCount > 0 ? `Lọc thẻ (${popoverCount} lựa chọn đang bật)` : 'Lọc thẻ'}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium',
            classes.button,
            (open || popoverCount > 0) && classes.buttonActive,
          )}
        >
          <Filter className="size-4" aria-hidden />
          <span className="hidden sm:inline">Lọc</span>
          {popoverCount > 0 && (
            <span className="min-w-5 rounded-full bg-blue-600 px-1.5 text-center text-xs font-semibold leading-5 text-white">
              {popoverCount}
            </span>
          )}
        </button>

        {open && (
          <div
            id={panelId}
            role="dialog"
            aria-label="Lọc thẻ"
            className="absolute right-0 top-full z-30 mt-1 flex max-h-[calc(100dvh-5rem)] w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto rounded-lg bg-white p-3 shadow-xl ring-1 ring-gray-900/10 dark:bg-gray-900 dark:ring-white/10"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Lọc thẻ</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng bộ lọc"
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {/* ---------- Nhãn ---------- */}
            <fieldset>
              <legend className="mb-1 px-2 text-xs font-semibold text-gray-600 dark:text-gray-400">Nhãn</legend>
              <CheckboxRow checked={filter.noTags} onChange={() => update({ noTags: !filter.noTags })}>
                <span className="italic text-gray-600 dark:text-gray-400">Không có nhãn</span>
              </CheckboxRow>
              {tags.map((tag) => (
                <CheckboxRow
                  key={tag.id}
                  checked={filter.tagIds.includes(tag.id)}
                  onChange={() => update({ tagIds: toggle(filter.tagIds, tag.id) })}
                >
                  <TagChip tag={tag} className="shadow-none" />
                </CheckboxRow>
              ))}
              {tags.length === 0 && (
                <p className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">Board chưa có nhãn nào.</p>
              )}
            </fieldset>

            {/* ---------- Trạng thái / hạn chót ---------- */}
            <fieldset className="border-t border-gray-100 pt-2 dark:border-gray-800">
              <legend className="float-left mb-1 w-full px-2 text-xs font-semibold text-gray-600 dark:text-gray-400">
                Trạng thái
              </legend>
              {CARD_STATUS_FILTERS.map((status) => (
                <CheckboxRow
                  key={status.value}
                  checked={filter.statuses.includes(status.value)}
                  onChange={() => update({ statuses: toggle<CardStatusFilter>(filter.statuses, status.value) })}
                >
                  {status.label}
                </CheckboxRow>
              ))}
            </fieldset>

            {/* ---------- Độ ưu tiên ---------- */}
            <fieldset className="border-t border-gray-100 pt-2 dark:border-gray-800">
              <legend className="float-left mb-1 w-full px-2 text-xs font-semibold text-gray-600 dark:text-gray-400">
                Độ ưu tiên
              </legend>
              {[...CARD_PRIORITIES].reverse().map((priority) => (
                <CheckboxRow
                  key={priority}
                  checked={filter.priorities.includes(priority)}
                  onChange={() => update({ priorities: toggle<CardPriority>(filter.priorities, priority) })}
                >
                  <span className={cn('mr-2 size-2 shrink-0 rounded-full', PRIORITY_META[priority].dotClass)} aria-hidden />
                  {PRIORITY_META[priority].label}
                </CheckboxRow>
              ))}
            </fieldset>

            <p className="px-2 text-xs text-gray-500 dark:text-gray-400">
              Thẻ phải khớp tất cả tiêu chí; trong cùng một mục chỉ cần khớp một lựa chọn.
            </p>

            <button
              type="button"
              onClick={() => onChange(EMPTY_CARD_FILTER)}
              disabled={!isActive}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Xóa bộ lọc
            </button>
          </div>
        )}
      </div>

      {/* ---------- Xoá nhanh ---------- */}
      {isActive && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_CARD_FILTER)}
          aria-label="Xóa bộ lọc"
          title="Xóa bộ lọc"
          className={cn('rounded-md p-1.5', classes.button)}
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
