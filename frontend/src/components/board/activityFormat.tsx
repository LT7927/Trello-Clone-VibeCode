import {
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  CheckCircle2,
  Circle,
  Pencil,
  Plus,
  Tag as TagIcon,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { isHexColor } from '@/lib/tags';
import type { ActivityLog } from '@/types';
import { TagChip } from './TagPicker';

/**
 * Định dạng ActivityLog thành câu tiếng Việt — dùng chung cho:
 * - CardDetailModal (scope 'card'): đang xem 1 thẻ -> không cần nhắc lại tên thẻ.
 * - ActivityDrawer  (scope 'board'): lịch sử toàn board -> luôn nêu rõ tên thẻ / danh sách / nhãn.
 *
 * Metadata do Backend ghi (xem *.controller.ts) — mọi khoá đều có thể thiếu ở log cũ,
 * nên mỗi câu đều có phương án dự phòng khi thiếu dữ liệu.
 */

export type ActivityScope = 'card' | 'board';

// ============================================================
// Ngày giờ
// ============================================================

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const relativeFormatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });

/** "17/11/2026, 08:30" — chuỗi rỗng nếu ISO không hợp lệ */
export function formatDateTime(iso: string): string {
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? '' : dateTimeFormatter.format(time);
}

/**
 * "Vừa xong", "5 phút trước", "3 giờ trước", "Hôm qua"... quá 7 ngày -> ngày giờ đầy đủ.
 * `now` do caller truyền vào (mốc lúc tải dữ liệu) -> không gọi Date.now() trong lúc render.
 */
export function formatRelativeTime(iso: string, now: number): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  const seconds = Math.round((now - time) / 1000);

  if (seconds < 45) return 'Vừa xong';
  let text: string;
  if (seconds < 3600) text = relativeFormatter.format(-Math.max(1, Math.round(seconds / 60)), 'minute');
  else if (seconds < 86_400) text = relativeFormatter.format(-Math.round(seconds / 3600), 'hour');
  else if (seconds < 7 * 86_400) text = relativeFormatter.format(-Math.round(seconds / 86_400), 'day');
  else return dateTimeFormatter.format(time);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ============================================================
// Đọc metadata an toàn
// ============================================================

type Metadata = ActivityLog['metadata'];

