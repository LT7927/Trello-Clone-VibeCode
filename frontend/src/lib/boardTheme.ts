/**
 * Màu nền board. Backend lưu `background` là chuỗi tự do -> client chỉ dùng khi là mã hex hợp lệ.
 */

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Màu tile trên trang chủ khi board chưa chọn màu */
export const DEFAULT_TILE_BACKGROUND = '#0079BF';

/** Bảng màu preset quen thuộc của Trello */
export const BOARD_COLORS = [
  { name: 'Xanh dương', value: '#0079BF' },
  { name: 'Cam', value: '#D29034' },
  { name: 'Xanh lá', value: '#519839' },
  { name: 'Đỏ', value: '#B04632' },
  { name: 'Tím', value: '#89609E' },
  { name: 'Hồng', value: '#CD5A91' },
  { name: 'Xanh chanh', value: '#4BBF6B' },
  { name: 'Xanh ngọc', value: '#00AEB2' },
] as const;

/** Trả về mã hex nếu hợp lệ, ngược lại null (-> dùng giao diện mặc định) */
export function getBoardColor(background: string | null | undefined): string | null {
  const value = background?.trim();
  return value && HEX_COLOR.test(value) ? value : null;
}

export function isSameColor(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').toLowerCase() === (b ?? '').toLowerCase();
}

/** Độ sáng tương đối theo WCAG 2.x */
function relativeLuminance(hex: string): number {
  let digits = hex.slice(1);
  if (digits.length === 3) digits = [...digits].map((d) => d + d).join('');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(digits.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** true -> nền tối, nên dùng chữ trắng (chọn màu chữ có độ tương phản cao hơn) */
export function isDarkColor(hex: string): boolean {
  const luminance = relativeLuminance(hex);
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  return contrastWithWhite >= contrastWithBlack;
}

/** Tông giao diện của board: 'default' = nền xám mặc định */
export type BoardTone = 'default' | 'dark' | 'light';

export function getBoardTone(background: string | null | undefined): BoardTone {
  const color = getBoardColor(background);
  if (!color) return 'default';
  return isDarkColor(color) ? 'dark' : 'light';
}

/** Class cho chữ / nút trên header board theo tông màu nền -> luôn đủ tương phản */
export const HEADER_TONE_CLASSES: Record<
  BoardTone,
  { header: string; text: string; subtext: string; button: string; buttonActive: string }
> = {
  default: {
    header: '',
    text: 'text-gray-900',
    subtext: 'text-gray-600',
    button: 'text-gray-600 hover:bg-gray-200 hover:text-gray-900',
    buttonActive: 'bg-black/10',
  },
  dark: {
    header: 'bg-black/20',
    text: 'text-white',
    subtext: 'text-white/80',
    button: 'text-white/90 hover:bg-white/20 hover:text-white',
    buttonActive: 'bg-white/20',
  },
  light: {
    header: 'bg-white/35',
    text: 'text-gray-900',
    subtext: 'text-gray-700',
    button: 'text-gray-700 hover:bg-black/10 hover:text-gray-900',
    buttonActive: 'bg-black/10',
  },
};
