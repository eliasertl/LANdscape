import { describe, expect, it } from 'vitest';
import { anchorFromCell, cellFromAnchor, gridBounds, gridMetrics, topLeftAnchor, type AnchoredPosition } from '@landscape/shared';

const ICON = { cols: 1, rows: 1 };
/** 1440 × 900 laptop (above the taskbar) and 3440 × 1440 ultra-wide, with the default 96 × 112 cell. */
const LAPTOP = gridBounds(1440, 900 - 72);
const UWQHD = gridBounds(3440, 1440 - 72);

describe('anchored layout', () => {
  it('derives the grid from laptop and ultra-wide screens', () => {
    expect(LAPTOP).toEqual({ cols: 14, rows: 7 });
    expect(UWQHD).toEqual({ cols: 35, rows: 12 });
  });

  it('keeps top-left items where they are on every screen', () => {
    const position = topLeftAnchor(2, 3);
    expect(cellFromAnchor(position, ICON, LAPTOP)).toEqual({ col: 2, row: 3 });
    expect(cellFromAnchor(position, ICON, UWQHD)).toEqual({ col: 2, row: 3 });
  });

  it('picks the anchor from the third of the screen that holds the item, and round-trips', () => {
    const rightEdge = anchorFromCell({ col: 13, row: 6, ...ICON }, LAPTOP);
    expect(rightEdge).toEqual({ anchorX: 'right', anchorY: 'bottom', offsetCol: 0, offsetRow: 0 });
    expect(cellFromAnchor(rightEdge, ICON, LAPTOP)).toEqual({ col: 13, row: 6 });

    const centered = anchorFromCell({ col: 6, row: 3, ...ICON }, LAPTOP);
    expect(centered).toEqual({ anchorX: 'center', anchorY: 'center', offsetCol: 0, offsetRow: 0 });
    expect(cellFromAnchor(centered, ICON, LAPTOP)).toEqual({ col: 6, row: 3 });

    const topLeft = anchorFromCell({ col: 1, row: 0, ...ICON }, LAPTOP);
    expect(topLeft).toEqual(topLeftAnchor(1, 0));
  });

  it('keeps right- and bottom-edge items at the edge when the screen grows', () => {
    const dropped = anchorFromCell({ col: 12, row: 5, ...ICON }, LAPTOP); // one cell in from the corner
    const onUwqhd = cellFromAnchor(dropped, ICON, UWQHD);
    expect(onUwqhd).toEqual({ col: UWQHD.cols - 2, row: UWQHD.rows - 2 });
  });

  it('keeps centered items centered when the screen grows', () => {
    const widget = { cols: 3, rows: 2 };
    const dropped = anchorFromCell({ col: 5, row: 2, ...widget }, LAPTOP); // center of a 14 × 7 grid
    expect(dropped.anchorX).toBe('center');
    expect(dropped.anchorY).toBe('center');
    const onUwqhd = cellFromAnchor(dropped, widget, UWQHD);
    expect(onUwqhd).toEqual({ col: Math.floor((35 - 3) / 2) + dropped.offsetCol, row: Math.floor((12 - 2) / 2) + dropped.offsetRow });
    // Symmetric around the middle of the screen.
    expect(onUwqhd.col + widget.cols / 2).toBeCloseTo(UWQHD.cols / 2, 0);
  });

  it('round-trips every cell of a grid', () => {
    for (let col = 0; col < LAPTOP.cols; col += 1) {
      for (let row = 0; row < LAPTOP.rows; row += 1) {
        const position: AnchoredPosition = anchorFromCell({ col, row, ...ICON }, LAPTOP);
        expect(cellFromAnchor(position, ICON, LAPTOP)).toEqual({ col, row });
      }
    }
  });

  it('matches the pixel migration formula of migration 3', () => {
    // offset = round((px - 16) / unit): a shortcut stored at (16 + 3 * 96, 16 + 2 * 112) becomes cell (3, 2).
    const unit = gridMetrics();
    const x = 16 + 3 * 96;
    const y = 16 + 2 * 112;
    expect({ col: Math.round((x - unit.originX) / unit.unitX), row: Math.round((y - unit.originY) / unit.unitY) }).toEqual({ col: 3, row: 2 });
  });

  it('scales the cell with icon size and density', () => {
    expect(gridMetrics('m', 'normal')).toMatchObject({ unitX: 96, unitY: 112, iconPx: 56 });
    expect(gridMetrics('s', 'compact')).toMatchObject({ unitX: 80, unitY: 96, iconPx: 48 });
    expect(gridMetrics('l', 'roomy')).toMatchObject({ unitX: 128, unitY: 144, iconPx: 72 });
  });
});
