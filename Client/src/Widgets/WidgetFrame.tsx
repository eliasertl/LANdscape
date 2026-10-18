import { createElement, memo, useRef, useState, type ReactNode } from 'react';
import { GearSix, Trash, WarningCircle } from '@phosphor-icons/react';
import type { Widget } from '@landscape/shared';
import { useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { usePointerDrag } from '../Hooks/UsePointerDrag';
import { clampIconPosition } from '../Desktop/ShortcutIcon';
import { getWidget } from './Registry';
import styles from './WidgetFrame.module.css';

interface WidgetFrameProps {
  widget: Widget;
  title: string;
  children: ReactNode;
  /** Shown instead of the content when the metric is unavailable. */
  unavailable?: string | null;
  width: number;
  height: number;
  className?: string;
}

/** Draggable frosted card hosting a widget; right-click offers settings and removal. */
export const WidgetFrame = memo(function WidgetFrame({ widget, title, children, unavailable, width, height, className }: WidgetFrameProps) {
  const moveWidget = useDesktopStore((s) => s.moveWidget);
  const removeWidget = useDesktopStore((s) => s.removeWidget);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const openWidgetSettings = useUiStore((s) => s.openWidgetSettings);
  const requestConfirm = useUiStore((s) => s.requestConfirm);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const startRef = useRef({ x: widget.x, y: widget.y });

  const clamp = (x: number, y: number) => {
    const maxX = Math.max(0, window.innerWidth - width);
    const maxY = Math.max(0, window.innerHeight - 72 - height);
    return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
  };

  const onPointerDown = usePointerDrag({
    onStart: () => {
      startRef.current = { x: widget.x, y: widget.y };
      setDragging(true);
    },
    onMove: ({ dx, dy }) => {
      const next = clamp(startRef.current.x + dx, startRef.current.y + dy);
      if (ref.current) ref.current.style.transform = `translate(${next.x}px, ${next.y}px)`;
    },
    onEnd: ({ dx, dy }, dragged) => {
      setDragging(false);
      if (dragged) {
        const next = clamp(startRef.current.x + dx, startRef.current.y + dy);
        moveWidget(widget.id, next.x, next.y);
      }
    },
  });

  const position = dragging ? null : clamp(widget.x, widget.y);
  const definition = getWidget(widget.type);

  return (
    <div
      ref={ref}
      className={[styles.frame, 'material', dragging ? styles.dragging : '', className ?? ''].join(' ')}
      style={{ width, height, transform: position ? `translate(${position.x}px, ${position.y}px)` : undefined }}
      role="group"
      aria-label={`${title} widget`}
      data-widget-id={widget.id}
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

/** Clamps a stored widget position like icons (used when adding). */
export { clampIconPosition };
