/** Window snapping: pure geometry shared by pointer and keyboard snapping. */
export interface SnapArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SnapZone = 'left' | 'right' | 'top' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Pointer distance from an edge (px) that counts as "at the edge". */
export const SNAP_EDGE_PX = 12;
/** Pointer distance from a corner along both axes that counts as the corner. */
export const SNAP_CORNER_PX = 80;

/** The zone the pointer is in while a window is dragged, or null away from the edges. */
export function snapZoneAt(pointer: { x: number; y: number }, area: SnapArea, edge = SNAP_EDGE_PX, corner = SNAP_CORNER_PX): SnapZone | null {
  const left = pointer.x - area.x <= edge;
  const right = area.x + area.width - pointer.x <= edge;
  const top = pointer.y - area.y <= edge;
  const bottom = area.y + area.height - pointer.y <= edge;
  const nearTop = pointer.y - area.y <= corner;
  const nearBottom = area.y + area.height - pointer.y <= corner;
  const nearLeft = pointer.x - area.x <= corner;
  const nearRight = area.x + area.width - pointer.x <= corner;
  if ((left && nearTop) || (top && nearLeft)) return 'top-left';
  if ((right && nearTop) || (top && nearRight)) return 'top-right';
  if (left && nearBottom) return 'bottom-left';
  if (right && nearBottom) return 'bottom-right';
  if (left) return 'left';
  if (right) return 'right';
  if (top) return 'top';
  void bottom;
  return null;
}

/** The rect a zone covers; `top` means the whole area (maximize). */
export function snapRect(zone: SnapZone, area: SnapArea): SnapArea {
  const halfW = Math.floor(area.width / 2);
  const halfH = Math.floor(area.height / 2);
  switch (zone) {
    case 'left':
      return { x: area.x, y: area.y, width: halfW, height: area.height };
    case 'right':
      return { x: area.x + halfW, y: area.y, width: area.width - halfW, height: area.height };
    case 'top':
      return { ...area };
    case 'top-left':
      return { x: area.x, y: area.y, width: halfW, height: halfH };
    case 'top-right':
      return { x: area.x + halfW, y: area.y, width: area.width - halfW, height: halfH };
    case 'bottom-left':
      return { x: area.x, y: area.y + halfH, width: halfW, height: area.height - halfH };
    default:
      return { x: area.x + halfW, y: area.y + halfH, width: area.width - halfW, height: area.height - halfH };
  }
}

/** The inset of the screen a taskbar takes on its edge (0 when it auto-hides). */
export function taskbarInset(taskbar: { position: 'bottom' | 'top' | 'left' | 'right'; style: string; size: 's' | 'm' | 'l'; autoHide: boolean }): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  if (taskbar.autoHide) return inset;
  const bar = TASKBAR_SIZE_PX[taskbar.size];
  // Floating styles hover above the edge with a margin; docked styles sit flush.
  const floating = taskbar.style === 'floating' || taskbar.style === 'dock';
  inset[taskbar.position] = floating ? bar + 16 : bar;
  return inset;
}

export const TASKBAR_SIZE_PX = { s: 44, m: 56, l: 68 } as const;
