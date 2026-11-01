import { create } from 'zustand';
import type { SessionInfo } from '@landscape/shared';
import { api } from '../Api/Http';

interface SessionState {
  /** locked = no session or a locked one (the lock screen decides between "log in" and "unlock" by `hasSession`). */
  status: 'loading' | 'locked' | 'unlocked';
  /** A session exists but is locked server-side: the lock screen asks for the password only. */
  hasSession: boolean;
  username: string | null;
  lockScreenWallpaper: string | null;
  lockScreen: SessionInfo['lockScreen'] | null;
  /** Startup animation to play on page load (null when it does not play on load). */
  startup: SessionInfo['startup'];
  /** Counts logins/unlocks so the desktop can play the after-login animation once per unlock. */
  unlockCount: number;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Locks server-side, then shows the lock screen. */
  lock: () => Promise<void>;
  /** The server said the session is locked or gone (401/423 on a request). */
  lockedByServer: (hasSession: boolean) => void;
}

function applyInfo(info: SessionInfo) {
  return {
    status: info.authenticated && !info.locked ? ('unlocked' as const) : ('locked' as const),
    hasSession: info.authenticated,
    username: info.username,
    lockScreenWallpaper: info.lockScreenWallpaper,
    lockScreen: info.lockScreen,
    startup: info.startup,
  };
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'loading',
  hasSession: false,
  username: null,
  lockScreenWallpaper: null,
  lockScreen: null,
  startup: null,
  unlockCount: 0,
  async refresh() {
    try {
      const info = await api.get<SessionInfo>('/api/auth/session');
      set(applyInfo(info));
    } catch {
      set({ status: 'locked', hasSession: false });
    }
  },
  async login(username, password) {
    const info = await api.post<SessionInfo>('/api/auth/login', { username, password });
    set({ ...applyInfo(info), unlockCount: get().unlockCount + 1 });
  },
  async unlock(password) {
    const info = await api.post<SessionInfo>('/api/auth/unlock', { password });
    set({ ...applyInfo(info), unlockCount: get().unlockCount + 1 });
  },
  async logout() {
    try {
      await api.post('/api/auth/logout');
    } finally {
      set({ status: 'locked', hasSession: false, username: null });
    }
  },
  async lock() {
    try {
      await api.post('/api/auth/lock');
    } catch {
      // Already locked or logged out: the probe below reports the server state.
    }
    // Re-read the probe so the lock screen shows the current look (clock, message, blur).
    await get().refresh();
  },
  lockedByServer(hasSession) {
    if (get().status !== 'locked') set({ status: 'locked', hasSession });
  },
}));
