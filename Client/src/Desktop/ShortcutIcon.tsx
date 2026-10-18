import { memo, useEffect, useRef, useState } from 'react';
import { ICON_CELL, type Shortcut } from '@landscape/shared';
import { shortcutIconUrl, useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { usePointerDrag } from '../Hooks/UsePointerDrag';
import { PlaceholderIcon } from './PlaceholderIcon';
import { shortcutMenuItems } from './DesktopContextMenu';
import { openShortcut } from './Launch';
import { TASKBAR_RESERVED } from '../Windows/WindowGeometry';
import styles from './ShortcutIcon.module.css';

/** Keeps an icon inside the visible desktop even if it was placed on a bigger screen. */
export function clampIconPosition(x: number, y: number): { x: number; y: number } {
  const maxX = Math.max(0, window.innerWidth - ICON_CELL.width);
  const maxY = Math.max(0, window.innerHeight - TASKBAR_RESERVED - ICON_CELL.height);
  return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
}

export const ShortcutIcon = memo(function ShortcutIcon({ shortcut }: { shortcut: Shortcut }) {
  const selected = useUiStore((s) => s.selectedShortcutId === shortcut.id);
  const selectShortcut = useUiStore((s) => s.selectShortcut);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const moveShortcut = useDesktopStore((s) => s.moveShortcut);
  const [dragging, setDragging] = useState(false);
  const [viewport, setViewport] = useState(0);
  const startRef = useRef({ x: shortcut.x, y: shortcut.y });
  const elementRef = useRef<HTMLButtonElement>(null);
  const iconUrl = shortcutIconUrl(shortcut);

  useEffect(() => {
    const onResize = () => setViewport((v) => v + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const setInteracting = useUiStore((s) => s.setInteracting);
  const onPointerDown = usePointerDrag({
    onStart: () => {
      startRef.current = { x: shortcut.x, y: shortcut.y };
      setDragging(true);
      setInteracting(true);
      selectShortcut(shortcut.id);
    },
    onMove: ({ dx, dy }) => {
      const next = clampIconPosition(startRef.current.x + dx, startRef.current.y + dy);
      const element = elementRef.current;
      if (element) element.style.transform = `translate(${next.x}px, ${next.y}px)`;
    },
    onEnd: ({ dx, dy }, dragged) => {
      setDragging(false);
      if (!dragged) return;
      setInteracting(false);
      const next = clampIconPosition(startRef.current.x + dx, startRef.current.y + dy);
      moveShortcut(shortcut.id, next.x, next.y);
    },
  });

  // viewport bumps re-run the clamp on resize
  const position = dragging ? null : clampIconPosition(shortcut.x, shortcut.y);
  const style = position ? { transform: `translate(${position.x}px, ${position.y}px)` } : undefined;
  void viewport;

  return (
    <button
      ref={elementRef}
      type="button"
      className={[styles.icon, selected ? styles.selected : '', dragging ? styles.dragging : ''].join(' ')}
      style={style}
      title={shortcut.url}
      aria-label={`${shortcut.name} shortcut`}
      data-shortcut-id={shortcut.id}
      onPointerDown={(e) => {
        e.stopPropagation();
        selectShortcut(shortcut.id);
        onPointerDown(e);
      }}
      onDoubleClick={() => openShortcut(shortcut)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openShortcut(shortcut);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        selectShortcut(shortcut.id);
        openContextMenu(shortcutMenuItems(shortcut), { x: e.clientX, y: e.clientY });
      }}
    >
      <span className={styles.image}>
        {iconUrl ? <img src={iconUrl} alt="" draggable={false} /> : <PlaceholderIcon name={shortcut.name} size={56} />}
        {shortcut.embeddable === 'no' && shortcut.openMode !== 'embed' && <span className={styles.badge} title="Opens in a new tab" />}
      </span>
      <span className={styles.label}>{shortcut.name}</span>
    </button>
  );
});
