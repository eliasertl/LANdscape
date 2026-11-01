import type { CursorSetDefinition, CursorState } from '../Platform/Registries';

/**
 * Built-in cursor sets, drawn by hand as SVG (no copies of Apple's or
 * Microsoft's cursors). Each state is a 32 × 32 drawing; the hotspot is in
 * that coordinate space and scales with the per-device cursor size.
 */

const svg = (body: string, size = 32) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${body}</svg>`)}`;

/** Soft rounded: a plump arrow with a white fill and a soft dark outline. */
const SOFT: Record<CursorState, { url: string; hotspotX: number; hotspotY: number }> = {
  default: {
    url: svg('<path d="M6 3 L6 24 L11.5 19.5 L15 27 L19 25.2 L15.6 17.8 L22.5 17.8 Z" fill="#fff" stroke="#1c1c1e" stroke-width="2" stroke-linejoin="round"/>'),
    hotspotX: 6,
    hotspotY: 3,
  },
  pointer: {
    url: svg(
      '<path d="M11 4.5 C11 3 13.5 3 13.5 4.5 L13.5 14 L15.5 13.6 C15.5 12.2 18 12.2 18 13.6 L18 14.6 C18 13.4 20.5 13.4 20.5 14.8 L20.5 15.8 C20.5 14.6 23 14.6 23 16 L23 21 C23 25.5 20 28 16.5 28 C13 28 11.5 26 9.5 23 L6.5 18.5 C5.7 17.3 7.3 16 8.5 16.8 L11 19 Z" fill="#fff" stroke="#1c1c1e" stroke-width="2" stroke-linejoin="round"/>',
    ),
    hotspotX: 12,
    hotspotY: 4,
  },
  text: {
    url: svg('<path d="M12 5 Q16 5 16 9 L16 23 Q16 27 12 27 M20 5 Q16 5 16 9 M20 27 Q16 27 16 23" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><path d="M12 5 Q16 5 16 9 L16 23 Q16 27 12 27 M20 5 Q16 5 16 9 M20 27 Q16 27 16 23" fill="none" stroke="#1c1c1e" stroke-width="2" stroke-linecap="round"/>'),
    hotspotX: 16,
    hotspotY: 16,
  },
  move: {
    url: svg(
      '<path d="M16 4 L20 9 L17.5 9 L17.5 14.5 L23 14.5 L23 12 L28 16 L23 20 L23 17.5 L17.5 17.5 L17.5 23 L20 23 L16 28 L12 23 L14.5 23 L14.5 17.5 L9 17.5 L9 20 L4 16 L9 12 L9 14.5 L14.5 14.5 L14.5 9 L12 9 Z" fill="#fff" stroke="#1c1c1e" stroke-width="2" stroke-linejoin="round"/>',
    ),
    hotspotX: 16,
    hotspotY: 16,
  },
  resize: {
    url: svg('<path d="M6 16 L11 11 L11 14.5 L21 14.5 L21 11 L26 16 L21 21 L21 17.5 L11 17.5 L11 21 Z" fill="#fff" stroke="#1c1c1e" stroke-width="2" stroke-linejoin="round"/>'),
    hotspotX: 16,
    hotspotY: 16,
  },
  busy: {
    url: svg(
      '<circle cx="16" cy="16" r="9" fill="none" stroke="#fff" stroke-width="5"/><circle cx="16" cy="16" r="9" fill="none" stroke="#1c1c1e" stroke-width="2.5" stroke-dasharray="20 37" stroke-linecap="round"/>',
    ),
    hotspotX: 16,
    hotspotY: 16,
  },
};

/** Large high-contrast: a bold black arrow with a thick yellow outline, easy to find on any wallpaper. */
const CONTRAST: Record<CursorState, { url: string; hotspotX: number; hotspotY: number }> = {
  default: {
    url: svg('<path d="M4 2 L4 26 L10.5 20.5 L14.5 29 L19.5 26.8 L15.5 18.5 L24 18.5 Z" fill="#000" stroke="#ffd60a" stroke-width="3" stroke-linejoin="round"/>'),
    hotspotX: 4,
    hotspotY: 2,
  },
  pointer: {
    url: svg(
      '<path d="M11 4 C11 2 14 2 14 4 L14 13.5 L16.5 13 C16.5 11.5 19.5 11.5 19.5 13 L19.5 14 C19.5 12.8 22.5 12.8 22.5 14.2 L22.5 15 C22.5 13.8 25.5 13.8 25.5 15.2 L25.5 21 C25.5 26 22 29.5 17 29.5 C13 29.5 11 27.5 9 24 L5.5 18.5 C4.5 17 6.5 15.5 8 16.5 L11 19 Z" fill="#000" stroke="#ffd60a" stroke-width="3" stroke-linejoin="round"/>',
    ),
    hotspotX: 12,
    hotspotY: 3,
  },
  text: {
    url: svg('<path d="M10 3 L22 3 M16 3 L16 29 M10 29 L22 29" fill="none" stroke="#ffd60a" stroke-width="7" stroke-linecap="round"/><path d="M10 3 L22 3 M16 3 L16 29 M10 29 L22 29" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>'),
    hotspotX: 16,
    hotspotY: 16,
  },
  move: {
    url: svg(
      '<path d="M16 2 L21 8 L18 8 L18 14 L24 14 L24 11 L30 16 L24 21 L24 18 L18 18 L18 24 L21 24 L16 30 L11 24 L14 24 L14 18 L8 18 L8 21 L2 16 L8 11 L8 14 L14 14 L14 8 L11 8 Z" fill="#000" stroke="#ffd60a" stroke-width="3" stroke-linejoin="round"/>',
    ),
    hotspotX: 16,
    hotspotY: 16,
  },
  resize: {
    url: svg('<path d="M3 16 L10 9 L10 13.5 L22 13.5 L22 9 L29 16 L22 23 L22 18.5 L10 18.5 L10 23 Z" fill="#000" stroke="#ffd60a" stroke-width="3" stroke-linejoin="round"/>'),
    hotspotX: 16,
    hotspotY: 16,
  },
  busy: {
    url: svg(
      '<circle cx="16" cy="16" r="10" fill="none" stroke="#ffd60a" stroke-width="7"/><circle cx="16" cy="16" r="10" fill="none" stroke="#000" stroke-width="3.5" stroke-dasharray="22 41" stroke-linecap="round"/>',
    ),
    hotspotX: 16,
    hotspotY: 16,
  },
};

export const BUILTIN_CURSOR_SETS: CursorSetDefinition[] = [
  { id: 'system', name: 'System', cursors: {}, source: { kind: 'builtin' } },
  { id: 'soft', name: 'Soft rounded', cursors: SOFT, source: { kind: 'builtin' } },
  { id: 'contrast', name: 'Large high-contrast', cursors: CONTRAST, source: { kind: 'builtin' } },
];
