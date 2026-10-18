import { describe, expect, it } from 'vitest';
import {
  DESKTOP_GRID,
  cellToPx,
  cellsForSize,
  clampCell,
  findFirstFree,
  findNearestFree,
  gridBounds,
  overlaps,
  pxToCell,
  sizeForCells,
} from '@landscape/shared';

describe('desktop grid', () => {
  it('converts between px and cells, snapping to the nearest grid point', () => {
    expect(cellToPx(0, 0)).toEqual({ x: DESKTOP_GRID.originX, y: DESKTOP_GRID.originY });
    expect(cellToPx(3, 2)).toEqual({ x: 16 + 3 * 48, y: 16 + 2 * 56 });
    expect(pxToCell(16 + 3 * 48 + 20, 16 + 2 * 56 - 20)).toEqual({ col: 3, row: 2 });
    expect(pxToCell(16 + 3 * 48 + 30, 16 + 2 * 56 + 30)).toEqual({ col: 4, row: 3 });
  });

  it('rounds widget sizes up to whole units and back', () => {
    expect(cellsForSize(232, 104)).toEqual({ cols: 5, rows: 2 });
    expect(sizeForCells(5, 2)).toEqual({ width: 232, height: 104 });
    expect(cellsForSize(233, 105)).toEqual({ cols: 6, rows: 3 });
    expect(cellsForSize(1, 1)).toEqual({ cols: 1, rows: 1 });
  });

  it('computes bounds and clamps items inside them', () => {
    expect(gridBounds(1440, 828)).toEqual({ cols: 29, rows: 14 });
    expect(clampCell({ col: 40, row: 20, cols: 2, rows: 2 }, { cols: 29, rows: 14 })).toMatchObject({ col: 27, row: 12 });
    expect(clampCell({ col: -3, row: -1, cols: 2, rows: 2 }, { cols: 29, rows: 14 })).toMatchObject({ col: 0, row: 0 });
  });

  it('detects overlaps', () => {
    expect(overlaps({ col: 0, row: 0, cols: 2, rows: 2 }, { col: 1, row: 1, cols: 2, rows: 2 })).toBe(true);
    expect(overlaps({ col: 0, row: 0, cols: 2, rows: 2 }, { col: 2, row: 0, cols: 2, rows: 2 })).toBe(false);
  });

  it('finds the nearest free cell when the desired one is taken', () => {
    const bounds = { cols: 10, rows: 6 };
    const occupied = [{ col: 2, row: 2, cols: 2, rows: 2 }];
    expect(findNearestFree({ col: 5, row: 0, cols: 2, rows: 2 }, occupied, bounds)).toEqual({ col: 5, row: 0 });
    const spot = findNearestFree({ col: 2, row: 2, cols: 2, rows: 2 }, occupied, bounds);
    expect(overlaps({ ...spot, cols: 2, rows: 2 }, occupied[0]!)).toBe(false);
    expect(Math.abs(spot.col - 2) + Math.abs(spot.row - 2)).toBe(2);
  });

  it('fills column by column from the top left', () => {
    const bounds = { cols: 10, rows: 6 };
    const widget = { col: 0, row: 0, cols: 5, rows: 2 };
    expect(findFirstFree(2, 2, [widget], bounds)).toEqual({ col: 0, row: 2 });
    const column = [widget, { col: 0, row: 2, cols: 2, rows: 2 }, { col: 0, row: 4, cols: 2, rows: 2 }];
    expect(findFirstFree(2, 2, column, bounds)).toEqual({ col: 2, row: 2 });
  });
});
