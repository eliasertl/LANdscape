/**
 * UI scale (a per-device setting) is applied as CSS `zoom` on <html>. Under
 * zoom, pointer coordinates, getBoundingClientRect() and window.innerWidth
 * are in screen pixels while CSS lengths are in layout pixels (screen / scale).
 * Code that turns screen measurements into positions converts with these
 * helpers; everything else keeps working in plain CSS pixels.
 */
let scale = 1;

export function uiScale(): number {
  return scale;
}

export function applyUiScale(next: number): void {
  if (!Number.isFinite(next) || next <= 0) next = 1;
  if (next === scale) return;
  scale = next;
  document.documentElement.style.zoom = next === 1 ? '' : String(next);
  // Everything that depends on the viewport (window clamping, the desktop grid) listens for resize.
  window.dispatchEvent(new Event('resize'));
}

/** Screen pixels (events, client rects) → layout pixels (CSS). */
export function toLayout(px: number): number {
  return px / scale;
}

/** The viewport in layout pixels. */
export function layoutViewport(): { width: number; height: number } {
  return { width: window.innerWidth / scale, height: window.innerHeight / scale };
}
