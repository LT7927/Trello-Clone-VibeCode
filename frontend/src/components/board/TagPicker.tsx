'use client';

import { Check, ChevronLeft, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '@/lib/utils';
import {
  TAG_COLOR_PRESETS,
  TAG_NAME_MAX,
  findTagByName,
  isHexColor,
  normalizeHexColor,
  readableTextColor,
  toLongHex,
} from '@/lib/tags';
import { findCard, useBoardStore } from '@/store/useBoardStore';
import type { Tag } from '@/types';

/**
 * Popover quản lý nhãn của card:
 * - Bật / tắt gắn từng nhãn của board vào card (checkbox)
 * - Tạo / sửa (tên + màu) / xoá (có xác nhận) nhãn của board
 * Mọi thao tác đều Optimistic qua store: popover quay về danh sách ngay, lỗi -> store rollback + toast.
 */

const EMPTY_TAGS: Tag[] = [];

type View =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'edit'; tagId: string }
  | { mode: 'delete'; tagId: string };

interface TagPickerProps {
  cardId: string;
  /** Nút mở popover -> click vào nút không bị tính là "click ra ngoài" */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Gắn / gỡ nhãn thành công -> modal tải lại lịch sử hoạt động */
  onToggled?: () => void;
}

export function TagPicker({ cardId, anchorRef, onClose, onToggled }: TagPickerProps) {
  const boardTags = useBoardStore((state) => state.board?.tags ?? EMPTY_TAGS);
  const cardTags = useBoardStore((state) => findCard(state.board, cardId)?.tags ?? EMPTY_TAGS);
  const toggleCardTag = useBoardStore((state) => state.toggleCardTag);
  const createTag = useBoardStore((state) => state.createTag);
  const updateTag = useBoardStore((state) => state.updateTag);
  const deleteTag = useBoardStore((state) => state.deleteTag);

  const [view, setView] = useState<View>({ mode: 'list' });
  const popoverRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  // Tag đang sửa / xoá đã biến mất (bị xoá ở nơi khác, rollback tạo) -> coi như về danh sách
  const targetTag = 'tagId' in view ? boardTags.find((t) => t.id === view.tagId) : undefined;
  const mode: View['mode'] = 'tagId' in view && !targetTag ? 'list' : view.mode;

  // ---------- Click ra ngoài -> đóng ----------
  useEffect(() => {
    const handleMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [anchorRef, onClose]);

  // ---------- Focus: vào popover khi mở, trả về nút mở khi đóng ----------
  useEffect(() => {
    const anchor = anchorRef.current;
    popoverRef.current?.focus();
    return () => {
      if (anchor?.isConnected) anchor.focus();
    };
  }, [anchorRef]);

  /** Escape: đang ở form -> về danh sách; ở danh sách -> đóng popover (không đóng modal) */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    if (mode === 'list') onClose();
    else {
      setView({ mode: 'list' });
      popoverRef.current?.focus();
    }
  };

  const backToList = () => {
    setView({ mode: 'list' });
    popoverRef.current?.focus();
  };

  const handleToggle = (tagId: string) => {
    void toggleCardTag(cardId, tagId).then((ok) => {
      if (ok) onToggled?.();
    });
  };

  let title = 'Nhãn';
  let body: ReactNode = (
    <TagList
      tags={boardTags}
      selectedIds={new Set(cardTags.map((t) => t.id))}
      onToggle={handleToggle}
      onEdit={(tagId) => setView({ mode: 'edit', tagId })}
      onDelete={(tagId) => setView({ mode: 'delete', tagId })}
      onCreate={() => setView({ mode: 'create' })}
    />
  );

  if (mode === 'create') {
    title = 'Tạo nhãn mới';
    body = (
      <TagForm
        tags={boardTags}
        submitLabel="Tạo"
        onCancel={backToList}
        onSubmit={(name, color) => {
          backToList();
          void createTag(name, color);
        }}
      />
    );
  } else if (mode === 'edit' && targetTag) {
    const tagId = targetTag.id;
    title = 'Sửa nhãn';
    body = (
      <TagForm
        key={tagId}
        tags={boardTags}
        initial={targetTag}
        submitLabel="Lưu"
        onCancel={backToList}
        onSubmit={(name, color) => {
          backToList();
          void updateTag(tagId, { name, color });
        }}
      />
    );
  } else if (mode === 'delete' && targetTag) {
    const tagId = targetTag.id;
    title = 'Xóa nhãn';
    body = (
      <DeleteConfirm
        tag={targetTag}
        onCancel={backToList}
        onConfirm={() => {
          backToList();
          void deleteTag(tagId);
        }}
      />
    );
  }

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-labelledby={headingId}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="absolute left-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-4rem)] rounded-lg bg-white p-3 shadow-xl ring-1 ring-gray-900/10 outline-none"
    >
      <div className="mb-2 flex items-center gap-1">
        {mode !== 'list' ? (
          <button
            type="button"
            onClick={backToList}
            aria-label="Quay lại danh sách nhãn"
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
        ) : (
          <span className="size-6" aria-hidden />
        )}
        <h4 id={headingId} className="flex-1 text-center text-sm font-semibold text-gray-700">
          {title}
        </h4>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {body}
    </div>
  );
}

