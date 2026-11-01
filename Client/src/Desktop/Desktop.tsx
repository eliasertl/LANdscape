import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { useSessionStore } from '../Store/SessionStore';
import { Wallpaper } from './Wallpaper';
import { ShortcutIcon } from './ShortcutIcon';
import { FolderIcon } from './FolderIcon';
import { FolderPopover } from './FolderPopover';
import { desktopMenuItems } from './DesktopContextMenu';
import { Overlays } from './Overlays';
import { SnapPreview } from './SnapPreview';
import { refreshDisplayLayout, resolveOverlaps, useCurrentGrid } from './DesktopGrid';
import { useViewportSize } from '../Hooks/UseViewportSize';
import { toLayout } from '../Design/Scale';
import { WindowManager } from '../Windows/WindowManager';
import { Taskbar } from '../Taskbar/Taskbar';
import { StartMenu } from '../StartMenu/StartMenu';
import { WidgetLayer } from '../Widgets/WidgetLayer';
import { Spinner } from '../Components/Spinner';
import { Button } from '../Components/Button';
import { useKeyboardShortcut } from '../Hooks/UseKeyboardShortcut';
import { useIsPhone } from '../Hooks/UseMediaQuery';
import { PhoneShell } from '../Phone/PhoneShell';
import { SafeModeBanner } from './SafeModeBanner';
import styles from './Desktop.module.css';

export function Desktop() {
  const loaded = useDesktopStore((s) => s.loaded);
  const error = useDesktopStore((s) => s.error);
  const load = useDesktopStore((s) => s.load);
  const phone = useIsPhone();

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !loaded) {
    return (
      <div className={styles.boot}>
        <p className="text-body">Could not load the desktop: {error}</p>
        <Button variant="primary" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div className={styles.boot}>
        <Spinner size={28} />
      </div>
    );
  }
  return phone ? <PhoneShell /> : <DesktopShell />;
}

function DesktopShell() {
  const shortcuts = useDesktopStore((s) => s.shortcuts);
  const folders = useDesktopStore((s) => s.folders);
  const desktopSettings = useDesktopStore((s) => s.settings?.desktop);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const selectShortcut = useUiStore((s) => s.selectShortcut);
  const toggleStartMenu = useUiStore((s) => s.toggleStartMenu);
  const setStartMenuOpen = useUiStore((s) => s.setStartMenuOpen);
  const openFolderId = useUiStore((s) => s.openFolderId);
  const openFolder = useUiStore((s) => s.openFolder);
  const logout = useSessionStore((s) => s.logout);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const widgets = useDesktopStore((s) => s.widgets);
  const viewport = useViewportSize();
  const grid = useCurrentGrid();

  // Once widgets have rendered, untangle stored collisions.
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => resolveOverlaps());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Keep the shown layout collision-free whenever items, the grid or the viewport change.
  useLayoutEffect(() => {
    refreshDisplayLayout();
  }, [shortcuts, widgets, folders, viewport, grid.unitX, grid.unitY]);

  useKeyboardShortcut({ key: ' ', ctrl: true }, toggleStartMenu);
  useKeyboardShortcut({ key: 'Escape' }, () => setStartMenuOpen(false));

  const onSurfaceContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      selectShortcut(null);
      // Menus take screen coordinates; grid placement needs layout pixels (UI scale).
      openContextMenu(desktopMenuItems({ x: toLayout(event.clientX), y: toLayout(event.clientY) }), { x: event.clientX, y: event.clientY });
    },
    [openContextMenu, selectShortcut],
  );

  const labels = desktopSettings?.labels ?? 'show';
  const showIcons = desktopSettings?.showIcons ?? true;
  const surfaceStyle = { '--icon-size': `${grid.iconPx}px`, '--grid-unit-x': `${grid.unitX}px`, '--grid-unit-y': `${grid.unitY}px` } as CSSProperties;

  return (
    <div className={styles.desktop}>
      <Wallpaper />
      <div
        ref={surfaceRef}
        className={[styles.surface, labels === 'hide' ? styles.labelsHidden : labels === 'shadow' ? styles.labelsShadow : ''].join(' ')}
        style={surfaceStyle}
        data-desktop-surface
        onContextMenu={onSurfaceContextMenu}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            selectShortcut(null);
            setStartMenuOpen(false);
            openFolder(null);
          }
        }}
      >
        <SnapPreview />
        {showIcons && shortcuts.filter((s) => s.folderId === null).map((shortcut) => <ShortcutIcon key={shortcut.id} shortcut={shortcut} />)}
        {showIcons && folders.map((folder) => <FolderIcon key={folder.id} folder={folder} />)}
        <WidgetLayer />
        {openFolderId && <FolderPopover key={openFolderId} folderId={openFolderId} />}
      </div>
      <WindowManager />
      <Taskbar />
      <StartMenu onLogout={() => void logout()} />
      <Overlays />
      <SafeModeBanner />
    </div>
  );
}
