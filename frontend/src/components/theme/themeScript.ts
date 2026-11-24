/**
 * Dùng chung giữa inline script (chạy trước khi React hydrate) và ThemeProvider.
 * Lưu ý: localStorage ở đây chỉ giữ TUỲ CHỌN GIAO DIỆN của trình duyệt, không phải dữ liệu nghiệp vụ.
 */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

/**
 * Chạy đồng bộ trong <head> trước khi trình duyệt vẽ trang -> không nháy sáng/tối (FOUC).
 * Lựa chọn đã lưu ('light' | 'dark') > prefers-color-scheme của hệ thống.
 * Bọc try/catch: localStorage bị chặn (chế độ riêng tư, cookie bị tắt) -> vẫn theo hệ thống.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,s=null;try{s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}var t=s==='light'||s==='dark'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');d.classList.toggle('dark',t==='dark');d.style.colorScheme=t}catch(e){}})();`;
