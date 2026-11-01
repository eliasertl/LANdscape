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
import { useDesktopShortcuts } from './DesktopShortcuts';
import { useEffectiveTaskbar } from '../Taskbar/UseTaskbarSettings';
import { taskbarInset } from '@landscape/shared';
import { useIsPhone } from '../Hooks/UseMediaQuery';
import { PhoneShell } from '../Phone/PhoneShell';
import { SafeModeBanner } from './SafeModeBanner';
import { useIdleWatcher } from '../Lock/IdleWatcher';
import { useCursor } from '../Cursor/UseCursor';
import { AfterLoginAnimation } from '../Startup/AfterLoginAnimation';
import { useNotificationStore } from '../Store/NotificationStore';
import { useMonitorStore } from '../Store/MonitorStore';
import { NotificationCenter } from '../Notifications/NotificationCenter';
import styles from './Desktop.module.css';

export function Desktop() {
  const loaded = useDesktopStore((s) => s.loaded);
  const error = useDesktopStore((s) => s.error);
  const load = useDesktopStore((s) => s.load);
  const phone = useIsPhone();
  useIdleWatcher();
  useCursor();

  useEffect(() => {
    void load();
  }, [load]);

  // Live events (notifications, monitor states) for the whole desktop.
  useEffect(() => {
    if (!loaded) return;
    const disconnectNotifications = useNotificationStore.getState().connect();
    const disconnectMonitor = useMonitorStore.getState().connect();
    return () => {
      disconnectNotifications();
      disconnectMonitor();
    };
  }, [loaded]);

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
  return (
    <>
      {phone ? <PhoneShell /> : <DesktopShell />}
      <AfterLoginAnimation />
    </>
  );
}

function DesktopShell() {
  const shortcuts = useDesktopStore((s) => s.shortcuts);
  const folders = useDesktopStore((s) => s.folders);
  const desktopSettings = useDesktopStore((s) => s.settings?.desktop);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const selectShortcut = useUiStore((s) => s.selectShortcut);
  const setStartMenuOpen = useUiStore((s) => s.setStartMenuOpen);
  const openFolderId = useUiStore((s) => s.openFolderId);
  const openFolder = useUiStore((s) => s.openFolder);
  const logout = useSessionStore((s) => s.logout);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const widgets = useDesktopStore((s) => s.widgets);
  const viewport = useViewportSize();
  const grid = useCurrentGrid();
  const taskbar = useEffectiveTaskbar();
  const inset = taskbarInset(taskbar);

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
  }, [shortcuts, widgets, folders, viewport, grid.unitX, grid.unitY, inset.top, inset.left]);

  useDesktopShortcuts();
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
  // The surface shrinks to the work area, so the grid never runs under the taskbar on any edge.
  const surfaceStyle = {
    '--icon-size': `${grid.iconPx}px`,
    '--grid-unit-x': `${grid.unitX}px`,
    '--grid-unit-y': `${grid.unitY}px`,
    top: inset.top,
    right: inset.right,
    bottom: inset.bottom,
    left: inset.left,
  } as CSSProperties;

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
      <NotificationCenter />
      <SafeModeBanner />
    </div>
  );
}
