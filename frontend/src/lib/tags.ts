import type { Tag } from '@/types';

/** Khớp với NAME_MAX (STRING(50)) của Backend */
export const TAG_NAME_MAX = 50;

/** Khớp với HEX_COLOR_REGEX của Backend */
const HEX_COLOR_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX_COLOR_REGEX.test(value.trim());
}

/** Chuẩn hoá giống Backend (trim + in hoa) để so sánh "có đổi không" chính xác */
export function normalizeHexColor(value: string): string {
  return value.trim().toUpperCase();
}

/** "#ABC" -> "#AABBCC" (giá trị hợp lệ cho <input type="color">) */
export function toLongHex(color: string): string {
  const value = normalizeHexColor(color);
  if (/^#[0-9A-F]{3}$/.test(value)) {
    return `#${value
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`;
  }
  return /^#[0-9A-F]{6}$/.test(value) ? value : '#000000';
}

export const TAG_COLOR_PRESETS = [
  { color: '#61BD4F', label: 'Xanh lá' },
  { color: '#F2D600', label: 'Vàng' },
  { color: '#FF9F1A', label: 'Cam' },
  { color: '#EB5A46', label: 'Đỏ' },
  { color: '#C377E0', label: 'Tím' },
  { color: '#0079BF', label: 'Xanh dương' },
  { color: '#00C2E0', label: 'Xanh ngọc' },
  { color: '#51E898', label: 'Xanh bạc hà' },
  { color: '#FF78CB', label: 'Hồng' },
  { color: '#344563', label: 'Xám đậm' },
] as const;

const nameCollator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

/** Sắp theo tên giống thứ tự Backend trả về board.tags */
export function sortTags(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => nameCollator.compare(a.name, b.name));
}

/** Tìm tag trùng tên (không phân biệt hoa thường, giống Backend), bỏ qua `excludeId` */
export function findTagByName(tags: Tag[], name: string, excludeId?: string): Tag | undefined {
  const key = name.trim().toLowerCase();
  return tags.find((t) => t.id !== excludeId && t.name.toLowerCase() === key);
}

/**
 * Màu chữ dễ đọc trên nền `color` (YIQ). Nền sáng (vàng, xanh bạc hà...) -> chữ tối.
 */
export function readableTextColor(color: string): string {
  const hex = toLongHex(color).slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 160 ? '#172B4D' : '#FFFFFF';
}
