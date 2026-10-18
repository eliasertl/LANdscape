import { create } from 'zustand';
import { WINDOW_DEFAULT_SIZE, WINDOW_MIN_SIZE, type AppId, type WindowGeometry } from '@landscape/shared';
import { useDesktopStore } from './DesktopStore';
import { clampRect, cascadeRect, type Rect, workArea } from '../Windows/WindowGeometry';

export interface DesktopWindow {
  id: string;
  /** 'shortcut:<id>' or 'app:<appId>' — groups windows and keys window memory. */
  appKey: string;
  kind: 'shortcut' | 'app';
  shortcutId: string | null;
  appId: AppId | null;
  title: string;
  params: Record<string, unknown>;
  rect: Rect;
  /** Rect to restore to after un-maximizing. */
  prevRect: Rect | null;
  maximized: boolean;
  minimized: boolean;
  /** Set when a close was requested; the component animates out then calls remove(). */
  closing: boolean;
  z: number;
  createdAt: number;
}

export interface OpenWindowOptions {
  kind: 'shortcut' | 'app';
  shortcutId?: string;
  appId?: AppId;
  title: string;
  params?: Record<string, unknown>;
  defaultSize?: { width: number; height: number };
  /** When true and a window for this appKey exists, focus it instead of opening another. */
  single?: boolean;
}

type BeforeClose = () => boolean | Promise<boolean>;

interface WindowState {
  windows: DesktopWindow[];
  focusedId: string | null;
  nextZ: number;
  open: (options: OpenWindowOptions) => string;
  focus: (id: string) => void;
  /** Runs the window's beforeClose guard, then marks it closing. */
  requestClose: (id: string) => Promise<void>;
  remove: (id: string) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  toggleMaximize: (id: string) => void;
  setRect: (id: string, rect: Rect, persist?: boolean) => void;
  setTitle: (id: string, title: string) => void;
  closeAll: (appKey: string) => Promise<void>;
  closeAllWindows: () => Promise<void>;
  /** Taskbar semantics: focus/restore the group's top window, or minimize it when it is already focused. */
  toggleGroup: (appKey: string) => void;
  registerBeforeClose: (id: string, guard: BeforeClose | null) => void;
  /** Re-clamps every window into the current viewport (on resize). */
  relayout: () => void;
}

const beforeCloseGuards = new Map<string, BeforeClose>();
let counter = 0;

function topWindow(windows: DesktopWindow[], predicate: (w: DesktopWindow) => boolean = () => true): DesktopWindow | null {
  let best: DesktopWindow | null = null;
  for (const w of windows) {
    if (w.closing || !predicate(w)) continue;
    if (!best || w.z > best.z) best = w;
  }
  return best;
}

function persistGeometry(w: DesktopWindow): void {
  const rect = w.maximized && w.prevRect ? w.prevRect : w.rect;
  const geometry: WindowGeometry = { ...rect, maximized: w.maximized };
  useDesktopStore.getState().saveWindowGeometry(w.appKey, geometry);
}