function metaString(metadata: Metadata, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function metaNumber(metadata: Metadata, key: string): number | null {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metaStringArray(metadata: Metadata, key: string): string[] {
  const value = metadata?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function joinVietnamese(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} và ${items[items.length - 1]}`;
}

const CARD_FIELD_LABELS: Record<string, string> = {
  title: 'tiêu đề',
  description: 'mô tả',
  dueDate: 'ngày hết hạn',
};

const BOARD_FIELD_LABELS: Record<string, string> = {
  title: 'tên',
  description: 'mô tả',
  background: 'màu nền',
};

// ============================================================
// Mảnh hiển thị
// ============================================================

function Quote({ children }: { children: ReactNode }) {
  return <span className="font-medium text-gray-900">“{children}”</span>;
}

/** Tên nhãn trong lịch sử: chip đúng màu lúc ghi log, thiếu màu -> trích dẫn thường */
function ActivityTag({ name, color }: { name: string; color: string | null }) {
  if (!color || !isHexColor(color)) return <Quote>{name}</Quote>;
  return <TagChip tag={{ name, color }} className="mx-0.5 align-middle shadow-none" />;
}

/** "thẻ" (scope card) hoặc "thẻ “Tên thẻ”" (scope board, nếu metadata có tiêu đề) */
function cardRef(metadata: Metadata, scope: ActivityScope): ReactNode {
  const title = scope === 'board' ? metaString(metadata, 'title') : null;
  return title ? (
    <>
      thẻ <Quote>{title}</Quote>
    </>
  ) : (
    'thẻ'
  );
}

/** "danh sách “Tên”" hoặc "danh sách" khi log thiếu tiêu đề */
function listRef(title: string | null): ReactNode {
  return title ? (
    <>
      danh sách <Quote>{title}</Quote>
    </>
  ) : (
    'danh sách'
  );
}

// ============================================================
// Mô tả activity
// ============================================================

export function describeActivity(activity: ActivityLog, scope: ActivityScope = 'card'): ReactNode {
  const { metadata } = activity;
  const card = cardRef(metadata, scope);

  switch (activity.action) {
    // ---------- Board ----------
    case 'BOARD_CREATED': {
      const title = metaString(metadata, 'title');
      return title ? (
        <>
          Đã tạo board <Quote>{title}</Quote>
        </>
      ) : (
        'Đã tạo board'
      );
    }

    case 'BOARD_UPDATED': {
      const oldTitle = metaString(metadata, 'oldTitle');
      const newTitle = metaString(metadata, 'newTitle');
      const changed = metaStringArray(metadata, 'changedFields');
      const others = changed.filter((f) => f !== 'title').map((f) => BOARD_FIELD_LABELS[f] ?? f);

      if (oldTitle && newTitle) {
        return (
          <>
            Đã đổi tên board từ <Quote>{oldTitle}</Quote> thành <Quote>{newTitle}</Quote>
            {others.length > 0 && `, đồng thời cập nhật ${joinVietnamese(others)}`}
          </>
        );
      }
      const labels = changed.map((f) => BOARD_FIELD_LABELS[f] ?? f);
      return labels.length > 0 ? `Đã cập nhật ${joinVietnamese(labels)} của board` : 'Đã cập nhật board';
    }

    case 'BOARD_ARCHIVED':
      return 'Đã lưu trữ board';
    case 'BOARD_RESTORED':
      return 'Đã khôi phục board từ lưu trữ';

    // ---------- List ----------
    case 'LIST_CREATED':
      return <>Đã thêm {listRef(metaString(metadata, 'title'))}</>;

    case 'LIST_RENAMED': {
      const oldTitle = metaString(metadata, 'oldTitle');
      const newTitle = metaString(metadata, 'newTitle');
      if (oldTitle && newTitle) {
        return (
          <>
            Đã đổi tên danh sách <Quote>{oldTitle}</Quote> thành <Quote>{newTitle}</Quote>
          </>
        );
      }
      return newTitle ? (
        <>
          Đã đổi tên danh sách thành <Quote>{newTitle}</Quote>
        </>
      ) : (
        'Đã đổi tên danh sách'
      );
    }

    case 'LIST_ARCHIVED':
      return <>Đã lưu trữ {listRef(metaString(metadata, 'title'))}</>;
    case 'LIST_RESTORED':
      return <>Đã khôi phục {listRef(metaString(metadata, 'title'))} từ lưu trữ</>;
    case 'LIST_MOVED':
      return <>Đã thay đổi vị trí {listRef(metaString(metadata, 'title'))}</>;

    case 'LIST_DELETED': {
      const count = metaNumber(metadata, 'deletedCardCount');
      return (
        <>
          Đã xóa {listRef(metaString(metadata, 'title'))}
          {count !== null && count > 0 && ` cùng ${count} thẻ bên trong`}
        </>
      );
    }

    // ---------- Card ----------
    case 'CARD_CREATED': {
      const listTitle = metaString(metadata, 'listTitle');
      return (
        <>
          Đã tạo {card}
          {listTitle && (
            <>
              {' '}
              trong danh sách <Quote>{listTitle}</Quote>
            </>
          )}
        </>
      );
    }

    case 'CARD_UPDATED': {
      const oldTitle = metaString(metadata, 'oldTitle');
      const newTitle = metaString(metadata, 'newTitle');
      const changed = metaStringArray(metadata, 'changedFields');
      const others = changed.filter((f) => f !== 'title').map((f) => CARD_FIELD_LABELS[f] ?? f);

      if (oldTitle && newTitle) {
        return (
          <>
            {scope === 'board' ? 'Đã đổi tên thẻ' : 'Đã đổi tiêu đề'} từ <Quote>{oldTitle}</Quote> thành{' '}
            <Quote>{newTitle}</Quote>
            {others.length > 0 && `, đồng thời cập nhật ${joinVietnamese(others)}`}
          </>
        );
      }
      const labels = changed.map((f) => CARD_FIELD_LABELS[f] ?? f);
      if (labels.length === 0) return <>Đã cập nhật {card}</>;
      return scope === 'board' ? (
        <>
          Đã cập nhật {joinVietnamese(labels)} của {card}
        </>
      ) : (
        `Đã cập nhật ${joinVietnamese(labels)}`
      );
    }

    case 'CARD_COMPLETED':
      return <>Đã đánh dấu {card} là hoàn thành</>;
    case 'CARD_UNCOMPLETED':
      return <>Đã bỏ đánh dấu hoàn thành {card}</>;
    case 'CARD_ARCHIVED':
      return <>Đã lưu trữ {card}</>;
    case 'CARD_RESTORED':
      return <>Đã khôi phục {card} từ lưu trữ</>;

    case 'CARD_MOVED': {
      const from = metaString(metadata, 'fromListTitle');
      const to = metaString(metadata, 'toListTitle');
      if (from && to) {
        return (
          <>
            Đã chuyển {card} từ <Quote>{from}</Quote> sang <Quote>{to}</Quote>
          </>
        );
      }
      return to ? (
        <>
          Đã chuyển {card} sang <Quote>{to}</Quote>
        </>
      ) : (
        <>Đã di chuyển {card}</>
      );
    }

    case 'CARD_DELETED':
      return <>Đã xóa {card}</>;

    // ---------- Tag ----------
    case 'TAG_CREATED': {
      const name = metaString(metadata, 'name');
      return name ? (
        <>
          Đã tạo nhãn <ActivityTag name={name} color={metaString(metadata, 'color')} />
        </>
      ) : (
        'Đã tạo nhãn mới'
      );
    }

    case 'TAG_UPDATED': {
      const oldName = metaString(metadata, 'oldName');
      const newName = metaString(metadata, 'newName');
      const name = newName ?? metaString(metadata, 'name');
      const oldColor = metaString(metadata, 'oldColor');
      const newColor = metaString(metadata, 'newColor');

      if (oldName && newName) {
        return (
          <>
            Đã đổi tên nhãn <ActivityTag name={oldName} color={oldColor} /> thành{' '}
            <ActivityTag name={newName} color={newColor} />
            {newColor && ' và đổi màu'}
          </>
        );
      }
      if (name && newColor) {
        return (
          <>
            Đã đổi màu nhãn <ActivityTag name={name} color={oldColor} /> thành{' '}
            <ActivityTag name={name} color={newColor} />
          </>
        );
      }
      return name ? (
        <>
          Đã cập nhật nhãn <Quote>{name}</Quote>
        </>
      ) : (
        'Đã cập nhật nhãn'
      );
    }

    case 'TAG_DELETED': {
      const name = metaString(metadata, 'name');
      const affected = metaStringArray(metadata, 'affectedCardIds').length;
      return (
        <>
          Đã xóa nhãn
          {name && (
            <>
              {' '}
              <ActivityTag name={name} color={metaString(metadata, 'color')} />
            </>
          )}
          {affected > 0 && ` (gỡ khỏi ${affected} thẻ)`}
        </>
      );
    }

    case 'TAG_ADDED':
    case 'TAG_REMOVED': {
      const tagName = metaString(metadata, 'tagName');
      const added = activity.action === 'TAG_ADDED';
      return (
        <>
          {added ? 'Đã gắn nhãn' : 'Đã gỡ nhãn'}
          {tagName && (
            <>
              {' '}
              <ActivityTag name={tagName} color={metaString(metadata, 'tagColor')} />
            </>
          )}
          {added ? ' vào ' : ' khỏi '}
          {card}
        </>
      );
    }

    default:
      return `Hoạt động: ${activity.action}`;
  }
}

// ============================================================
// Icon
// ============================================================

export function activityIcon(action: string): ReactNode {
  const cls = 'size-3.5';
  if (action === 'CARD_COMPLETED') return <CheckCircle2 className={`${cls} text-green-600`} aria-hidden />;
  if (action === 'CARD_UNCOMPLETED') return <Circle className={`${cls} text-gray-500`} aria-hidden />;
  if (action.endsWith('_ARCHIVED')) return <Archive className={`${cls} text-amber-600`} aria-hidden />;
  if (action.endsWith('_RESTORED')) return <ArchiveRestore className={`${cls} text-blue-600`} aria-hidden />;
  if (action.endsWith('_DELETED')) return <Trash2 className={`${cls} text-red-600`} aria-hidden />;
  if (action.endsWith('_MOVED')) return <ArrowRightLeft className={`${cls} text-gray-500`} aria-hidden />;
  if (action.startsWith('TAG_')) return <TagIcon className={`${cls} text-gray-500`} aria-hidden />;
  if (action.endsWith('_CREATED')) return <Plus className={`${cls} text-gray-500`} aria-hidden />;
  if (action.endsWith('_UPDATED') || action.endsWith('_RENAMED')) {
    return <Pencil className={`${cls} text-gray-500`} aria-hidden />;
  }
  return <span className="size-1.5 rounded-full bg-gray-400" aria-hidden />;
}

/** Nội dung 1 dòng lịch sử: icon + câu mô tả + thời gian (caller tự bọc <li> / <button>) */
export function ActivityEntry({
  activity,
  now,
  scope = 'card',
}: {
  activity: ActivityLog;
  now: number;
  scope?: ActivityScope;
}) {
  return (
    <>
      <span className="mt-1 flex size-4 shrink-0 items-center justify-center">{activityIcon(activity.action)}</span>
      <span className="flex min-w-0 flex-col">
        <span className="break-words text-gray-700">{describeActivity(activity, scope)}</span>
        <time dateTime={activity.createdAt} title={formatDateTime(activity.createdAt)} className="text-xs text-gray-500">
          {formatRelativeTime(activity.createdAt, now)}
        </time>
      </span>
    </>
  );
}
