import { useCallback, useEffect, useRef } from 'react';
import { useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { useSessionStore } from '../Store/SessionStore';
import { Wallpaper } from './Wallpaper';
import { ShortcutIcon } from './ShortcutIcon';
import { desktopMenuItems } from './DesktopContextMenu';
import { ShortcutDialog } from './ShortcutDialog';
import { WallpaperDialog } from './WallpaperDialog';
import { WindowManager } from '../Windows/WindowManager';
import { Taskbar } from '../Taskbar/Taskbar';
import { StartMenu } from '../StartMenu/StartMenu';
import { WidgetLayer } from '../Widgets/WidgetLayer';
import { WidgetSettingsDialog } from '../Widgets/WidgetSettingsDialog';
import { Menu } from '../Components/Menu';
import { ConfirmDialog } from '../Components/Dialog';
import { ToastHost, toast } from '../Components/Toast';
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
  const contextMenu = useUiStore((s) => s.contextMenu);
  const closeContextMenu = useUiStore((s) => s.closeContextMenu);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const selectShortcut = useUiStore((s) => s.selectShortcut);
  const shortcutDialog = useUiStore((s) => s.shortcutDialog);
  const wallpaperDialogOpen = useUiStore((s) => s.wallpaperDialogOpen);
  const widgetSettingsId = useUiStore((s) => s.widgetSettingsId);
  const confirm = useUiStore((s) => s.confirm);
  const requestConfirm = useUiStore((s) => s.requestConfirm);
  const toggleStartMenu = useUiStore((s) => s.toggleStartMenu);
  const setStartMenuOpen = useUiStore((s) => s.setStartMenuOpen);
  const logout = useSessionStore((s) => s.logout);
  const surfaceRef = useRef<HTMLDivElement>(null);

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

  const onConfirm = async () => {
    if (!confirm) return;
    try {
      await confirm.onConfirm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      requestConfirm(null);
    }
  };

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
        {shortcuts.map((shortcut) => (
          <ShortcutIcon key={shortcut.id} shortcut={shortcut} />
        ))}
        <WidgetLayer />
      </div>
      <WindowManager />
      <Taskbar />
      <StartMenu onLogout={() => void logout()} />
      {contextMenu && <Menu items={contextMenu.items} position={contextMenu.position} onClose={closeContextMenu} ariaLabel="Context menu" />}
      {shortcutDialog && <ShortcutDialog state={shortcutDialog} />}
      {wallpaperDialogOpen && <WallpaperDialog />}
      {widgetSettingsId && <WidgetSettingsDialog widgetId={widgetSettingsId} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={() => void onConfirm()}
          onCancel={() => requestConfirm(null)}
        />
      )}
      <ToastHost />
    </div>
  );
}
