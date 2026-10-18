import { create } from 'zustand';
import type {
  DesktopBootstrap,
  Settings,
  SettingsUpdateInput,
  Shortcut,
  ShortcutCreateInput,
  ShortcutUpdateInput,
  Widget,
  WidgetSettings,
  WidgetType,
  WindowGeometry,
  WindowMemory,
} from '@landscape/shared';
import { api } from '../Api/Http';
import { applyTheme } from '../Design/Theme';

interface DesktopState {
  loaded: boolean;
  error: string | null;
  shortcuts: Shortcut[];
  widgets: Widget[];
  settings: Settings | null;
  windowMemory: WindowMemory;
  integrations: DesktopBootstrap['integrations'];
  version: string;
  load: () => Promise<void>;
  createShortcut: (input: ShortcutCreateInput) => Promise<Shortcut>;
  updateShortcut: (id: string, patch: ShortcutUpdateInput) => Promise<Shortcut>;
  recheckShortcut: (id: string) => Promise<Shortcut>;
  deleteShortcut: (id: string) => Promise<void>;
  /** Optimistic move; positions are flushed to the server shortly after. */
  moveShortcut: (id: string, x: number, y: number) => void;
  addWidget: (type: WidgetType, x: number, y: number) => Promise<Widget>;
  moveWidget: (id: string, x: number, y: number) => void;
  updateWidgetSettings: (id: string, settings: WidgetSettings) => Promise<Widget>;
  removeWidget: (id: string) => Promise<void>;
  updateSettings: (patch: SettingsUpdateInput) => Promise<Settings>;
  saveWindowGeometry: (appKey: string, geometry: WindowGeometry) => void;
}

const pendingPositions = new Map<string, { x: number; y: number }>();
let positionsTimer: number | null = null;
function flushPositionsSoon() {
  if (positionsTimer !== null) return;
  positionsTimer = window.setTimeout(() => {
    positionsTimer = null;
    const positions = [...pendingPositions.entries()].map(([id, p]) => ({ id, ...p }));
    pendingPositions.clear();
    if (positions.length > 0) void api.put('/api/shortcuts/positions', { positions }).catch(() => undefined);
  }, 400);
}

const pendingWidgetMoves = new Map<string, number>();
function flushWidgetMoveSoon(id: string, x: number, y: number) {
  const existing = pendingWidgetMoves.get(id);
  if (existing) window.clearTimeout(existing);
  pendingWidgetMoves.set(
    id,
    window.setTimeout(() => {
      pendingWidgetMoves.delete(id);
      void api.patch(`/api/widgets/${id}`, { x, y }).catch(() => undefined);
    }, 400),
  );
}

const pendingGeometry = new Map<string, number>();

export const useDesktopStore = create<DesktopState>((set, get) => ({
  loaded: false,
  error: null,
  shortcuts: [],
  widgets: [],
  settings: null,
  windowMemory: {},
  integrations: { ssh: false, docker: false, hostProc: false, hostSys: false },
  version: '',

  async load() {
    try {
      const data = await api.get<DesktopBootstrap>('/api/desktop');
      set({
        loaded: true,
        error: null,
        shortcuts: data.shortcuts,
        widgets: data.widgets,
        settings: data.settings,
        windowMemory: data.windowMemory,
        integrations: data.integrations,
        version: data.version,
      });
      applyTheme(data.settings.theme, false);
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

  moveShortcut(id, x, y) {
    set((s) => ({ shortcuts: s.shortcuts.map((sc) => (sc.id === id ? { ...sc, x, y } : sc)) }));
    pendingPositions.set(id, { x, y });
    flushPositionsSoon();
  },

  async addWidget(type, x, y) {
    const widget = await api.post<Widget>('/api/widgets', { type, x, y });
    set((s) => ({ widgets: [...s.widgets, widget] }));
    return widget;
  },

  moveWidget(id, x, y) {
    set((s) => ({ widgets: s.widgets.map((w) => (w.id === id ? { ...w, x, y } : w)) }));
    flushWidgetMoveSoon(id, x, y);
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

  async updateSettings(patch) {
    const previous = get().settings;
    if (patch.theme) applyTheme(patch.theme);
    if (previous) set({ settings: { ...previous, ...patch, enabledApps: { ...previous.enabledApps, ...(patch.enabledApps ?? {}) } } as Settings });
    try {
      const settings = await api.patch<Settings>('/api/settings', patch);
      set({ settings });
      return settings;
    } catch (error) {
      if (previous) {
        set({ settings: previous });
        applyTheme(previous.theme);
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

export function wallpaperUrl(settings: Settings | null): string | null {
  if (!settings) return null;
  return `/wallpapers/${settings.wallpaper.kind}/${settings.wallpaper.file}`;
}
