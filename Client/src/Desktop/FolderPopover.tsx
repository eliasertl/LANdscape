import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { PencilSimple, X } from '@phosphor-icons/react';
import { ICON_CELLS, cellToPx, findNearestFree, sizeForCells, type Shortcut } from '@landscape/shared';
import { shortcutIconUrl, useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { usePointerDrag } from '../Hooks/UsePointerDrag';
import { useSpringStyle, useSpringValue } from '../Design/UseSpring';
import { SPRING } from '../Design/Spring';
import { layoutViewport } from '../Design/Scale';
import { PlaceholderIcon } from './PlaceholderIcon';
import { openShortcut } from './Launch';
import { shortcutMenuItems } from './DesktopContextMenu';
import { currentGrid, occupiedCells, positionForCell, surfaceOrigin, viewportBounds } from './DesktopGrid';
import { toast } from '../Components/Toast';
import { errorMessage } from '../Api/Http';
import styles from './Folder.module.css';

const WIDTH = 360;

/** The open folder's contents in a grid next to its icon; drag a shortcut out to put it back on the desktop. */
export function FolderPopover({ folderId }: { folderId: string }) {
  const folder = useDesktopStore((s) => s.folders.find((f) => f.id === folderId));
  const contents = useDesktopStore(useShallow((s) => s.shortcuts.filter((x) => x.folderId === folderId)));
  const cell = useUiStore((s) => s.displayLayout[`folder:${folderId}`]);
  const close = useUiStore((s) => s.openFolder);
  const openFolderPrompt = useUiStore((s) => s.openFolderPrompt);
  const ref = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const scale = useSpringValue(0.9, SPRING.quick, 0.001);
  const opacity = useSpringValue(0, SPRING.quick, 0.005);
  useSpringStyle(ref, [scale, opacity], ([s, o]) => ({ transform: `scale(${s ?? 1})`, opacity: String(o ?? 1) }));
  useEffect(() => {
    void scale.set(1);
    void opacity.set(1);
  }, [scale, opacity]);

  // Next to the folder icon, kept inside the viewport.
  useLayoutEffect(() => {
    const grid = currentGrid();
    const origin = cell ? cellToPx(cell.col, cell.row, grid) : { x: 40, y: 40 };
    const height = ref.current?.offsetHeight ?? 240;
    const viewport = layoutViewport();
    let x = origin.x + grid.unitX + 8;
    if (x + WIDTH > viewport.width - 8) x = Math.max(8, origin.x - WIDTH - 8);
    const y = Math.max(8, Math.min(origin.y, viewport.height - height - 80));
    setPlaced({ x, y });
  }, [cell, contents.length]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && ref.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-menu-root]')) return;
      close(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(null);
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [close]);

  if (!folder) return null;

  return (
    <div ref={ref} className={`${styles.popover} material`} style={{ left: placed.x, top: placed.y, width: WIDTH }} role="dialog" aria-label={`${folder.name} folder`} data-folder-popover={folderId}>
      <div className={styles.header}>
        <span className={`${styles.name} text-callout emphasized`}>{folder.name}</span>
        <button type="button" className={styles.headerButton} aria-label="Rename folder" onClick={() => openFolderPrompt({ mode: 'rename', folder })}>
          <PencilSimple />
        </button>
        <button type="button" className={styles.headerButton} aria-label="Close folder" onClick={() => close(null)}>
          <X />
        </button>
      </div>
      {contents.length === 0 ? (
        <p className={`${styles.empty} text-footnote text-secondary`}>Drop shortcuts onto the folder icon to put them here.</p>
      ) : (
        <div className={styles.grid}>
          {contents.map((shortcut) => (
            <FolderItem key={shortcut.id} shortcut={shortcut} popoverRef={ref} />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderItem({ shortcut, popoverRef }: { shortcut: Shortcut; popoverRef: React.RefObject<HTMLDivElement | null> }) {
  const moveShortcutToFolder = useDesktopStore((s) => s.moveShortcutToFolder);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const setSnapPreview = useUiStore((s) => s.setSnapPreview);
  const setInteracting = useUiStore((s) => s.setInteracting);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<{ col: number; row: number } | null>(null);
  const iconUrl = shortcutIconUrl(shortcut);

  const onPointerDown = usePointerDrag({
    onStart: ({ clientX, clientY }) => {
      setInteracting(true);
      // A floating copy follows the pointer; the tile stays in the folder until the drop lands outside.
      const ghost = document.createElement('div');
      ghost.className = styles.ghost ?? '';
      ghost.style.transform = `translate(${clientX - 28}px, ${clientY - 28}px)`;
      if (iconUrl) {
        const img = document.createElement('img');
        img.src = iconUrl;
        ghost.appendChild(img);
      }
      document.body.appendChild(ghost);
      ghostRef.current = ghost;
      targetRef.current = null;
    },
    onMove: ({ clientX, clientY }) => {
      const ghost = ghostRef.current;
      if (ghost) ghost.style.transform = `translate(${clientX - 28}px, ${clientY - 28}px)`;
      const rect = popoverRef.current?.getBoundingClientRect();
      const inside = rect && clientX * uiScaleFactor() >= rect.left && clientX * uiScaleFactor() <= rect.right && clientY * uiScaleFactor() >= rect.top && clientY * uiScaleFactor() <= rect.bottom;
      if (inside) {
        targetRef.current = null;
        setSnapPreview(null);
        return;
      }
      const grid = currentGrid();
      const origin = surfaceOrigin();
      const desired = {
        col: Math.floor((clientX - origin.x - grid.originX) / grid.unitX),
        row: Math.floor((clientY - origin.y - grid.originY) / grid.unitY),
        ...ICON_CELLS,
      };
      const spot = findNearestFree(desired, occupiedCells(null), viewportBounds(grid));
      if (targetRef.current?.col === spot.col && targetRef.current.row === spot.row) return;
      targetRef.current = spot;
      setSnapPreview({ ...cellToPx(spot.col, spot.row, grid), ...sizeForCells(1, 1, grid) });
    },
    onEnd: () => {
      setInteracting(false);
      setSnapPreview(null);
      ghostRef.current?.remove();
      ghostRef.current = null;
      const spot = targetRef.current;
      if (!spot) return;
      void moveShortcutToFolder(shortcut.id, null, positionForCell({ ...spot, ...ICON_CELLS })).catch((error: unknown) => toast.error(errorMessage(error)));
    },
  });

  return (
    <button
      type="button"
      className={styles.item}
      title={shortcut.url}
      data-folder-item={shortcut.id}
      onPointerDown={onPointerDown}
      onClick={() => openShortcut(shortcut)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openContextMenu(shortcutMenuItems(shortcut), { x: e.clientX, y: e.clientY });
      }}
    >
      <span className={styles.itemImage}>{iconUrl ? <img src={iconUrl} alt="" draggable={false} /> : <PlaceholderIcon name={shortcut.name} size={44} />}</span>
      <span className={styles.itemLabel}>{shortcut.name}</span>
    </button>
  );
}

/** DragInfo is in layout pixels; client rects are in screen pixels (see Design/Scale.ts). */
function uiScaleFactor(): number {
  const zoom = Number(document.documentElement.style.zoom || 1);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}
