import { useUiStore } from '../Store/UiStore';
import { ShortcutDialog } from './ShortcutDialog';
import { WallpaperDialog } from './WallpaperDialog';
import { WidgetSettingsDialog } from '../Widgets/WidgetSettingsDialog';
import { Menu } from '../Components/Menu';
import { ConfirmDialog } from '../Components/Dialog';
import { ToastHost, toast } from '../Components/Toast';
import { PromptDialog } from '../Components/PromptDialog';
import { useDesktopStore } from '../Store/DesktopStore';

/** Context menu, dialogs and toasts shared by the desktop and phone shells. */
export function Overlays() {
  const contextMenu = useUiStore((s) => s.contextMenu);
  const closeContextMenu = useUiStore((s) => s.closeContextMenu);
  const shortcutDialog = useUiStore((s) => s.shortcutDialog);
  const wallpaperDialogOpen = useUiStore((s) => s.wallpaperDialogOpen);
  const widgetSettingsId = useUiStore((s) => s.widgetSettingsId);
  const confirm = useUiStore((s) => s.confirm);
  const requestConfirm = useUiStore((s) => s.requestConfirm);
  const folderPrompt = useUiStore((s) => s.folderPrompt);
  const openFolderPrompt = useUiStore((s) => s.openFolderPrompt);

  const submitFolder = async (name: string) => {
    const desktop = useDesktopStore.getState();
    if (!folderPrompt) return;
    if (folderPrompt.mode === 'rename') await desktop.renameFolder(folderPrompt.folder.id, name.trim());
    else {
      const folder = await desktop.createFolder(name.trim(), folderPrompt.position);
      if (folderPrompt.moveShortcutId) await desktop.moveShortcutToFolder(folderPrompt.moveShortcutId, folder.id);
    }
    openFolderPrompt(null);
  };

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
    <>
      {contextMenu && <Menu items={contextMenu.items} position={contextMenu.position} onClose={closeContextMenu} ariaLabel="Context menu" />}
      {shortcutDialog && <ShortcutDialog state={shortcutDialog} />}
      {wallpaperDialogOpen && <WallpaperDialog />}
      {widgetSettingsId && <WidgetSettingsDialog widgetId={widgetSettingsId} />}
      {folderPrompt && (
        <PromptDialog
          title={folderPrompt.mode === 'rename' ? 'Rename Folder' : 'New Folder'}
          label="Name"
          initialValue={folderPrompt.mode === 'rename' ? folderPrompt.folder.name : ''}
          placeholder="Media"
          confirmLabel={folderPrompt.mode === 'rename' ? 'Rename' : 'Create'}
          onSubmit={submitFolder}
          onCancel={() => openFolderPrompt(null)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          cancelLabel={confirm.cancelLabel}
          danger={confirm.danger}
          onConfirm={() => void onConfirm()}
          onCancel={() => {
            confirm.onCancel?.();
            requestConfirm(null);
          }}
        />
      )}
      <ToastHost />
    </>
  );
}
