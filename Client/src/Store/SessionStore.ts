import { create } from 'zustand';
import type { SessionInfo } from '@landscape/shared';
import { api } from '../Api/Http';

interface SessionState {
  status: 'loading' | 'locked' | 'unlocked';
  username: string | null;
  lockScreenWallpaper: string | null;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  lock: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'loading',
  username: null,
  lockScreenWallpaper: null,
  async refresh() {
    try {
      const info = await api.get<SessionInfo>('/api/auth/session');
      set({
        status: info.authenticated ? 'unlocked' : 'locked',
        username: info.username,
        lockScreenWallpaper: info.lockScreenWallpaper,
      });
    } catch {
      set({ status: 'locked' });
    }
  },
  async login(username, password) {
    const info = await api.post<SessionInfo>('/api/auth/login', { username, password });
    set({ status: 'unlocked', username: info.username });
  },
  async logout() {
    try {
      await api.post('/api/auth/logout');
    } finally {
      set({ status: 'locked', username: null });
    }
  },
  lock() {
    set({ status: 'locked' });
  },
}));
