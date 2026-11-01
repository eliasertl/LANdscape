import { useMemo } from 'react';
import {
  ICON_CELLS,
  anchorFromCell,
  cellFromAnchor,
  clampCell,
  findNearestFree,
  gridBounds,
  gridMetrics,
  overlaps,
  samePosition,
  type AnchoredPosition,
  type CellRect,
  type GridBounds,
  type GridMetrics,
  type Widget,
} from '@landscape/shared';
import { useDesktopStore, type PositionedItem } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { getWidget } from '../Widgets/Registry';
import { TASKBAR_RESERVED } from '../Windows/WindowGeometry';
import { layoutViewport } from '../Design/Scale';

/** The grid cell in use: follows icon size and density from Settings → Desktop. */
export function currentGrid(): GridMetrics {
  const desktop = useDesktopStore.getState().settings?.desktop;
  return gridMetrics(desktop?.iconSize ?? 'm', desktop?.density ?? 'normal');
}

/** Same as currentGrid(), but re-renders the component when Settings → Desktop changes the cell (memoized components need this). */
export function useCurrentGrid(): GridMetrics {
  const iconSize = useDesktopStore((s) => s.settings?.desktop.iconSize ?? 'm');
  const density = useDesktopStore((s) => s.settings?.desktop.density ?? 'normal');
  return useMemo(() => gridMetrics(iconSize, density), [iconSize, density]);
}

/** The grid that fits the current viewport (above the floating taskbar). */
export function viewportBounds(grid = currentGrid()): GridBounds {
  const viewport = layoutViewport();
  return gridBounds(viewport.width, viewport.height - TASKBAR_RESERVED, grid);
}

/** Cells a widget spans at its current size step (falls back to the type's medium size). */
export function widgetCells(widget: Pick<Widget, 'type' | 'size'>): { cols: number; rows: number } {
  const definition = getWidget(widget.type);
  return definition?.sizes[widget.size] ?? definition?.sizes.m ?? { cols: 2, rows: 1 };
}

export interface DesktopItem {
  key: string;
  kind: PositionedItem['kind'];
  id: string;
  position: AnchoredPosition;
  cols: number;
  rows: number;
}

/** Everything placed on the desktop itself: widgets first (they keep their place), then folders, then loose shortcuts. */
export function desktopItems(): DesktopItem[] {
  const { shortcuts, widgets, folders } = useDesktopStore.getState();
  return [
    ...widgets.map((w) => ({ key: `widget:${w.id}`, kind: 'widget' as const, id: w.id, position: w.position, ...widgetCells(w) })),
    ...folders.map((f) => ({ key: `folder:${f.id}`, kind: 'folder' as const, id: f.id, position: f.position, ...ICON_CELLS })),
    ...shortcuts.filter((s) => s.folderId === null).map((s) => ({ key: `shortcut:${s.id}`, kind: 'shortcut' as const, id: s.id, position: s.position, ...ICON_CELLS })),
  ];
}

/** The cell an item is shown at: its anchor resolved for these bounds and kept inside them. */
export function displayCell(position: AnchoredPosition, cols: number, rows: number, bounds = viewportBounds()): CellRect {
  return clampCell({ ...cellFromAnchor(position, { cols, rows }, bounds), cols, rows }, bounds);
}

/** The anchor to store for an item dropped on `cell` of the current screen. */
export function positionForCell(cell: CellRect, bounds = viewportBounds()): AnchoredPosition {
  return anchorFromCell(cell, bounds);
}

/**
 * Where every item is shown right now: anchors resolved against the current
 * screen, clamped into it, stepping aside to the nearest free cell when that
 * makes them collide. Display only; nothing is persisted.
 */
export function computeDisplayLayout(): Record<string, CellRect> {
  const bounds = viewportBounds();
  const placed: CellRect[] = [];
  const layout: Record<string, CellRect> = {};
  for (const item of desktopItems()) {
    const wanted = displayCell(item.position, item.cols, item.rows, bounds);
    const spot = placed.some((p) => overlaps(p, wanted)) ? findNearestFree(wanted, placed, bounds) : wanted;
    const cell = { ...wanted, col: spot.col, row: spot.row };
    placed.push(cell);
    layout[item.key] = cell;
  }
  return layout;
}

/** Recomputes the display layout (after data, viewport, grid or widget-size changes). */
export function refreshDisplayLayout(): void {
  useUiStore.getState().setDisplayLayout(computeDisplayLayout());
}

/** Every shown item's cells except `excludeKey` ("shortcut:<id>", "widget:<id>" or "folder:<id>"). */
export function occupiedCells(excludeKey: string | null): CellRect[] {
  const layout = computeDisplayLayout();
  return Object.entries(layout)
    .filter(([key]) => key !== excludeKey)
    .map(([, cell]) => cell);
}

/** The folder shown at a cell, if any (drop target for shortcuts). */
export function folderAtCell(col: number, row: number): string | null {
  const layout = useUiStore.getState().displayLayout;
  for (const [key, cell] of Object.entries(layout)) {
    if (key.startsWith('folder:') && cell.col === col && cell.row === row) return key.slice('folder:'.length);
  }
  return null;
}

/**
 * Moves items whose stored positions collide on a large enough grid (e.g.
 * layouts saved before the grid existed) to the nearest free cell and
 * persists the result. Works on a grid at least as large as the layout, so
 * a small browser window never rearranges it.
 */
export function resolveOverlaps(): number {
  const items = desktopItems();
  const viewport = viewportBounds();
  const cells = items.map((item) => cellFromAnchor(item.position, item, viewport));
  const bounds = {
    cols: Math.max(viewport.cols, ...cells.map((c, i) => Math.max(0, c.col) + (items[i] as DesktopItem).cols)),
    rows: Math.max(viewport.rows, ...cells.map((c, i) => Math.max(0, c.row) + (items[i] as DesktopItem).rows)),
  };
  const placed: CellRect[] = [];
  const moves: PositionedItem[] = [];
  items.forEach((item, index) => {
    const wanted = clampCell({ ...(cells[index] as { col: number; row: number }), cols: item.cols, rows: item.rows }, bounds);
    const spot = placed.some((p) => overlaps(p, wanted)) ? findNearestFree(wanted, placed, bounds) : wanted;
    placed.push({ ...wanted, col: spot.col, row: spot.row });
    if (spot.col === wanted.col && spot.row === wanted.row) return;
    moves.push({ kind: item.kind, id: item.id, position: anchorFromCell({ ...wanted, col: spot.col, row: spot.row }, bounds) });
  });
  if (moves.length > 0) useDesktopStore.getState().moveItems(moves);
  return moves.length;
}

/**
 * "Re-anchor layout for this screen": stores every item's anchor from the
 * cell it is shown at right now, so the thirds of *this* screen decide what
 * sticks to which edge.
 */
export function reanchorForThisScreen(): number {
  const bounds = viewportBounds();
  const layout = computeDisplayLayout();
  const moves: PositionedItem[] = [];
  for (const item of desktopItems()) {
    const cell = layout[item.key];
    if (!cell) continue;
    const position = anchorFromCell(cell, bounds);
    if (!samePosition(position, item.position)) moves.push({ kind: item.kind, id: item.id, position });
  }
  if (moves.length > 0) useDesktopStore.getState().moveItems(moves);
  return moves.length;
}
