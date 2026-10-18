import { createElement } from 'react';
import { ArrowSquareOut, ArrowsClockwise, GearSix, Image, PencilSimple, Plus, SquaresFour, Trash, WindowsLogo } from '@phosphor-icons/react';
import { cellToPx, findNearestFree, pxToCell, type Shortcut } from '@landscape/shared';
import type { MenuItem } from '../Components/Menu';
import { useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { WIDGETS } from '../Widgets/Registry';
import { openApp, openShortcut } from './Launch';
import { toast } from '../Components/Toast';
import { occupiedCells, viewportBounds } from './DesktopGrid';

/** Right-click on empty desktop. */
export function desktopMenuItems(at: { x: number; y: number }): MenuItem[] {
  const ui = useUiStore.getState();
  const desktop = useDesktopStore.getState();
  return [
    { label: 'Add new Shortcut', icon: createElement(Plus), onSelect: () => ui.openShortcutDialog({ mode: 'create' }) },
    {
      type: 'submenu',
      label: 'Add Widget',
      icon: createElement(SquaresFour),
      items: WIDGETS.map((widget) => ({
        label: widget.name,
        icon: createElement(widget.icon),
        onSelect: () => {
          // Place on the free grid cell closest to where the menu was opened.
          const cells = widget.size;
          const spot = findNearestFree({ ...pxToCell(at.x - 20, at.y - 20), ...cells }, occupiedCells(null), viewportBounds());
          const position = cellToPx(spot.col, spot.row);
          void desktop.addWidget(widget.type, position.x, position.y).catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not add widget'));
        },
      })),
    },
    { type: 'separator' },
    { label: 'Change Wallpaper…', icon: createElement(Image), onSelect: () => ui.setWallpaperDialogOpen(true) },
    { label: 'Settings', icon: createElement(GearSix), onSelect: () => openApp('settings') },
  ];
}

/** Right-click on a shortcut icon. */
export function shortcutMenuItems(shortcut: Shortcut): MenuItem[] {
  const ui = useUiStore.getState();
  const desktop = useDesktopStore.getState();
  return [
    { label: 'Open', icon: createElement(WindowsLogo), onSelect: () => openShortcut(shortcut) },
    { label: 'Open in new tab', icon: createElement(ArrowSquareOut), onSelect: () => openShortcut(shortcut, true) },
    { type: 'separator' },
    { label: 'Edit…', icon: createElement(PencilSimple), onSelect: () => ui.openShortcutDialog({ mode: 'edit', shortcut }) },
    {
      label: 'Re-check embedding',
      icon: createElement(ArrowsClockwise),
      onSelect: () => {
        void desktop
          .recheckShortcut(shortcut.id)
          .then((updated) => toast.info(updated.embeddable === 'yes' ? 'The site can be embedded.' : updated.embeddable === 'no' ? 'The site blocks embedding.' : 'The site could not be reached.'))
          .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Check failed'));
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
