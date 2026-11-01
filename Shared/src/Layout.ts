import type { CellRect, GridBounds } from './Grid';

/**
 * Anchored desktop positions. An item is stored relative to an edge or the
 * center of the screen, in grid cells, so a layout keeps its shape on
 * screens of different sizes: an icon at the right edge of a laptop stays
 * at the right edge of an ultra-wide monitor, a centered widget stays
 * centered. Positions resolve to cells against the bounds of the screen in
 * use (cellFromAnchor) and are stored again from the cell an item was
 * dropped on (anchorFromCell).
 */
export type AnchorX = 'left' | 'center' | 'right';
export type AnchorY = 'top' | 'center' | 'bottom';

export interface AnchoredPosition {
  anchorX: AnchorX;
  anchorY: AnchorY;
  /** Cells from the anchor edge, or from the centered position for a center anchor (may be negative). */
  offsetCol: number;
  offsetRow: number;
}

export interface CellSize {
  cols: number;
  rows: number;
}

export function topLeftAnchor(col: number, row: number): AnchoredPosition {
  return { anchorX: 'left', anchorY: 'top', offsetCol: col, offsetRow: row };
}

function resolveAxis(anchor: 'left' | 'center' | 'right', offset: number, size: number, total: number): number {
  switch (anchor) {
    case 'left':
      return offset;
    case 'right':
      return total - size - offset;
    default:
      return Math.floor((total - size) / 2) + offset;
  }
}

/** The cell an anchored item lands on for the given bounds (not clamped; clampCell handles small screens). */
export function cellFromAnchor(position: AnchoredPosition, size: CellSize, bounds: GridBounds): { col: number; row: number } {
  const vertical = position.anchorY === 'top' ? 'left' : position.anchorY === 'bottom' ? 'right' : 'center';
  return {
    col: resolveAxis(position.anchorX, position.offsetCol, size.cols, bounds.cols),
    row: resolveAxis(vertical, position.offsetRow, size.rows, bounds.rows),
  };
}

function anchorAxis(start: number, size: number, total: number): 'left' | 'center' | 'right' {
  const center = start + size / 2;
  if (center < total / 3) return 'left';
  if (center > (2 * total) / 3) return 'right';
  return 'center';
}

/**
 * The anchor for an item dropped on `cell`: the third of the screen that
 * holds its center decides the anchor, the offset is measured from there.
 * Round-trips exactly with cellFromAnchor for the same bounds.
 */
export function anchorFromCell(cell: CellRect, bounds: GridBounds): AnchoredPosition {
  const x = anchorAxis(cell.col, cell.cols, bounds.cols);
  const y = anchorAxis(cell.row, cell.rows, bounds.rows);
  const offsetCol = x === 'left' ? cell.col : x === 'right' ? bounds.cols - cell.cols - cell.col : cell.col - Math.floor((bounds.cols - cell.cols) / 2);
  const offsetRow = y === 'left' ? cell.row : y === 'right' ? bounds.rows - cell.rows - cell.row : cell.row - Math.floor((bounds.rows - cell.rows) / 2);
  return { anchorX: x, anchorY: y === 'left' ? 'top' : y === 'right' ? 'bottom' : 'center', offsetCol, offsetRow };
}

export function samePosition(a: AnchoredPosition, b: AnchoredPosition): boolean {
  return a.anchorX === b.anchorX && a.anchorY === b.anchorY && a.offsetCol === b.offsetCol && a.offsetRow === b.offsetRow;
}