export const useWindowStore = create<WindowState>((set, get) => ({
  windows: [],
  focusedId: null,
  nextZ: 1,

  open(options) {
    const appKey = options.kind === 'shortcut' ? `shortcut:${options.shortcutId}` : `app:${options.appId}`;
    const state = get();
    if (options.single) {
      const existing = topWindow(state.windows, (w) => w.appKey === appKey);
      if (existing) {
        get().restore(existing.id);
        get().focus(existing.id);
        if (options.params) set((s) => ({ windows: s.windows.map((w) => (w.id === existing.id ? { ...w, params: options.params ?? {} } : w)) }));
        return existing.id;
      }
    }
    const memory = useDesktopStore.getState().windowMemory[appKey];
    const area = workArea();
    const size = options.defaultSize ?? WINDOW_DEFAULT_SIZE;
    let rect: Rect = memory
      ? { x: memory.x, y: memory.y, width: memory.width, height: memory.height }
      : {
          x: Math.round(area.x + (area.width - Math.min(size.width, area.width - 40)) / 2),
          y: Math.round(area.y + Math.max(24, (area.height - Math.min(size.height, area.height - 40)) / 2 - 20)),
          width: size.width,
          height: size.height,
        };
    const siblings = state.windows.filter((w) => w.appKey === appKey && !w.closing);
    rect = cascadeRect(rect, siblings.map((w) => w.rect), area);
    rect = clampRect(rect, area, WINDOW_MIN_SIZE);
    const id = `w${++counter}`;
    const z = state.nextZ;
    const win: DesktopWindow = {
      id,
      appKey,
      kind: options.kind,
      shortcutId: options.shortcutId ?? null,
      appId: options.appId ?? null,
      title: options.title,
      params: options.params ?? {},
      rect,
      prevRect: null,
      maximized: memory?.maximized ?? false,
      minimized: false,
      closing: false,
      z,
      createdAt: Date.now(),
    };
    if (win.maximized) {
      win.prevRect = rect;
      win.rect = { ...area };
    }
    set({ windows: [...state.windows, win], focusedId: id, nextZ: z + 1 });
    return id;
  },

  focus(id) {
    const state = get();
    const win = state.windows.find((w) => w.id === id);
    if (!win || win.closing) return;
    if (state.focusedId === id && win.z === state.nextZ - 1 && !win.minimized) return;
    set({
      windows: state.windows.map((w) => (w.id === id ? { ...w, z: state.nextZ, minimized: false } : w)),
      focusedId: id,
      nextZ: state.nextZ + 1,
    });
  },

  async requestClose(id) {
    const guard = beforeCloseGuards.get(id);
    if (guard) {
      const ok = await guard();
      if (!ok) return;
    }
    const state = get();
    const win = state.windows.find((w) => w.id === id);
    if (!win) return;
    persistGeometry(win);
    const next = topWindow(
      state.windows,
      (w) => w.id !== id && !w.minimized,
    );
    set({ windows: state.windows.map((w) => (w.id === id ? { ...w, closing: true } : w)), focusedId: next?.id ?? null });
  },

  remove(id) {
    beforeCloseGuards.delete(id);
    set((s) => ({ windows: s.windows.filter((w) => w.id !== id) }));
  },

  minimize(id) {
    const state = get();
    const next = topWindow(state.windows, (w) => w.id !== id && !w.minimized);
    set({
      windows: state.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
      focusedId: state.focusedId === id ? (next?.id ?? null) : state.focusedId,
    });
  },

  restore(id) {
    const state = get();
    const win = state.windows.find((w) => w.id === id);
    if (!win) return;
    set({
      windows: state.windows.map((w) => (w.id === id ? { ...w, minimized: false, z: state.nextZ } : w)),
      focusedId: id,
      nextZ: state.nextZ + 1,
    });
  },

  toggleMaximize(id) {
    const state = get();
    const area = workArea();
    const windows = state.windows.map((w) => {
      if (w.id !== id) return w;
      if (w.maximized) {
        const rect = clampRect(w.prevRect ?? { ...area, width: WINDOW_DEFAULT_SIZE.width, height: WINDOW_DEFAULT_SIZE.height }, area, WINDOW_MIN_SIZE);
        return { ...w, maximized: false, rect, prevRect: null };
      }
      return { ...w, maximized: true, prevRect: w.rect, rect: { ...area } };
    });
    set({ windows });
    const win = windows.find((w) => w.id === id);
    if (win) persistGeometry(win);
    get().focus(id);
  },

  setRect(id, rect, persist = false) {
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, rect } : w)) }));
    if (persist) {
      const win = get().windows.find((w) => w.id === id);
      if (win) persistGeometry(win);
    }
  },

  setTitle(id, title) {
    set((s) => ({ windows: s.windows.map((w) => (w.id === id && w.title !== title ? { ...w, title } : w)) }));
  },

  async closeAll(appKey) {
    const ids = get()
      .windows.filter((w) => w.appKey === appKey && !w.closing)
      .map((w) => w.id);
    for (const id of ids) await get().requestClose(id);
  },

  async closeAllWindows() {
    const ids = get()
      .windows.filter((w) => !w.closing)
      .map((w) => w.id);
    for (const id of ids) await get().requestClose(id);
  },

  toggleGroup(appKey) {
    const state = get();
    const group = state.windows.filter((w) => w.appKey === appKey && !w.closing);
    if (group.length === 0) return;
    const focused = group.find((w) => w.id === state.focusedId && !w.minimized);
    if (focused) {
      get().minimize(focused.id);
      return;
    }
    const visible = topWindow(group, (w) => !w.minimized);
    if (visible) {
      get().focus(visible.id);
      return;
    }
    const last = topWindow(group) ?? group[0];
    if (last) get().restore(last.id);
  },

  registerBeforeClose(id, guard) {
    if (guard) beforeCloseGuards.set(id, guard);
    else beforeCloseGuards.delete(id);
  },

  relayout() {
    const area = workArea();
    set((s) => ({
      windows: s.windows.map((w) => (w.maximized ? { ...w, rect: { ...area } } : { ...w, rect: clampRect(w.rect, area, WINDOW_MIN_SIZE) })),
    }));
  },
}));

/** Convenience selectors. */
export const selectVisibleWindows = (s: WindowState) => s.windows;
