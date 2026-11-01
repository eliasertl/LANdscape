import { createElement } from 'react';
import {
  ArrowSquareOut,
  ArrowsClockwise,
  FolderPlus,
  FolderSimple,
  GearSix,
  Image,
  PencilSimple,
  Plus,
  SquaresFour,
  Trash,
  WindowsLogo,
} from '@phosphor-icons/react';
import { findNearestFree, type Folder, type Shortcut } from '@landscape/shared';
import type { MenuItem } from '../Components/Menu';
import { useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { registries } from '../Platform/Registries';
import { openApp, openShortcut } from './Launch';
import { toast } from '../Components/Toast';
import { errorMessage } from '../Api/Http';
import { currentGrid, occupiedCells, positionForCell, viewportBounds } from './DesktopGrid';

/** The nearest free spot for a new item near a point on the desktop (layout px). */
function freePositionNear(at: { x: number; y: number }, cols: number, rows: number) {
  const grid = currentGrid();
  const desired = { col: Math.floor((at.x - grid.originX) / grid.unitX), row: Math.floor((at.y - grid.originY) / grid.unitY), cols, rows };
  const spot = findNearestFree(desired, occupiedCells(null), viewportBounds(grid));
  return positionForCell({ ...spot, cols, rows }, viewportBounds(grid));
}

/** Right-click on empty desktop. */
export function desktopMenuItems(at: { x: number; y: number }): MenuItem[] {
  const ui = useUiStore.getState();
  const desktop = useDesktopStore.getState();
  return [
    { label: 'Add new Shortcut', icon: createElement(Plus), onSelect: () => ui.openShortcutDialog({ mode: 'create' }) },
    { label: 'New Folder…', icon: createElement(FolderPlus), onSelect: () => ui.openFolderPrompt({ mode: 'create', position: freePositionNear(at, 1, 1) }) },
    {
      type: 'submenu',
      label: 'Add Widget',
      icon: createElement(SquaresFour),
      items: registries.widgets.list().map((widget) => ({
        label: widget.name,
        icon: createElement(widget.icon),
        onSelect: () => {
          // Place on the free grid cell closest to where the menu was opened.
          const cells = widget.sizes.m;
          const position = freePositionNear({ x: at.x - 20, y: at.y - 20 }, cells.cols, cells.rows);
          void desktop.addWidget(widget.id, position, 'm', { intervalMs: widget.defaultIntervalMs }).catch((error: unknown) => toast.error(errorMessage(error, 'Could not add widget')));
        },
      })),
    },
    { type: 'separator' },
    { label: 'Change Wallpaper…', icon: createElement(Image), onSelect: () => ui.setWallpaperDialogOpen(true) },
    { label: 'Settings', icon: createElement(GearSix), onSelect: () => openApp('settings') },
  ];
}

/** Right-click on a shortcut icon (on the desktop or inside a folder). */
export function shortcutMenuItems(shortcut: Shortcut): MenuItem[] {
  const ui = useUiStore.getState();
  const desktop = useDesktopStore.getState();
  const moveTo = (folderId: string | null) =>
    void desktop.moveShortcutToFolder(shortcut.id, folderId, folderId === null ? freePositionNear({ x: 40, y: 40 }, 1, 1) : undefined).catch((error: unknown) => toast.error(errorMessage(error)));
  const folderItems: MenuItem[] = [
    ...(shortcut.folderId !== null ? [{ label: 'Desktop', onSelect: () => moveTo(null) }, { type: 'separator' as const }] : []),
    ...desktop.folders.filter((f) => f.id !== shortcut.folderId).map((f) => ({ label: f.name, icon: createElement(FolderSimple), onSelect: () => moveTo(f.id) })),
    ...(desktop.folders.length > 0 ? [{ type: 'separator' as const }] : []),
    {
      label: 'New Folder…',
      icon: createElement(FolderPlus),
      onSelect: () => ui.openFolderPrompt({ mode: 'create', position: freePositionNear({ x: 40, y: 40 }, 1, 1), moveShortcutId: shortcut.id }),
    },
  ];
  return [
    { label: 'Open', icon: createElement(WindowsLogo), onSelect: () => openShortcut(shortcut) },
    { label: 'Open in new tab', icon: createElement(ArrowSquareOut), onSelect: () => openShortcut(shortcut, true) },
    { type: 'separator' },
    { label: 'Edit…', icon: createElement(PencilSimple), onSelect: () => ui.openShortcutDialog({ mode: 'edit', shortcut }) },
    { type: 'submenu', label: 'Move to', icon: createElement(FolderSimple), items: folderItems },
    {
      label: 'Re-check embedding',
      icon: createElement(ArrowsClockwise),
      onSelect: () => {
        void desktop
          .recheckShortcut(shortcut.id)
          .then((updated) => toast.info(updated.embeddable === 'yes' ? 'The site can be embedded.' : updated.embeddable === 'no' ? 'The site blocks embedding.' : 'The site could not be reached.'))
          .catch((error: unknown) => toast.error(errorMessage(error, 'Check failed')));
      },
    },
    { type: 'separator' },
    {
      label: 'Delete',
      icon: createElement(Trash),
      danger: true,
      onSelect: () =>
        ui.requestConfirm({
          title: `Delete “${shortcut.name}”?`,
          message: 'The shortcut and its stored icon will be removed. Open windows stay open until you close them.',
          confirmLabel: 'Delete',
          danger: true,
          onConfirm: () => desktop.deleteShortcut(shortcut.id),
        }),
    },
  ];
}

/** Right-click on a folder icon. */
export function folderMenuItems(folder: Folder): MenuItem[] {
  const ui = useUiStore.getState();
  const desktop = useDesktopStore.getState();
  const count = desktop.shortcuts.filter((s) => s.folderId === folder.id).length;
  return [
    { label: 'Open', icon: createElement(FolderSimple), onSelect: () => ui.openFolder(folder.id) },
    { label: 'Rename…', icon: createElement(PencilSimple), onSelect: () => ui.openFolderPrompt({ mode: 'rename', folder }) },
    { type: 'separator' },
    {
      label: 'Delete folder',
      icon: createElement(Trash),
      danger: true,
      onSelect: () =>
        ui.requestConfirm({
          title: `Delete “${folder.name}”?`,
          message: count > 0 ? `Its ${count} shortcut${count === 1 ? '' : 's'} move back onto the desktop.` : 'The folder is empty.',
          confirmLabel: 'Delete',
          danger: true,
          onConfirm: () => desktop.deleteFolder(folder.id),
        }),
    },
  ];
}
