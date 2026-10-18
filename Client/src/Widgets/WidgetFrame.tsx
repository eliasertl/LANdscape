import { createElement, memo, useEffect, useRef, type ReactNode } from 'react';
import { GearSix, Trash, WarningCircle } from '@phosphor-icons/react';
import { sizeForCells, type Widget } from '@landscape/shared';
import { useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { useGridDrag } from '../Desktop/UseGridDrag';
import { refreshDisplayLayout } from '../Desktop/DesktopGrid';
import { getWidget } from './Registry';
import styles from './WidgetFrame.module.css';

interface WidgetFrameProps {
  widget: Widget;
  title: string;
  children: ReactNode;
  /** Shown instead of the content when the metric is unavailable. */
  unavailable?: string | null;
  className?: string;
}

/** Draggable frosted card on the desktop grid; right-click offers settings and removal. */
export const WidgetFrame = memo(function WidgetFrame({ widget, title, children, unavailable, className }: WidgetFrameProps) {
  const moveWidget = useDesktopStore((s) => s.moveWidget);
  const removeWidget = useDesktopStore((s) => s.removeWidget);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const openWidgetSettings = useUiStore((s) => s.openWidgetSettings);
  const requestConfirm = useUiStore((s) => s.requestConfirm);
  const ref = useRef<HTMLDivElement>(null);

  // Always a whole number of app-icon cells, as declared in the registry.
  const cells = getWidget(widget.type)?.size ?? { cols: 2, rows: 1 };
  const size = sizeForCells(cells.cols, cells.rows);

  const { onPointerDown, dragging, settling } = useGridDrag({
    itemKey: `widget:${widget.id}`,
    x: widget.x,
    y: widget.y,
    cols: cells.cols,
    rows: cells.rows,
    elementRef: ref,
    onCommit: (x, y) => moveWidget(widget.id, x, y),
  });

  const definition = getWidget(widget.type);

  // A widget that grows or shrinks (e.g. data arrives) changes the layout around it.
  useEffect(() => {
    refreshDisplayLayout();
  }, [cells.cols, cells.rows]);

  return (
    <div
      ref={ref}
      className={[styles.frame, 'material', dragging ? styles.dragging : '', settling ? 'grid-settling' : '', className ?? ''].join(' ')}
      style={{ width: size.width, height: size.height }}
      role="group"
      aria-label={`${title} widget`}
      data-widget-id={widget.id}
      data-grid-cols={cells.cols}
      data-grid-rows={cells.rows}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown(e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openContextMenu(
          [
            { label: 'Widget settings…', icon: createElement(GearSix), onSelect: () => openWidgetSettings(widget.id) },
            { type: 'separator' },
            {
              label: 'Remove widget',
              icon: createElement(Trash),
              danger: true,
              onSelect: () =>
                requestConfirm({
                  title: `Remove the ${definition?.name ?? title} widget?`,
                  message: 'You can add it again from the desktop context menu.',
                  confirmLabel: 'Remove',
                  danger: true,
                  onConfirm: () => removeWidget(widget.id),
                }),
            },
          ],
          { x: e.clientX, y: e.clientY },
        );
      }}
    >
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.body}>
        {unavailable ? (
          <div className={styles.unavailable}>
            <WarningCircle weight="fill" />
            <span>
              <strong>Not available</strong> — see README
              <span className={styles.unavailableReason}>{unavailable}</span>
            </span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
});