// ============================================================
// Các khối con
// ============================================================

export function TagChip({ tag, className }: { tag: Pick<Tag, 'name' | 'color'>; className?: string }) {
  return (
    <span
      className={cn('inline-block max-w-full truncate rounded px-2 py-0.5 text-xs font-medium shadow-sm', className)}
      style={{ backgroundColor: tag.color, color: readableTextColor(tag.color) }}
    >
      {tag.name}
    </span>
  );
}

function TagList({
  tags,
  selectedIds,
  onToggle,
  onEdit,
  onDelete,
  onCreate,
}: {
  tags: Tag[];
  selectedIds: Set<string>;
  onToggle: (tagId: string) => void;
  onEdit: (tagId: string) => void;
  onDelete: (tagId: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {tags.length === 0 ? (
        <p className="px-1 py-2 text-center text-sm text-gray-500">Board chưa có nhãn nào.</p>
      ) : (
        <ul className="-mx-1 flex max-h-64 flex-col gap-1 overflow-y-auto px-1">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center gap-1">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={selectedIds.has(tag.id)}
                  onChange={() => onToggle(tag.id)}
                  className="size-4 shrink-0 accent-blue-600"
                />
                <TagChip tag={tag} className="flex-1 py-1.5" />
              </label>
              <button
                type="button"
                onClick={() => onEdit(tag.id)}
                aria-label={`Sửa nhãn ${tag.name}`}
                title="Sửa nhãn"
                className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              >
                <Pencil className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onDelete(tag.id)}
                aria-label={`Xóa nhãn ${tag.name}`}
                title="Xóa nhãn"
                className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center justify-center gap-1.5 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
      >
        <Plus className="size-4" aria-hidden />
        Tạo nhãn mới
      </button>
    </div>
  );
}

function TagForm({
  tags,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  /** Toàn bộ tag của board -> kiểm tra trùng tên */
  tags: Tag[];
  /** Có -> chế độ sửa */
  initial?: Tag;
  submitLabel: string;
  onSubmit: (name: string, color: string) => void;
  onCancel: () => void;
}) {
  const nameId = useId();
  const hexId = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState<string>(initial?.color ?? TAG_COLOR_PRESETS[0].color);

  const trimmed = name.trim();
  const duplicate = trimmed ? findTagByName(tags, trimmed, initial?.id) : undefined;
  const colorValid = isHexColor(color);
  const normalizedColor = normalizeHexColor(color);
  const unchanged = initial !== undefined && trimmed === initial.name && normalizedColor === initial.color;
  const canSubmit = trimmed.length > 0 && !duplicate && colorValid;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (unchanged) onCancel();
    else onSubmit(trimmed, normalizedColor);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex justify-center rounded-md bg-gray-50 px-3 py-4">
        <TagChip
          tag={{ name: trimmed || 'Xem trước', color: colorValid ? normalizedColor : '#DFE1E6' }}
          className="px-3 py-1.5 text-sm"
        />
      </div>

      <div>
        <label htmlFor={nameId} className="mb-1 block text-xs font-semibold text-gray-600">
          Tên nhãn
        </label>
        <input
          id={nameId}
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={TAG_NAME_MAX}
          placeholder="Ví dụ: Ưu tiên cao"
          aria-invalid={duplicate ? true : undefined}
          className={cn(
            'w-full rounded-md border bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:ring-2',
            duplicate
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30'
              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500/30',
          )}
        />
        {duplicate && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            Nhãn “{duplicate.name}” đã tồn tại trong board.
          </p>
        )}
      </div>

      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-gray-600">Màu</legend>
        <div className="grid grid-cols-5 gap-1.5">
          {TAG_COLOR_PRESETS.map((preset) => {
            const selected = normalizedColor === preset.color;
            return (
              <button
                key={preset.color}
                type="button"
                onClick={() => setColor(preset.color)}
                aria-label={preset.label}
                aria-pressed={selected}
                title={preset.label}
                className={cn(
                  'flex h-8 items-center justify-center rounded-md ring-offset-1 hover:opacity-90',
                  selected && 'ring-2 ring-blue-600',
                )}
                style={{ backgroundColor: preset.color, color: readableTextColor(preset.color) }}
              >
                {selected && <Check className="size-4" aria-hidden />}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <input
            type="color"
            value={toLongHex(colorValid ? color : '#000000')}
            onChange={(event) => setColor(event.target.value.toUpperCase())}
            aria-label="Chọn màu tùy chỉnh"
            title="Chọn màu tùy chỉnh"
            className="h-8 w-10 shrink-0 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
          />
          <label htmlFor={hexId} className="sr-only">
            Mã màu hex
          </label>
          <input
            id={hexId}
            value={color}
            onChange={(event) => setColor(event.target.value)}
            maxLength={7}
            spellCheck={false}
            placeholder="#61BD4F"
            aria-invalid={colorValid ? undefined : true}
            className={cn(
              'w-full rounded-md border bg-white px-2.5 py-1.5 font-mono text-sm uppercase text-gray-900 outline-none focus:ring-2',
              colorValid
                ? 'border-gray-300 focus:border-blue-500 focus:ring-blue-500/30'
                : 'border-red-400 focus:border-red-500 focus:ring-red-500/30',
            )}
          />
        </div>
        {!colorValid && <p className="mt-1 text-xs text-red-600">Mã màu phải có dạng #RGB hoặc #RRGGBB.</p>}
      </fieldset>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Hủy
        </button>
      </div>
    </form>
  );
}

function DeleteConfirm({
  tag,
  onConfirm,
  onCancel,
}: {
  tag: Tag;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Số card (đang hiển thị trên board) đang gắn nhãn này
  const usage = useBoardStore(
    (state) =>
      state.board?.lists.reduce(
        (count, l) => count + l.cards.filter((c) => c.tags.some((t) => t.id === tag.id)).length,
        0,
      ) ?? 0,
  );

  return (
    <div role="alertdialog" aria-label={`Xác nhận xóa nhãn ${tag.name}`} className="flex flex-col gap-3">
      <div className="flex justify-center">
        <TagChip tag={tag} className="px-3 py-1.5 text-sm" />
      </div>
      <p className="text-sm text-gray-700">
        Nhãn sẽ bị xóa khỏi board
        {usage > 0 && (
          <>
            {' '}
            và gỡ khỏi <span className="font-semibold">{usage} thẻ</span>
          </>
        )}
        . Thao tác này không thể hoàn tác.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          autoFocus
          onClick={onConfirm}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Xóa nhãn
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Hủy
        </button>
      </div>
    </div>
  );
}
