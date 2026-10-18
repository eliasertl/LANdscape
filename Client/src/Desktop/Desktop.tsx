import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { useSessionStore } from '../Store/SessionStore';
import { Wallpaper } from './Wallpaper';
import { ShortcutIcon } from './ShortcutIcon';
import { desktopMenuItems } from './DesktopContextMenu';
import { Overlays } from './Overlays';
import { SnapPreview } from './SnapPreview';
import { refreshDisplayLayout, resolveOverlaps } from './DesktopGrid';
import { useViewportSize } from '../Hooks/UseViewportSize';
import { WindowManager } from '../Windows/WindowManager';
import { Taskbar } from '../Taskbar/Taskbar';
import { StartMenu } from '../StartMenu/StartMenu';
import { WidgetLayer } from '../Widgets/WidgetLayer';
import { Spinner } from '../Components/Spinner';
import { Button } from '../Components/Button';
import { useKeyboardShortcut } from '../Hooks/UseKeyboardShortcut';
import { useIsPhone } from '../Hooks/UseMediaQuery';
import { PhoneShell } from '../Phone/PhoneShell';
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
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const selectShortcut = useUiStore((s) => s.selectShortcut);
  const toggleStartMenu = useUiStore((s) => s.toggleStartMenu);
  const setStartMenuOpen = useUiStore((s) => s.setStartMenuOpen);
  const logout = useSessionStore((s) => s.logout);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const widgets = useDesktopStore((s) => s.widgets);
  const viewport = useViewportSize();

  // Once widgets have rendered (their grid size is read from the DOM), untangle stored collisions.
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => resolveOverlaps());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Keep the shown layout collision-free whenever items or the viewport change.
  useLayoutEffect(() => {
    refreshDisplayLayout();
  }, [shortcuts, widgets, viewport]);

  useKeyboardShortcut({ key: ' ', ctrl: true }, toggleStartMenu);
  useKeyboardShortcut({ key: 'Escape' }, () => setStartMenuOpen(false));

  const onSurfaceContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      selectShortcut(null);
      openContextMenu(desktopMenuItems({ x: event.clientX, y: event.clientY }), { x: event.clientX, y: event.clientY });
    },
    [openContextMenu, selectShortcut],
  );

  return (
    <div className={styles.desktop}>
      <Wallpaper />
      <div
        ref={surfaceRef}
        className={styles.surface}
        onContextMenu={onSurfaceContextMenu}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            selectShortcut(null);
            setStartMenuOpen(false);
          }
        }}
      >
        <SnapPreview />
        {shortcuts.map((shortcut) => (
          <ShortcutIcon key={shortcut.id} shortcut={shortcut} />
        ))}
        <WidgetLayer />
      </div>
      <WindowManager />
      <Taskbar />
      <StartMenu onLogout={() => void logout()} />
      <Overlays />
    </div>
  );
}
