'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { THEME_STORAGE_KEY, type Theme } from './themeScript';

/**
 * Nguồn sự thật của theme là class `.dark` trên <html>:
 * - Inline script trong layout gắn class trước khi vẽ trang (chống FOUC).
 * - Provider đọc lại class qua useSyncExternalStore -> server render `null`, client đọc giá trị thật
 *   mà không gây lỗi hydration.
 * - Chưa chọn thủ công -> theo prefers-color-scheme và tự đổi khi hệ thống đổi.
 * - Đổi ở tab khác (sự kiện `storage`) -> tab này đồng bộ theo.
 */

interface ThemeContextValue {
  /** null khi đang render phía server / trước hydrate (chưa biết theme) */
  theme: Theme | null;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ---------- Store nhỏ quanh class của <html> ----------

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function getServerSnapshot(): Theme | null {
  return null;
}

function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Gắn class + color-scheme. Tạm tắt transition để cả trang đổi màu cùng lúc, không "chạy" từng phần tử. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (root.classList.contains('dark') === (theme === 'dark')) return;

  const style = document.createElement('style');
  style.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(style);

  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;

  // Ép trình duyệt tính lại style trước khi bật lại transition
  void window.getComputedStyle(root).colorScheme;
  requestAnimationFrame(() => style.remove());
  notify();
}

// ---------- Provider ----------

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      if (readStoredTheme() === null) applyTheme(systemTheme());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
      applyTheme(readStoredTheme() ?? systemTheme());
    };

    media.addEventListener('change', handleSystemChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      media.removeEventListener('change', handleSystemChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Không lưu được (chế độ riêng tư) -> vẫn đổi cho phiên hiện tại
    }
    applyTheme(next);
  }, []);

  const toggleTheme = useCallback(() => setTheme(getSnapshot() === 'dark' ? 'light' : 'dark'), [setTheme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme phải được dùng bên trong <ThemeProvider>');
  return context;
}
