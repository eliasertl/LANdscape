import { memo, useRef } from 'react';
import { ICON_CELLS, type Shortcut } from '@landscape/shared';
import { shortcutIconUrl, useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { PlaceholderIcon } from './PlaceholderIcon';
import { shortcutMenuItems } from './DesktopContextMenu';
import { openShortcut } from './Launch';
import { useGridDrag } from './UseGridDrag';
import styles from './ShortcutIcon.module.css';

export const ShortcutIcon = memo(function ShortcutIcon({ shortcut }: { shortcut: Shortcut }) {
  const selected = useUiStore((s) => s.selectedShortcutId === shortcut.id);
  const selectShortcut = useUiStore((s) => s.selectShortcut);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const moveShortcut = useDesktopStore((s) => s.moveShortcut);
  const elementRef = useRef<HTMLButtonElement>(null);
  const iconUrl = shortcutIconUrl(shortcut);

  const { onPointerDown, dragging, settling } = useGridDrag({
    itemKey: `shortcut:${shortcut.id}`,
    x: shortcut.x,
    y: shortcut.y,
    cols: ICON_CELLS.cols,
    rows: ICON_CELLS.rows,
    elementRef,
    onStart: () => selectShortcut(shortcut.id),
    onCommit: (x, y) => moveShortcut(shortcut.id, x, y),
  });

  return (
    <button
      ref={elementRef}
      type="button"
      className={[styles.icon, selected ? styles.selected : '', dragging ? styles.dragging : '', settling ? 'grid-settling' : ''].join(' ')}
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
