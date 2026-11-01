import { create } from 'zustand';
import {
  applySettingsPatch,
  type AnchoredPosition,
  type DesktopBootstrap,
  type Folder,
  type ProxyRange,
  type Settings,
  type SettingsUpdateInput,
  type Shortcut,
  type ShortcutCreateInput,
  type ShortcutUpdateInput,
  type Widget,
  type WidgetSettings,
  type WidgetSize,
  type WidgetType,
  type WindowGeometry,
  type WindowMemory,
} from '@landscape/shared';
import { api } from '../Api/Http';
import { applyAppearance, applyTheme } from '../Design/Theme';

/** One desktop item to move; the kinds share the positions route. */
export interface PositionedItem {
  kind: 'shortcut' | 'widget' | 'folder';
  id: string;
  position: AnchoredPosition;
}

interface DesktopState {
  loaded: boolean;
  error: string | null;
  shortcuts: Shortcut[];
  widgets: Widget[];
  folders: Folder[];
  settings: Settings | null;
  windowMemory: WindowMemory;
  integrations: DesktopBootstrap['integrations'];
  proxy: ProxyRange;
  version: string;
  load: () => Promise<void>;
  createShortcut: (input: ShortcutCreateInput) => Promise<Shortcut>;
  updateShortcut: (id: string, patch: ShortcutUpdateInput) => Promise<Shortcut>;
  recheckShortcut: (id: string) => Promise<Shortcut>;
  deleteShortcut: (id: string) => Promise<void>;
  /** Optimistic move of one item; positions are flushed to the server shortly after. */
  moveItem: (item: PositionedItem) => void;
  /** Moves several items at once (untangling, re-anchoring); flushed right away. */
  moveItems: (items: PositionedItem[]) => void;
  addWidget: (type: WidgetType, position: AnchoredPosition, size: WidgetSize, settings?: Partial<WidgetSettings>) => Promise<Widget>;
  resizeWidget: (id: string, size: WidgetSize) => Promise<Widget>;
  updateWidgetSettings: (id: string, settings: WidgetSettings) => Promise<Widget>;
  removeWidget: (id: string) => Promise<void>;
  createFolder: (name: string, position?: AnchoredPosition) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<Folder>;
  /** Deletes the folder; its shortcuts come back onto the desktop. */
  deleteFolder: (id: string) => Promise<void>;
  /** Puts a shortcut into a folder (or back onto the desktop at `position` when folderId is null). */
  moveShortcutToFolder: (id: string, folderId: string | null, position?: AnchoredPosition) => Promise<Shortcut>;
  updateSettings: (patch: SettingsUpdateInput) => Promise<Settings>;
  saveWindowGeometry: (appKey: string, geometry: WindowGeometry) => void;
}

const pendingMoves = new Map<string, PositionedItem>();
let movesTimer: number | null = null;
function flushMoves(): void {
  if (movesTimer !== null) {
    window.clearTimeout(movesTimer);
    movesTimer = null;
  }
  const items = [...pendingMoves.values()];
  pendingMoves.clear();
  if (items.length > 0) void api.put('/api/desktop/positions', { items }).catch(() => undefined);
}
function flushMovesSoon(): void {
  if (movesTimer !== null) return;
  movesTimer = window.setTimeout(flushMoves, 400);
}

const pendingGeometry = new Map<string, number>();

function applyMoves<T extends { id: string; position: AnchoredPosition }>(list: T[], kind: PositionedItem['kind'], items: PositionedItem[]): T[] {
  const moves = new Map(items.filter((i) => i.kind === kind).map((i) => [i.id, i.position]));
  if (moves.size === 0) return list;
  return list.map((entry) => (moves.has(entry.id) ? { ...entry, position: moves.get(entry.id) as AnchoredPosition } : entry));
}

