import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { cellToPx, findNearestFree, pxToCell, sizeForCells } from '@landscape/shared';
import { usePointerDrag } from '../Hooks/UsePointerDrag';
import { useViewportSize } from '../Hooks/UseViewportSize';
import { useUiStore } from '../Store/UiStore';
import { displayCell, occupiedCells, viewportBounds } from './DesktopGrid';

interface GridDragOptions {
  /** "shortcut:<id>" or "widget:<id>"; excluded from collision checks. */
  itemKey: string;
  x: number;
  y: number;
  cols: number;
  rows: number;
  elementRef: RefObject<HTMLElement | null>;
  onCommit: (x: number, y: number) => void;
  onStart?: () => void;
}

const SETTLE_MS = 220;

/**
 * Free dragging that snaps to the desktop grid on release. While dragging,
 * the target cell (nearest free spot) is shown as an outline; on drop the
 * item glides into it and the snapped position is committed.
 */
export function useGridDrag({ itemKey, x, y, cols, rows, elementRef, onCommit, onStart }: GridDragOptions) {
  const viewport = useViewportSize();
  const setInteracting = useUiStore((s) => s.setInteracting);
  const setSnapPreview = useUiStore((s) => s.setSnapPreview);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef<{ col: number; row: number } | null>(null);

  const laidOut = useUiStore((s) => s.displayLayout[itemKey]);
  void viewport; // re-render on resize so the fallback is re-clamped
  const cell = laidOut ?? displayCell(x, y, cols, rows);
  const base = cellToPx(cell.col, cell.row);

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
      setDragging(true);
      setSettling(false);
      setInteracting(true);
      onStart?.();
    },
    onMove: ({ dx, dy }) => {
      const px = { x: startRef.current.x + dx, y: startRef.current.y + dy };
      const element = elementRef.current;
      if (element) element.style.transform = `translate(${px.x}px, ${px.y}px)`;
      const desired = { ...pxToCell(px.x, px.y), cols, rows };
      const spot = findNearestFree(desired, occupiedCells(itemKey), viewportBounds());
      const current = targetRef.current;
      if (current && current.col === spot.col && current.row === spot.row && useUiStore.getState().snapPreview) return;
      targetRef.current = spot;
      setSnapPreview({ ...cellToPx(spot.col, spot.row), ...sizeForCells(cols, rows) });
    },
    onEnd: (_info, dragged) => {
      setSnapPreview(null);
      if (!dragged) {
        setDragging(false);
        return;
      }
      setInteracting(false);
      const spot = targetRef.current ?? { col: cell.col, row: cell.row };
      const px = cellToPx(spot.col, spot.row);
      setSettling(true);
      const element = elementRef.current;
      if (element) element.style.transform = `translate(${px.x}px, ${px.y}px)`;
      onCommit(px.x, px.y);
      setDragging(false);
      window.setTimeout(() => setSettling(false), SETTLE_MS);
    },
  });

  return { onPointerDown, dragging, settling };
}
