/**
 * The desktop grid shared by shortcut icons, folders and widgets. One cell
 * is exactly one app icon; its size follows the icon size and grid density
 * from Settings → Desktop (gridMetrics). Icons take one cell; every widget
 * spans a whole number of cells (rendered at cols*unitX - gap by
 * rows*unitY - gap so neighbours keep a gap). Positions are stored as
 * anchors in cells (Layout.ts), never in pixels.
 */
export type IconSize = 's' | 'm' | 'l';
export type GridDensity = 'compact' | 'normal' | 'roomy';

export interface GridMetrics {
  unitX: number;
  unitY: number;
  originX: number;
  originY: number;
  gap: number;
  /** Rendered icon image size in px. */
  iconPx: number;
}

export const ICON_PX: Record<IconSize, number> = { s: 48, m: 56, l: 72 };
const DENSITY_DELTA: Record<GridDensity, number> = { compact: -8, normal: 0, roomy: 16 };

/** Cell size for an icon size and density; "m"/"normal" is the original 96 × 112 grid. */
export function gridMetrics(iconSize: IconSize = 'm', density: GridDensity = 'normal'): GridMetrics {
  const iconPx = ICON_PX[iconSize];
  const delta = DENSITY_DELTA[density];
  return { unitX: iconPx + 40 + delta, unitY: iconPx + 56 + delta, originX: 16, originY: 16, gap: 8, iconPx };
}

export const DEFAULT_GRID: GridMetrics = gridMetrics();
/** @deprecated use gridMetrics(); kept for code that only needs the default cell. */
export const DESKTOP_GRID = DEFAULT_GRID;

export const ICON_CELLS = { cols: 1, rows: 1 } as const;

export interface CellRect {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

export interface GridBounds {
  /** Number of usable columns and rows. */
  cols: number;
  rows: number;
}

export function pxToCell(x: number, y: number, grid: GridMetrics = DEFAULT_GRID): { col: number; row: number } {
  return { col: Math.round((x - grid.originX) / grid.unitX), row: Math.round((y - grid.originY) / grid.unitY) };
}

export function cellToPx(col: number, row: number, grid: GridMetrics = DEFAULT_GRID): { x: number; y: number } {
  return { x: grid.originX + col * grid.unitX, y: grid.originY + row * grid.unitY };
}

/** Grid units needed for a widget of the given pixel size. */
export function cellsForSize(width: number, height: number, grid: GridMetrics = DEFAULT_GRID): { cols: number; rows: number } {
  return {
    cols: Math.max(1, Math.ceil((width + grid.gap) / grid.unitX - 1e-6)),
    rows: Math.max(1, Math.ceil((height + grid.gap) / grid.unitY - 1e-6)),
  };
}

/** Rendered pixel size for a widget spanning cols × rows units. */
export function sizeForCells(cols: number, rows: number, grid: GridMetrics = DEFAULT_GRID): { width: number; height: number } {
  return { width: cols * grid.unitX - grid.gap, height: rows * grid.unitY - grid.gap };
}

/** Usable grid for a desktop area of the given pixel size. */
export function gridBounds(width: number, height: number, grid: GridMetrics = DEFAULT_GRID): GridBounds {
  return {
    cols: Math.max(1, Math.floor((width - grid.originX) / grid.unitX)),
    rows: Math.max(1, Math.floor((height - grid.originY) / grid.unitY)),
  };
}

export function overlaps(a: CellRect, b: CellRect): boolean {
  return a.col < b.col + b.cols && b.col < a.col + a.cols && a.row < b.row + b.rows && b.row < a.row + a.rows;
}

/** Keeps a rect inside the grid (top-left wins when the item is larger than the grid). */
export function clampCell(rect: CellRect, bounds: GridBounds): CellRect {
  return {
    ...rect,
    col: Math.max(0, Math.min(rect.col, bounds.cols - rect.cols)),
    row: Math.max(0, Math.min(rect.row, bounds.rows - rect.rows)),
  };
}

function isFree(rect: CellRect, occupied: CellRect[]): boolean {
  return !occupied.some((o) => overlaps(rect, o));
}

/**
 * The free position closest to `desired` (Euclidean distance in cells).
 * Falls back to the clamped desired position when the grid is full.
 */
export function findNearestFree(desired: CellRect, occupied: CellRect[], bounds: GridBounds): { col: number; row: number } {
  const start = clampCell(desired, bounds);
  if (isFree(start, occupied)) return { col: start.col, row: start.row };
  const maxCol = Math.max(0, bounds.cols - desired.cols);
  const maxRow = Math.max(0, bounds.rows - desired.rows);
  let best: { col: number; row: number; distance: number } | null = null;
  for (let row = 0; row <= maxRow; row += 1) {
    for (let col = 0; col <= maxCol; col += 1) {
      const candidate = { ...desired, col, row };
      if (!isFree(candidate, occupied)) continue;
      const distance = (col - start.col) ** 2 + (row - start.row) ** 2;
      if (!best || distance < best.distance) best = { col, row, distance };
    }
  }
  return best ? { col: best.col, row: best.row } : { col: start.col, row: start.row };
}

/** First free position scanning column by column from the top left, like Finder. */
export function findFirstFree(cols: number, rows: number, occupied: CellRect[], bounds: GridBounds): { col: number; row: number } {
  const maxCol = Math.max(0, bounds.cols - cols);
  const maxRow = Math.max(0, bounds.rows - rows);
  for (let col = 0; col <= maxCol; col += 1) {
    for (let row = 0; row <= maxRow; row += 1) {
      if (isFree({ col, row, cols, rows }, occupied)) return { col, row };
    }
  }
  return { col: 0, row: 0 };
}
