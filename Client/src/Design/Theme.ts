import type { Theme } from '@landscape/shared';
import { reducedMotion } from './Spring';

const STORAGE_KEY = 'landscape.theme';
let current: Theme = 'system';
let transitionTimer: number | null = null;
const systemQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') return systemQuery?.matches ? 'dark' : 'light';
  return theme;
}

/** Applies the theme to <html>, animating the switch (350 ms, 150 ms reduced). */
export function applyTheme(theme: Theme, animate = true): void {
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage may be unavailable; the server keeps the setting anyway
  }
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  if (root.dataset.theme === resolved) return;
  if (animate) {
    root.classList.add('theme-transition');
    if (transitionTimer !== null) window.clearTimeout(transitionTimer);
    transitionTimer = window.setTimeout(() => root.classList.remove('theme-transition'), reducedMotion() ? 160 : 360);
  }
  root.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#000000' : '#ffffff');
}

export function currentTheme(): Theme {
  return current;
}

/** Follows OS changes while the theme is "system". */
export function watchSystemTheme(): () => void {
  if (!systemQuery) return () => undefined;
  const handler = () => {
    if (current === 'system') applyTheme('system');
  };
  systemQuery.addEventListener('change', handler);
  return () => systemQuery.removeEventListener('change', handler);
}
