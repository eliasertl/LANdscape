import {
  ICON_CELLS,
  cellToPx,
  clampCell,
  findNearestFree,
  gridBounds,
  overlaps,
  pxToCell,
  type CellRect,
  type GridBounds,
} from '@landscape/shared';
import { useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { getWidget } from '../Widgets/Registry';
import { TASKBAR_RESERVED } from '../Windows/WindowGeometry';

/** The grid that fits the current viewport (above the floating taskbar). */
export function viewportBounds(): GridBounds {
  return gridBounds(window.innerWidth, window.innerHeight - TASKBAR_RESERVED);
}

/** Cells a widget currently spans: read from its rendered frame, else from the registry hint. */
export function widgetCells(id: string, type: Parameters<typeof getWidget>[0]): { cols: number; rows: number } {
  const element = document.querySelector<HTMLElement>(`[data-widget-id="${CSS.escape(id)}"]`);
  const cols = Number(element?.dataset.gridCols);
  const rows = Number(element?.dataset.gridRows);
  if (cols > 0 && rows > 0) return { cols, rows };
  return getWidget(type)?.size ?? { cols: 2, rows: 1 };
}

/** The cell an item is shown at: its stored position snapped and kept inside the viewport. */
export function displayCell(x: number, y: number, cols: number, rows: number, bounds = viewportBounds()): CellRect {
  return clampCell({ ...pxToCell(x, y), cols, rows }, bounds);
}

/**
 * Moves items whose stored positions collide (e.g. layouts saved before the
 * grid existed) to the nearest free cell and persists the result. Works on
 * stored, unclamped positions so a small browser window never rearranges the
 * layout. Widgets keep their place first, then icons in creation order.
 */
export function resolveOverlaps(): number {
  const state = useDesktopStore.getState();
  const items = [
    ...state.widgets.map((w) => ({ kind: 'widget' as const, id: w.id, x: w.x, y: w.y, ...widgetCells(w.id, w.type) })),
    ...state.shortcuts.map((s) => ({ kind: 'shortcut' as const, id: s.id, x: s.x, y: s.y, ...ICON_CELLS })),
  ];
  const cells = items.map((item) => ({ ...pxToCell(item.x, item.y), cols: item.cols, rows: item.rows }));
  const viewport = viewportBounds();
  const bounds = {
    cols: Math.max(viewport.cols, ...cells.map((c) => Math.max(0, c.col) + c.cols)),
    rows: Math.max(viewport.rows, ...cells.map((c) => Math.max(0, c.row) + c.rows)),
  };
  const placed: CellRect[] = [];
  let moved = 0;
  items.forEach((item, index) => {
    const wanted = clampCell(cells[index] as CellRect, bounds);
    const spot = placed.some((p) => overlaps(p, wanted)) ? findNearestFree(wanted, placed, bounds) : wanted;
    placed.push({ ...wanted, col: spot.col, row: spot.row });
    if (spot.col === wanted.col && spot.row === wanted.row) return;
    const px = cellToPx(spot.col, spot.row);
    if (item.kind === 'widget') state.moveWidget(item.id, px.x, px.y);
    else state.moveShortcut(item.id, px.x, px.y);
    moved += 1;
  });
  return moved;
}

/**
 * Where every item is shown right now: its stored position snapped and
 * clamped into the viewport, stepping aside to the nearest free cell when
 * clamping makes it collide. Display only; nothing is persisted.
 */
export function computeDisplayLayout(): Record<string, CellRect> {
  const { shortcuts, widgets } = useDesktopStore.getState();
  const bounds = viewportBounds();
  const items = [
    ...widgets.map((w) => ({ key: `widget:${w.id}`, x: w.x, y: w.y, ...widgetCells(w.id, w.type) })),
    ...shortcuts.map((s) => ({ key: `shortcut:${s.id}`, x: s.x, y: s.y, ...ICON_CELLS })),
  ];
  const placed: CellRect[] = [];
  const layout: Record<string, CellRect> = {};
  for (const item of items) {
    const wanted = displayCell(item.x, item.y, item.cols, item.rows, bounds);
    const spot = placed.some((p) => overlaps(p, wanted)) ? findNearestFree(wanted, placed, bounds) : wanted;
    const cell = { ...wanted, col: spot.col, row: spot.row };
    placed.push(cell);
    layout[item.key] = cell;
  }
  return layout;
}

/** Recomputes the display layout (after data, viewport or widget-size changes). */
export function refreshDisplayLayout(): void {
  useUiStore.getState().setDisplayLayout(computeDisplayLayout());
}

/** Every shown item's cells except `excludeKey` ("shortcut:<id>" or "widget:<id>"). */
export function occupiedCells(excludeKey: string | null): CellRect[] {
  const layout = computeDisplayLayout();
  return Object.entries(layout)
    .filter(([key]) => key !== excludeKey)
    .map(([, cell]) => cell);
}
