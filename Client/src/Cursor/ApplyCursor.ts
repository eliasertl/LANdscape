import type { Settings } from '@landscape/shared';
import { registries, type CursorSetDefinition, type CursorState } from '../Platform/Registries';
import { isSafeMode } from '../Platform/SafeMode';

const STYLE_ID = 'landscape-cursor';

/** Which elements show which state. The fallback keyword keeps things sane where an image cannot load. */
const SELECTORS: Record<CursorState, { selector: string; fallback: string }> = {
  default: { selector: 'html, body, *', fallback: 'default' },
  pointer: { selector: 'a, button, [role="button"], [role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="tab"], label, select, summary, input[type="checkbox"], input[type="radio"], input[type="range"]', fallback: 'pointer' },
  text: { selector: 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), textarea, [contenteditable="true"], pre, code', fallback: 'text' },
  move: { selector: '[data-cursor="move"]', fallback: 'move' },
  resize: { selector: '[data-cursor="resize"]', fallback: 'nwse-resize' },
  busy: { selector: '[aria-busy="true"], [data-cursor="busy"]', fallback: 'progress' },
};

/** Base drawing size of the built-in sets (CursorSets.ts) and of uploads before scaling. */
const BASE_PX = 32;

function scaledUrl(url: string, scale: number): string {
  // Built-in sets are inline SVG data URLs: resize by rewriting the width/height attributes.
  if (url.startsWith('data:image/svg+xml;utf8,')) {
    const size = Math.round(BASE_PX * scale);
    const decoded = decodeURIComponent(url.slice('data:image/svg+xml;utf8,'.length));
    return `data:image/svg+xml;utf8,${encodeURIComponent(decoded.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`))}`;
  }
  return url;
}

/** Resolves the set in effect: a registry entry, the uploads ("custom"), or none for "system". */
export function resolveCursorSet(cursor: Settings['cursor']): CursorSetDefinition | null {
  if (cursor.set === 'system') return null;
  if (cursor.set === 'custom') {
    const cursors: CursorSetDefinition['cursors'] = {};
    for (const [state, upload] of Object.entries(cursor.custom)) {
      if (upload) cursors[state as CursorState] = { url: `/cursors/${upload.file}`, hotspotX: upload.hotspotX, hotspotY: upload.hotspotY };
    }
    return { id: 'custom', name: 'Custom', cursors };
  }
  return registries.cursorSets.get(cursor.set) ?? null;
}

/**
 * Applies the cursor set as a <style> element with `cursor: url(...) x y,
 * fallback` rules per state. Embedded third-party pages (iframes) keep their
 * own cursor; nothing can change that from outside. Safe mode uses the
 * system cursor.
 */
export function applyCursor(cursor: Settings['cursor'], scale: number): void {
  let element = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const set = isSafeMode() ? null : resolveCursorSet(cursor);
  if (!set || Object.keys(set.cursors).length === 0) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('style');
    element.id = STYLE_ID;
    document.head.appendChild(element);
  }
  const rules: string[] = [];
  for (const state of Object.keys(SELECTORS) as CursorState[]) {
    const image = set.cursors[state];
    if (!image) continue;
    const { selector, fallback } = SELECTORS[state];
    const x = Math.round(image.hotspotX * scale);
    const y = Math.round(image.hotspotY * scale);
    const url = scaledUrl(image.url, scale);
    rules.push(`${selector} { cursor: url("${url}") ${x} ${y}, ${fallback} !important; }`);
  }
  element.textContent = rules.join('\n');
}
