import { createElement, memo, useEffect, useRef, type ReactNode } from 'react';
import { ArrowsOutSimple, GearSix, Trash, WarningCircle } from '@phosphor-icons/react';
import { sizeForCells, type Widget, type WidgetSize } from '@landscape/shared';
import { useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import type { MenuItem } from '../Components/Menu';
import { useGridDrag } from '../Desktop/UseGridDrag';
import { refreshDisplayLayout, useCurrentGrid, widgetCells } from '../Desktop/DesktopGrid';
import { toast } from '../Components/Toast';
import { errorMessage } from '../Api/Http';
import { getWidget } from './Registry';
import { WIDGET_SIZE_LABELS } from './Types';
import styles from './WidgetFrame.module.css';

interface WidgetFrameProps {
  widget: Widget;
  title: string;
  children: ReactNode;
  /** Shown instead of the content when the metric is unavailable. */
  unavailable?: string | null;
  className?: string;
}

/** Draggable frosted card on the desktop grid; right-click offers size, settings and removal. */
export const WidgetFrame = memo(function WidgetFrame({ widget, title, children, unavailable, className }: WidgetFrameProps) {
  const moveItem = useDesktopStore((s) => s.moveItem);
  const resizeWidget = useDesktopStore((s) => s.resizeWidget);
  const removeWidget = useDesktopStore((s) => s.removeWidget);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const openWidgetSettings = useUiStore((s) => s.openWidgetSettings);
  const requestConfirm = useUiStore((s) => s.requestConfirm);
  const ref = useRef<HTMLDivElement>(null);

  // Always a whole number of app-icon cells, as declared in the registry for this size step.
  const cells = widgetCells(widget);
  const size = sizeForCells(cells.cols, cells.rows, useCurrentGrid());
  const small = cells.cols === 1 && cells.rows === 1;

  const { onPointerDown, dragging, settling } = useGridDrag({
    itemKey: `widget:${widget.id}`,
    position: widget.position,
    cols: cells.cols,
    rows: cells.rows,
    elementRef: ref,
    onCommit: (position) => moveItem({ kind: 'widget', id: widget.id, position }),
  });

  const definition = getWidget(widget.type);

  // A widget that grows or shrinks changes the layout around it.
  useEffect(() => {
    refreshDisplayLayout();
  }, [cells.cols, cells.rows]);

  const sizeItems: MenuItem[] = (['s', 'm', 'l'] as WidgetSize[])
    .filter((step) => definition?.sizes[step])
    .map((step) => ({
      label: `${WIDGET_SIZE_LABELS[step]} (${definition?.sizes[step]?.cols}×${definition?.sizes[step]?.rows})`,
      checked: widget.size === step,
      onSelect: () => void resizeWidget(widget.id, step).catch((error: unknown) => toast.error(errorMessage(error))),
    }));

  return (
    <div
      ref={ref}
      className={[styles.frame, 'material', small ? styles.small : '', dragging ? styles.dragging : '', settling ? 'grid-settling' : '', className ?? ''].join(' ')}
      style={{ width: size.width, height: size.height }}
      role="group"
      aria-label={`${title} widget`}
      title={small ? title : undefined}
      data-widget-id={widget.id}
      data-widget-size={widget.size}
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
            ...(sizeItems.length > 1 ? [{ type: 'submenu' as const, label: 'Size', icon: createElement(ArrowsOutSimple), items: sizeItems }] : []),
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
      {!small && (
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
        </div>
      )}
      <div className={styles.body}>
        {unavailable ? (
          <div className={styles.unavailable} title={unavailable}>
            <WarningCircle weight="fill" />
            {!small && (
              <span>
                <strong>Not available</strong> — see README
                <span className={styles.unavailableReason}>{unavailable}</span>
              </span>
            )}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
});
