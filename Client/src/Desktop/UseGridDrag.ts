import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { cellToPx, findNearestFree, pxToCell, sizeForCells, type AnchoredPosition } from '@landscape/shared';
import { usePointerDrag } from '../Hooks/UsePointerDrag';
import { useViewportSize } from '../Hooks/UseViewportSize';
import { useUiStore } from '../Store/UiStore';
import { displayCell, folderAtCell, occupiedCells, positionForCell, useCurrentGrid, viewportBounds } from './DesktopGrid';

interface GridDragOptions {
  /** "shortcut:<id>", "widget:<id>" or "folder:<id>"; excluded from collision checks. */
  itemKey: string;
  position: AnchoredPosition;
  cols: number;
  rows: number;
  elementRef: RefObject<HTMLElement | null>;
  /** The anchor to store for the cell the item was dropped on. */
  onCommit: (position: AnchoredPosition) => void;
  onStart?: () => void;
  /** Shortcuts only: dropping onto a folder icon moves them inside instead. */
  onDropOnFolder?: (folderId: string) => void;
}

const SETTLE_MS = 220;

/**
 * Free dragging that snaps to the desktop grid on release. While dragging,
 * the target cell (nearest free spot) is shown as an outline; on drop the
 * item glides into it and the anchored position is committed.
 */
export function useGridDrag({ itemKey, position, cols, rows, elementRef, onCommit, onStart, onDropOnFolder }: GridDragOptions) {
  const viewport = useViewportSize();
  const setInteracting = useUiStore((s) => s.setInteracting);
  const setSnapPreview = useUiStore((s) => s.setSnapPreview);
  const setDropFolder = useUiStore((s) => s.setDropFolderId);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef<{ col: number; row: number } | null>(null);
  const folderRef = useRef<string | null>(null);

  const laidOut = useUiStore((s) => s.displayLayout[itemKey]);
  void viewport; // re-render on resize so the fallback is re-clamped
  const grid = useCurrentGrid();
  const cell = laidOut ?? displayCell(position, cols, rows);
  const base = cellToPx(cell.col, cell.row, grid);

  // Position is written imperatively so React never fights the drag.
  useLayoutEffect(() => {
    if (dragging) return;
    const element = elementRef.current;
    if (element) element.style.transform = `translate(${base.x}px, ${base.y}px)`;
  }, [base.x, base.y, dragging, elementRef]);

  const onPointerDown = usePointerDrag({
    onStart: () => {
      startRef.current = base;
      targetRef.current = { col: cell.col, row: cell.row };
      folderRef.current = null;
      setDragging(true);
      setSettling(false);
      setInteracting(true);
      onStart?.();
    },
    onMove: ({ dx, dy, clientX, clientY }) => {
      const px = { x: startRef.current.x + dx, y: startRef.current.y + dy };
      const element = elementRef.current;
      if (element) element.style.transform = `translate(${px.x}px, ${px.y}px)`;
      if (onDropOnFolder) {
        // The cell under the pointer decides whether this is a drop into a folder.
        const under = {
          col: Math.floor((clientX - grid.originX) / grid.unitX),
          row: Math.floor((clientY - grid.originY) / grid.unitY),
        };
        const folder = folderAtCell(under.col, under.row);
        if (folder !== folderRef.current) {
          folderRef.current = folder;
          setDropFolder(folder);
          if (folder) setSnapPreview(null);
        }
        if (folder) return;
      }
      const desired = { ...pxToCell(px.x, px.y, grid), cols, rows };
      const spot = findNearestFree(desired, occupiedCells(itemKey), viewportBounds(grid));
      const current = targetRef.current;
      if (current && current.col === spot.col && current.row === spot.row && useUiStore.getState().snapPreview) return;
      targetRef.current = spot;
      setSnapPreview({ ...cellToPx(spot.col, spot.row, grid), ...sizeForCells(cols, rows, grid) });
    },
    onEnd: (_info, dragged) => {
      setSnapPreview(null);
      setDropFolder(null);
      if (!dragged) {
        setDragging(false);
        return;
      }
      setInteracting(false);
      if (folderRef.current && onDropOnFolder) {
        onDropOnFolder(folderRef.current);
        setDragging(false);
        return;
      }
      const spot = targetRef.current ?? { col: cell.col, row: cell.row };
      const px = cellToPx(spot.col, spot.row, grid);
      setSettling(true);
      const element = elementRef.current;
      if (element) element.style.transform = `translate(${px.x}px, ${px.y}px)`;
      onCommit(positionForCell({ ...spot, cols, rows }, viewportBounds(grid)));
      setDragging(false);
      window.setTimeout(() => setSettling(false), SETTLE_MS);
    },
  });

  return { onPointerDown, dragging, settling };
}
