export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TASKBAR_RESERVED = 72;
export const TITLEBAR_VISIBLE_MIN = 40;

/** The area windows may occupy: the viewport minus the floating taskbar. */
export function workArea(): Rect {
  return { x: 0, y: 0, width: window.innerWidth, height: Math.max(200, window.innerHeight - TASKBAR_RESERVED) };
}

/**
 * Keeps a window usable: at least min size, no larger than the work area,
 * and the title bar always reachable (a strip stays visible on every side).
 */
export function clampRect(rect: Rect, area: Rect, min: { width: number; height: number }): Rect {
  const width = Math.min(Math.max(rect.width, min.width), area.width);
  const height = Math.min(Math.max(rect.height, min.height), area.height);
  const minVisible = 80;
  const x = Math.min(Math.max(rect.x, area.x - width + minVisible), area.x + area.width - minVisible);
  const y = Math.min(Math.max(rect.y, area.y), area.y + area.height - TITLEBAR_VISIBLE_MIN);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/** Offsets a rect while it overlaps an existing sibling at the same origin. */
export function cascadeRect(rect: Rect, siblings: Rect[], area: Rect): Rect {
  let next = { ...rect };
  const step = 28;
  for (let i = 0; i < 20; i += 1) {
    const collides = siblings.some((s) => Math.abs(s.x - next.x) < 8 && Math.abs(s.y - next.y) < 8);
    if (!collides) break;
    next = { ...next, x: next.x + step, y: next.y + step };
    if (next.x + next.width > area.x + area.width || next.y + next.height > area.y + area.height) {
      next = { ...next, x: rect.x + 8 * (i + 1), y: area.y + 8 };
    }
  }
  return next;
}

/** Applies a resize from one of eight handles to a rect, honouring minimums. */
export function resizeRect(
  start: Rect,
  edge: string,
  dx: number,
  dy: number,
  min: { width: number; height: number },
  area: Rect,
): Rect {
  let { x, y, width, height } = start;
  if (edge.includes('e')) width = Math.max(min.width, Math.min(start.width + dx, area.x + area.width - x));
  if (edge.includes('s')) height = Math.max(min.height, Math.min(start.height + dy, area.y + area.height - y));
  if (edge.includes('w')) {
    const newWidth = Math.max(min.width, start.width - dx);
    const maxWidth = start.x + start.width - area.x;
    width = Math.min(newWidth, maxWidth);
    x = start.x + start.width - width;
  }
  if (edge.includes('n')) {
    const newHeight = Math.max(min.height, start.height - dy);
    const maxHeight = start.y + start.height - area.y;
    height = Math.min(newHeight, maxHeight);
    y = start.y + start.height - height;
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}
