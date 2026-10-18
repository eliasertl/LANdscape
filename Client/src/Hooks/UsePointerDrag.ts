import { useCallback, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

export interface DragInfo {
  /** Total movement since pointer down. */
  dx: number;
  dy: number;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
}

export interface PointerDragOptions {
  /** Movement in px before a drag starts (distinguishes clicks). */
  threshold?: number;
  onStart?: (info: DragInfo) => void;
  onMove: (info: DragInfo) => void;
  onEnd?: (info: DragInfo, dragged: boolean) => void;
  /** Only the primary button starts a drag. */
  button?: number;
  disabled?: boolean;
}

/**
 * Pointer-capture based dragging with a movement threshold. Returns the
 * onPointerDown handler to spread onto the draggable element. Works with
 * mouse, touch and pen. The pointer is captured immediately on pointer down
 * so that moving over iframes (which swallow events) cannot break the drag.
 */
export function usePointerDrag(options: PointerDragOptions) {
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  return useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const opts = optionsRef.current;
    if (opts.disabled) return;
    if (event.button !== (opts.button ?? 0)) return;
    const target = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    let dragging = false;
    let last: DragInfo = { dx: 0, dy: 0, clientX: startX, clientY: startY, shiftKey: event.shiftKey };

    try {
      target.setPointerCapture(pointerId);
    } catch {
      // capture is best-effort; window listeners below still work for most cases
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      last = { dx: e.clientX - startX, dy: e.clientY - startY, clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey };
      if (!dragging) {
        if (Math.hypot(last.dx, last.dy) < (optionsRef.current.threshold ?? 4)) return;
        dragging = true;
        optionsRef.current.onStart?.(last);
      }
      e.preventDefault();
      optionsRef.current.onMove(last);
    };

    const finish = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', finish);
      target.removeEventListener('lostpointercapture', finish);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      try {
        if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
      optionsRef.current.onEnd?.(last, dragging);
    };

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }, []);
}
