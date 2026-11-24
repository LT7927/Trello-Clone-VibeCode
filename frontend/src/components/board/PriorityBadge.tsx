import { PRIORITY_META } from '@/lib/cardPriority';
import { cn } from '@/lib/utils';
import type { CardPriority } from '@/types';

/** Badge mức độ ưu tiên. Giá trị lạ / thiếu (dữ liệu cũ) -> không hiển thị */
export function PriorityBadge({ priority, className }: { priority: CardPriority; className?: string }) {
  const meta = PRIORITY_META[priority];
  if (!meta) return null;
  return (
    <span
      title={`Độ ưu tiên: ${meta.label}`}
      className={cn(
        'inline-flex items-center rounded px-1.5 py-px text-[11px] font-medium leading-4 ring-1 ring-inset',
        meta.badgeClass,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
