import { describe, expect, it } from 'vitest';
import {
  DESKTOP_GRID,
  ICON_CELLS,
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
  it('uses the app icon as the cell', () => {
    expect(ICON_CELLS).toEqual({ cols: 1, rows: 1 });
    expect(DESKTOP_GRID.unitX).toBe(96);
    expect(DESKTOP_GRID.unitY).toBe(112);
  });

  it('converts between px and cells, snapping to the nearest grid point', () => {
    expect(cellToPx(0, 0)).toEqual({ x: 16, y: 16 });
    expect(cellToPx(3, 2)).toEqual({ x: 16 + 3 * 96, y: 16 + 2 * 112 });
    expect(pxToCell(16 + 3 * 96 + 40, 16 + 2 * 112 - 40)).toEqual({ col: 3, row: 2 });
    expect(pxToCell(16 + 3 * 96 + 60, 16 + 2 * 112 + 60)).toEqual({ col: 4, row: 3 });
  });

  it('sizes widgets as whole multiples of the icon cell, minus the gap', () => {
    expect(sizeForCells(2, 1)).toEqual({ width: 2 * 96 - 8, height: 112 - 8 });
    expect(sizeForCells(3, 2)).toEqual({ width: 3 * 96 - 8, height: 2 * 112 - 8 });
    expect(cellsForSize(184, 104)).toEqual({ cols: 2, rows: 1 });
    expect(cellsForSize(185, 105)).toEqual({ cols: 3, rows: 2 });
  });

  it('computes bounds and clamps items inside them', () => {
    expect(gridBounds(1440, 828)).toEqual({ cols: 14, rows: 7 });
    expect(clampCell({ col: 40, row: 20, cols: 2, rows: 1 }, { cols: 14, rows: 7 })).toMatchObject({ col: 12, row: 6 });
    expect(clampCell({ col: -3, row: -1, cols: 1, rows: 1 }, { cols: 14, rows: 7 })).toMatchObject({ col: 0, row: 0 });
  });

  it('detects overlaps', () => {
    expect(overlaps({ col: 0, row: 0, cols: 3, rows: 2 }, { col: 2, row: 1, cols: 1, rows: 1 })).toBe(true);
    expect(overlaps({ col: 0, row: 0, cols: 3, rows: 2 }, { col: 3, row: 0, cols: 1, rows: 1 })).toBe(false);
  });

  it('finds the nearest free cell when the desired one is taken', () => {
    const bounds = { cols: 10, rows: 6 };
    const occupied = [{ col: 2, row: 2, cols: 2, rows: 1 }];
    expect(findNearestFree({ col: 5, row: 0, cols: 1, rows: 1 }, occupied, bounds)).toEqual({ col: 5, row: 0 });
    const spot = findNearestFree({ col: 2, row: 2, cols: 1, rows: 1 }, occupied, bounds);
    expect(overlaps({ ...spot, cols: 1, rows: 1 }, occupied[0]!)).toBe(false);
    expect(Math.abs(spot.col - 2) + Math.abs(spot.row - 2)).toBe(1);
  });

  it('fills column by column from the top left', () => {
    const bounds = { cols: 10, rows: 4 };
    const clock = { col: 0, row: 0, cols: 2, rows: 1 };
    const cpu = { col: 0, row: 1, cols: 3, rows: 2 };
    expect(findFirstFree(1, 1, [clock, cpu], bounds)).toEqual({ col: 0, row: 3 });
    expect(findFirstFree(1, 1, [clock, cpu, { col: 0, row: 3, cols: 1, rows: 1 }], bounds)).toEqual({ col: 1, row: 3 });
  });
});
