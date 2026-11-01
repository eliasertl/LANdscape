import { memo, useRef } from 'react';
import { ICON_CELLS, type Shortcut } from '@landscape/shared';
import { shortcutIconUrl, useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { PlaceholderIcon } from './PlaceholderIcon';
import { shortcutMenuItems } from './DesktopContextMenu';
import { openShortcut } from './Launch';
import { opensOutsideWindow } from '../Windows/ShortcutFrame';
import { useGridDrag } from './UseGridDrag';
import { useCurrentGrid } from './DesktopGrid';
import { toast } from '../Components/Toast';
import { errorMessage } from '../Api/Http';
import styles from './ShortcutIcon.module.css';

export const ShortcutIcon = memo(function ShortcutIcon({ shortcut }: { shortcut: Shortcut }) {
  const selected = useUiStore((s) => s.selectedShortcutId === shortcut.id);
  const selectShortcut = useUiStore((s) => s.selectShortcut);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const moveItem = useDesktopStore((s) => s.moveItem);
  const moveShortcutToFolder = useDesktopStore((s) => s.moveShortcutToFolder);
  const openWith = useDesktopStore((s) => s.settings?.desktop.openWith ?? 'double');
  const elementRef = useRef<HTMLButtonElement>(null);
  const draggedRef = useRef(false);
  const iconUrl = shortcutIconUrl(shortcut);
  const grid = useCurrentGrid();

  const { onPointerDown, dragging, settling } = useGridDrag({
    itemKey: `shortcut:${shortcut.id}`,
    position: shortcut.position,
    cols: ICON_CELLS.cols,
    rows: ICON_CELLS.rows,
    elementRef,
    onStart: () => {
      draggedRef.current = true;
      selectShortcut(shortcut.id);
    },
    onCommit: (position) => moveItem({ kind: 'shortcut', id: shortcut.id, position }),
    onDropOnFolder: (folderId) => void moveShortcutToFolder(shortcut.id, folderId).catch((error: unknown) => toast.error(errorMessage(error))),
  });

  return (
    <button
      ref={elementRef}
      type="button"
      className={[styles.icon, selected ? styles.selected : '', dragging ? styles.dragging : '', settling ? 'grid-settling' : ''].join(' ')}
      style={{ width: grid.unitX, height: grid.unitY }}
      title={shortcut.url}
      aria-label={`${shortcut.name} shortcut`}
      data-shortcut-id={shortcut.id}
      onPointerDown={(e) => {
        e.stopPropagation();
        draggedRef.current = false;
        selectShortcut(shortcut.id);
        onPointerDown(e);
      }}
      onClick={() => {
        // Single-click mode opens on the click that follows a pointer-up without a drag.
        if (openWith === 'single' && !draggedRef.current) openShortcut(shortcut);
      }}
      onDoubleClick={() => {
        if (openWith === 'double') openShortcut(shortcut);
      }}
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
        {iconUrl ? <img src={iconUrl} alt="" draggable={false} /> : <PlaceholderIcon name={shortcut.name} size={grid.iconPx} />}
        {opensOutsideWindow(shortcut) && <span className={styles.badge} title="Opens in a new tab" />}
      </span>
      <span className={styles.label}>{shortcut.name}</span>
    </button>
  );
});
