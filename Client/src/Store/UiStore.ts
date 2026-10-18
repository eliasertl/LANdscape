import { create } from 'zustand';
import type { ReactNode } from 'react';
import type { CellRect, Shortcut } from '@landscape/shared';
import type { MenuItem, MenuPosition } from '../Components/Menu';

export interface ConfirmRequest {
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export type ShortcutDialogState = { mode: 'create' } | { mode: 'edit'; shortcut: Shortcut } | null;

interface UiState {
  contextMenu: { items: MenuItem[]; position: MenuPosition } | null;
  /** True while a window is being dragged/resized: iframes get covered by an overlay. */
  interacting: boolean;
  selectedShortcutId: string | null;
  startMenuOpen: boolean;
  shortcutDialog: ShortcutDialogState;
  wallpaperDialogOpen: boolean;
  widgetSettingsId: string | null;
  confirm: ConfirmRequest | null;
  /** Outline of the grid cell a dragged icon or widget will snap to. */
  snapPreview: { x: number; y: number; width: number; height: number } | null;
  setSnapPreview: (preview: UiState['snapPreview']) => void;
  /** Cell each desktop item is shown at (see Desktop/DesktopGrid.ts). */
  displayLayout: Record<string, CellRect>;
  setDisplayLayout: (layout: Record<string, CellRect>) => void;
  openContextMenu:(items: MenuItem[], position: MenuPosition) => void;
  closeContextMenu: () => void;
  setInteracting: (value: boolean) => void;
  selectShortcut: (id: string | null) => void;
  setStartMenuOpen: (open: boolean) => void;
  toggleStartMenu: () => void;
  openShortcutDialog: (state: ShortcutDialogState) => void;
  setWallpaperDialogOpen: (open: boolean) => void;
  openWidgetSettings: (id: string | null) => void;
  requestConfirm: (request: ConfirmRequest | null) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  contextMenu: null,
  interacting: false,
  selectedShortcutId: null,
  startMenuOpen: false,
  shortcutDialog: null,
  wallpaperDialogOpen: false,
  widgetSettingsId: null,
  confirm: null,
  snapPreview: null,
  setSnapPreview: (preview) => set({ snapPreview: preview }),
  displayLayout: {},
  setDisplayLayout: (layout) => {
    if (JSON.stringify(layout) !== JSON.stringify(get().displayLayout)) set({ displayLayout: layout });
  },
  openContextMenu: (items, position) => set({ contextMenu: { items, position }, startMenuOpen: false }),
  closeContextMenu: () => {
    if (get().contextMenu) set({ contextMenu: null });
  },
  setInteracting: (value) => {
    if (get().interacting !== value) set({ interacting: value });
  },
  selectShortcut: (id) => {
    if (get().selectedShortcutId !== id) set({ selectedShortcutId: id });
  },
  setStartMenuOpen: (open) => set({ startMenuOpen: open, contextMenu: open ? null : get().contextMenu }),
  toggleStartMenu: () => set((s) => ({ startMenuOpen: !s.startMenuOpen, contextMenu: null })),
  openShortcutDialog: (state) => set({ shortcutDialog: state, contextMenu: null }),
  setWallpaperDialogOpen: (open) => set({ wallpaperDialogOpen: open, contextMenu: null }),
  openWidgetSettings: (id) => set({ widgetSettingsId: id, contextMenu: null }),
  requestConfirm: (request) => set({ confirm: request, contextMenu: null }),
}));

/** Promise flavour of the confirm dialog (used by close guards). */
export function confirmAsync(request: Omit<ConfirmRequest, 'onConfirm' | 'onCancel'>): Promise<boolean> {
  return new Promise((resolve) => {
    useUiStore.getState().requestConfirm({
      ...request,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}
