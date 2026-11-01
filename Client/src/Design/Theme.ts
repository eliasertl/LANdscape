import type { Settings, Theme } from '@landscape/shared';
import { reducedMotion } from './Spring';
import { accentHex, onAccent, rgba, shade } from './Accent';

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

/**
 * Applies the appearance settings that map onto design tokens: the accent
 * color (with a contrast-checked text color and derived hover, pressed,
 * selection and focus-ring shades) and the blur radius of the materials.
 * Everything else keeps reading the tokens from Tokens.css.
 */
export function applyAppearance(appearance: Pick<Settings['appearance'], 'accent' | 'blur'>): void {
  const root = document.documentElement.style;
  const hex = accentHex(appearance.accent);
  const isDefault = appearance.accent === 'blue';
  const set = (name: string, value: string | null) => (value === null ? root.removeProperty(name) : root.setProperty(name, value));
  set('--color-accent', isDefault ? null : hex);
  set('--color-accent-hover', isDefault ? null : shade(hex, -0.08));
  set('--color-accent-pressed', isDefault ? null : shade(hex, -0.16));
  set('--color-on-accent', isDefault ? null : onAccent(hex));
  set('--color-selection', isDefault ? null : rgba(hex, 0.18));
  set('--color-selection-strong', isDefault ? null : rgba(hex, 0.34));
  set('--color-focus-ring', isDefault ? null : rgba(hex, 0.55));
  // Reduced transparency makes the materials opaque (Tokens.css); the setting must not undo that.
  const reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
  set('--blur', appearance.blur === 24 || reducedTransparency ? null : `${appearance.blur}px`);
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