export const useDesktopStore = create<DesktopState>((set, get) => ({
  loaded: false,
  error: null,
  shortcuts: [],
  widgets: [],
  folders: [],
  settings: null,
  windowMemory: {},
  integrations: { ssh: false, docker: false, hostProc: false, hostSys: false },
  proxy: { start: 0, end: -1 },
  version: '',

  async load() {
    try {
      const data = await api.get<DesktopBootstrap>('/api/desktop');
      set({
        loaded: true,
        error: null,
        shortcuts: data.shortcuts,
        widgets: data.widgets,
        folders: data.folders,
        settings: data.settings,
        windowMemory: data.windowMemory,
        integrations: data.integrations,
        proxy: data.proxy,
        version: data.version,
      });
      applyTheme(data.settings.theme, false);
      applyAppearance(data.settings.appearance);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load the desktop' });
    }
  },

  async createShortcut(input) {
    const created = await api.post<Shortcut>('/api/shortcuts', input);
    set((s) => ({ shortcuts: [...s.shortcuts, created] }));
    return created;
  },

  async updateShortcut(id, patch) {
    const updated = await api.patch<Shortcut>(`/api/shortcuts/${id}`, patch);
    set((s) => ({ shortcuts: s.shortcuts.map((x) => (x.id === id ? updated : x)) }));
    return updated;
  },

  async recheckShortcut(id) {
    const updated = await api.post<Shortcut>(`/api/shortcuts/${id}/recheck`);
    set((s) => ({ shortcuts: s.shortcuts.map((x) => (x.id === id ? updated : x)) }));
    return updated;
  },

  async deleteShortcut(id) {
    await api.delete(`/api/shortcuts/${id}`);
    set((s) => ({ shortcuts: s.shortcuts.filter((x) => x.id !== id) }));
  },

  moveItem(item) {
    get().moveItems([item]);
  },

  moveItems(items) {
    set((s) => ({
      shortcuts: applyMoves(s.shortcuts, 'shortcut', items),
      widgets: applyMoves(s.widgets, 'widget', items),
      folders: applyMoves(s.folders, 'folder', items),
    }));
    for (const item of items) pendingMoves.set(`${item.kind}:${item.id}`, item);
    if (items.length > 1) flushMoves();
    else flushMovesSoon();
  },

  async addWidget(type, position, size, settings) {
    const widget = await api.post<Widget>('/api/widgets', { type, position, size, settings });
    set((s) => ({ widgets: [...s.widgets, widget] }));
    return widget;
  },

  async resizeWidget(id, size) {
    const updated = await api.patch<Widget>(`/api/widgets/${id}`, { size });
    set((s) => ({ widgets: s.widgets.map((w) => (w.id === id ? updated : w)) }));
    return updated;
  },

  async updateWidgetSettings(id, settings) {
    const updated = await api.patch<Widget>(`/api/widgets/${id}`, { settings });
    set((s) => ({ widgets: s.widgets.map((w) => (w.id === id ? updated : w)) }));
    return updated;
  },

  async removeWidget(id) {
    await api.delete(`/api/widgets/${id}`);
    set((s) => ({ widgets: s.widgets.filter((w) => w.id !== id) }));
  },

  async createFolder(name, position) {
    const folder = await api.post<Folder>('/api/folders', { name, position });
    set((s) => ({ folders: [...s.folders, folder] }));
    return folder;
  },

  async renameFolder(id, name) {
    const folder = await api.patch<Folder>(`/api/folders/${id}`, { name });
    set((s) => ({ folders: s.folders.map((f) => (f.id === id ? folder : f)) }));
    return folder;
  },

  async deleteFolder(id) {
    const result = await api.delete<{ ok: boolean; shortcuts: Shortcut[] }>(`/api/folders/${id}`);
    set((s) => ({ folders: s.folders.filter((f) => f.id !== id), shortcuts: result.shortcuts }));
  },

  async moveShortcutToFolder(id, folderId, position) {
    const current = get().shortcuts.find((s) => s.id === id);
    // Optimistic, so the icon disappears into the folder without a round trip.
    if (current) set((s) => ({ shortcuts: s.shortcuts.map((x) => (x.id === id ? { ...x, folderId, position: position ?? x.position } : x)) }));
    try {
      const updated = await api.patch<Shortcut>(`/api/shortcuts/${id}`, { folderId, ...(position ? { position } : {}) });
      set((s) => ({ shortcuts: s.shortcuts.map((x) => (x.id === id ? updated : x)) }));
      return updated;
    } catch (error) {
      if (current) set((s) => ({ shortcuts: s.shortcuts.map((x) => (x.id === id ? current : x)) }));
      throw error;
    }
  },

  async updateSettings(patch) {
    const previous = get().settings;
    if (patch.theme) applyTheme(patch.theme);
    let optimistic: Settings | null = null;
    if (previous) {
      optimistic = applySettingsPatch(previous, patch);
      set({ settings: optimistic });
      if (patch.appearance) applyAppearance(optimistic.appearance);
    }
    try {
      const settings = await api.patch<Settings>('/api/settings', patch);
      set({ settings });
      applyAppearance(settings.appearance);
      return settings;
    } catch (error) {
      if (previous) {
        set({ settings: previous });
        applyTheme(previous.theme);
        applyAppearance(previous.appearance);
      }
      throw error;
    }
  },

  saveWindowGeometry(appKey, geometry) {
    set((s) => ({ windowMemory: { ...s.windowMemory, [appKey]: geometry } }));
    const existing = pendingGeometry.get(appKey);
    if (existing) window.clearTimeout(existing);
    pendingGeometry.set(
      appKey,
      window.setTimeout(() => {
        pendingGeometry.delete(appKey);
        void api.put(`/api/window-memory/${encodeURIComponent(appKey)}`, geometry).catch(() => undefined);
      }, 500),
    );
  },
}));

export function shortcutIconUrl(shortcut: Shortcut): string | null {
  if (!shortcut.iconFile) return null;
  return `/icons/${shortcut.iconFile}?v=${encodeURIComponent(shortcut.updatedAt)}`;
}

/** Number of embed proxy ports configured on the server. */
export function proxyTotal(range: ProxyRange): number {
  return Math.max(0, range.end - range.start + 1);
}

export function wallpaperFileUrl(choice: { kind: string; file: string }): string {
  if (choice.kind === 'app') {
    const [appId, bundle] = choice.file.split(/:(.+)/);
    return `/apps/files/${appId}/${bundle}`;
  }
  return `/wallpapers/${choice.kind}/${choice.file}`;
}
