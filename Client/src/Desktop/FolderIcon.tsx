import { memo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Folder as FolderGlyph } from '@phosphor-icons/react';
import { ICON_CELLS, type Folder } from '@landscape/shared';
import { shortcutIconUrl, useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { PlaceholderIcon } from './PlaceholderIcon';
import { folderMenuItems } from './DesktopContextMenu';
import { useGridDrag } from './UseGridDrag';
import { useCurrentGrid } from './DesktopGrid';
import styles from './ShortcutIcon.module.css';
import folderStyles from './Folder.module.css';

/** A one-cell desktop item that holds shortcuts; opening it shows a popover grid (FolderPopover). */
export const FolderIcon = memo(function FolderIcon({ folder }: { folder: Folder }) {
  // useShallow: a filtered array is new on every call and would re-render forever otherwise.
  const contents = useDesktopStore(useShallow((s) => s.shortcuts.filter((x) => x.folderId === folder.id)));
  const moveItem = useDesktopStore((s) => s.moveItem);
  const openWith = useDesktopStore((s) => s.settings?.desktop.openWith ?? 'double');
  const selected = useUiStore((s) => s.selectedShortcutId === `folder:${folder.id}`);
  const dropTarget = useUiStore((s) => s.dropFolderId === folder.id);
  const selectShortcut = useUiStore((s) => s.selectShortcut);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const openFolder = useUiStore((s) => s.openFolder);
  const elementRef = useRef<HTMLButtonElement>(null);
  const draggedRef = useRef(false);
  const grid = useCurrentGrid();

  const { onPointerDown, dragging, settling } = useGridDrag({
    itemKey: `folder:${folder.id}`,
    position: folder.position,
    cols: ICON_CELLS.cols,
    rows: ICON_CELLS.rows,
    elementRef,
    onStart: () => {
      draggedRef.current = true;
      selectShortcut(`folder:${folder.id}`);
    },
    onCommit: (position) => moveItem({ kind: 'folder', id: folder.id, position }),
  });

  const open = () => openFolder(folder.id);

  return (
    <button
      ref={elementRef}
      type="button"
      className={[styles.icon, selected ? styles.selected : '', dragging ? styles.dragging : '', settling ? 'grid-settling' : '', dropTarget ? folderStyles.dropTarget : ''].join(' ')}
      style={{ width: grid.unitX, height: grid.unitY }}
      aria-label={`${folder.name} folder, ${contents.length} item${contents.length === 1 ? '' : 's'}`}
      data-folder-id={folder.id}
      onPointerDown={(e) => {
        e.stopPropagation();
        draggedRef.current = false;
        selectShortcut(`folder:${folder.id}`);
        onPointerDown(e);
      }}
      onClick={() => {
        if (openWith === 'single' && !draggedRef.current) open();
      }}
      onDoubleClick={() => {
        if (openWith === 'double') open();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        selectShortcut(`folder:${folder.id}`);
        openContextMenu(folderMenuItems(folder), { x: e.clientX, y: e.clientY });
      }}
    >
      <span className={styles.image}>
        <span className={folderStyles.tile} style={{ width: grid.iconPx, height: grid.iconPx }}>
          {contents.length === 0 ? (
            <FolderGlyph weight="fill" className={folderStyles.emptyGlyph} />
          ) : (
            contents.slice(0, 4).map((s) => {
              const url = shortcutIconUrl(s);
              return url ? <img key={s.id} src={url} alt="" draggable={false} /> : <PlaceholderIcon key={s.id} name={s.name} size={Math.floor(grid.iconPx / 2) - 6} />;
            })
          )}
        </span>
      </span>
      <span className={styles.label}>{folder.name}</span>
    </button>
  );
});
