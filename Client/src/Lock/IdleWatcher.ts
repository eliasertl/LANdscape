import { useEffect } from 'react';
import { useDesktopStore } from '../Store/DesktopStore';
import { useSessionStore } from '../Store/SessionStore';
import { api } from '../Api/Http';

const CHANNEL = 'landscape-activity';
const STORAGE_KEY = 'landscape.lastActivity';
const HEARTBEAT_MS = 60_000;
const CHECK_MS = 5_000;

/**
 * Auto-lock after Settings → Lock → idle minutes. Activity (pointer, keys,
 * touch, the tab becoming visible) is shared across tabs through a
 * BroadcastChannel and localStorage, so one active tab keeps all of them
 * unlocked. An active tab also sends a heartbeat to the server about once a
 * minute, because the server locks idle sessions on its own (a client-only
 * lock would be fake security).
 */
export function useIdleWatcher(): void {
  const idleMinutes = useDesktopStore((s) => s.settings?.lock.idleMinutes ?? 0);
  const status = useSessionStore((s) => s.status);

  useEffect(() => {
    if (status !== 'unlocked') return;
    let lastActivity = Date.now();
    let lastHeartbeat = 0;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (event: MessageEvent<number>) => {
        if (typeof event.data === 'number' && event.data > lastActivity) lastActivity = event.data;
      };
    } catch {
      channel = null;
    }
    const readShared = () => {
      try {
        const stored = Number(localStorage.getItem(STORAGE_KEY));
        if (stored > lastActivity) lastActivity = stored;
      } catch {
        // ignore
      }
    };
    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivity < 1000) return;
      lastActivity = now;
      try {
        localStorage.setItem(STORAGE_KEY, String(now));
        channel?.postMessage(now);
      } catch {
        // ignore
      }
      if (now - lastHeartbeat > HEARTBEAT_MS) {
        lastHeartbeat = now;
        void api.post('/api/auth/activity').catch(() => undefined);
      }
    };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
    for (const name of events) window.addEventListener(name, onActivity, { passive: true });
    const onVisible = () => {
      if (document.visibilityState === 'visible') onActivity();
    };
    document.addEventListener('visibilitychange', onVisible);

    const timer = window.setInterval(() => {
      if (idleMinutes <= 0) return;
      readShared();
      if (Date.now() - lastActivity >= idleMinutes * 60_000) void useSessionStore.getState().lock();
    }, CHECK_MS);

    return () => {
      for (const name of events) window.removeEventListener(name, onActivity);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
      channel?.close();
    };
  }, [idleMinutes, status]);
}
