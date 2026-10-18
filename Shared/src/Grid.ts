/**
 * The desktop grid shared by shortcut icons and widgets. One cell is exactly
 * one app icon (96 × 112 px). Icons take one cell; every widget spans a whole
 * number of icon cells (rendered at cols*unitX - gap by rows*unitY - gap so
 * neighbours keep a gap). Positions are stored in px but always land on cells.
 */
export const DESKTOP_GRID = { unitX: 96, unitY: 112, originX: 16, originY: 16, gap: 8 } as const;

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

export function pxToCell(x: number, y: number): { col: number; row: number } {
  return {
    col: Math.round((x - DESKTOP_GRID.originX) / DESKTOP_GRID.unitX),
    row: Math.round((y - DESKTOP_GRID.originY) / DESKTOP_GRID.unitY),
  };
}

export function cellToPx(col: number, row: number): { x: number; y: number } {
  return { x: DESKTOP_GRID.originX + col * DESKTOP_GRID.unitX, y: DESKTOP_GRID.originY + row * DESKTOP_GRID.unitY };
}

/** Grid units needed for a widget of the given pixel size. */
export function cellsForSize(width: number, height: number): { cols: number; rows: number } {
  return {
    cols: Math.max(1, Math.ceil((width + DESKTOP_GRID.gap) / DESKTOP_GRID.unitX - 1e-6)),
    rows: Math.max(1, Math.ceil((height + DESKTOP_GRID.gap) / DESKTOP_GRID.unitY - 1e-6)),
  };
}

/** Rendered pixel size for a widget spanning cols × rows units. */
export function sizeForCells(cols: number, rows: number): { width: number; height: number } {
  return { width: cols * DESKTOP_GRID.unitX - DESKTOP_GRID.gap, height: rows * DESKTOP_GRID.unitY - DESKTOP_GRID.gap };
}

/** Usable grid for a desktop area of the given pixel size. */
export function gridBounds(width: number, height: number): GridBounds {
  return {
    cols: Math.max(1, Math.floor((width - DESKTOP_GRID.originX) / DESKTOP_GRID.unitX)),
    rows: Math.max(1, Math.floor((height - DESKTOP_GRID.originY) / DESKTOP_GRID.unitY)),
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
