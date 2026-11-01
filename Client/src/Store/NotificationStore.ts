import { create } from 'zustand';
import type { EventsServerMessage, Notification } from '@landscape/shared';
import { api } from '../Api/Http';
import { eventsSocket } from '../Api/EventsSocket';
import { useDeviceStore } from './DeviceStore';
import { useDesktopStore } from './DesktopStore';
import { toast } from '../Components/Toast';

interface NotificationState {
  notifications: Notification[];
  unread: number;
  loaded: boolean;
  /** The notification center panel. */
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  load: () => Promise<void>;
  markRead: (ids: string[] | 'all') => Promise<void>;
  clear: () => Promise<void>;
  sendTest: () => Promise<void>;
  /** Starts listening to /ws/events (desktop and phone call this once). */
  connect: () => () => void;
}

/** Whether native browser notifications can work here, with the reason when they cannot. */
export function nativeNotificationSupport(): { available: boolean; reason: string | null; permission: NotificationPermission | null } {
  if (typeof Notification === 'undefined') return { available: false, reason: 'This browser has no Notification API.', permission: null };
  if (!window.isSecureContext) {
    return { available: false, reason: 'Native notifications need HTTPS or localhost; on a plain http:// LAN address the browser does not offer them. In-app toasts are used instead.', permission: null };
  }
  const permission = Notification.permission;
  if (permission === 'denied') return { available: false, reason: 'Notifications are blocked for this site in the browser. Allow them in the site settings.', permission };
  return { available: true, reason: null, permission };
}

function showNative(notification: Notification): boolean {
  const support = nativeNotificationSupport();
  if (!support.available || support.permission !== 'granted') return false;
  try {
    const native = new Notification(notification.title, { body: notification.body, tag: notification.id, silent: false });
    native.onclick = () => {
      window.focus();
      useNotificationStore.getState().setOpen(true);
      native.close();
    };
    return true;
  } catch {
    return false;
  }
}

function present(notification: Notification): void {
  const settings = useDesktopStore.getState().settings;
  if (settings?.notifications.dnd) return;
  const mode = useDeviceStore.getState().settings.notificationMode;
  if (mode === 'native' && (document.hidden || true) && showNative(notification)) return;
  const text = notification.body ? `${notification.title} — ${notification.body}` : notification.title;
  if (notification.level === 'error') toast.error(text);
  else if (notification.level === 'warning') toast.info(text);
  else toast.info(text);
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unread: 0,
  loaded: false,
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),

  async load() {
    try {
      const result = await api.get<{ notifications: Notification[]; unread: number }>('/api/notifications');
      set({ notifications: result.notifications, unread: result.unread, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  async markRead(ids) {
    // Optimistic: the server confirms over the socket.
    const now = new Date().toISOString();
    set((s) => ({
      notifications: s.notifications.map((n) => (ids === 'all' || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)),
      unread: ids === 'all' ? 0 : Math.max(0, s.unread - ids.filter((id) => s.notifications.some((n) => n.id === id && !n.readAt)).length),
    }));
    await api.post('/api/notifications/read', { ids }).catch(() => undefined);
  },

  async clear() {
    set({ notifications: [], unread: 0 });
    await api.delete('/api/notifications').catch(() => undefined);
  },

  async sendTest() {
    await api.post('/api/notifications', { title: 'Test notification', body: 'This is how notifications look on this device.', level: 'info', source: 'test' });
  },

  connect() {
    void get().load();
    const onMessage = (message: EventsServerMessage) => {
      if (message.type === 'notification') {
        set((s) => ({ notifications: [message.notification, ...s.notifications.filter((n) => n.id !== message.notification.id)].slice(0, 500), unread: s.unread + 1 }));
        present(message.notification);
      } else if (message.type === 'notifications-read') {
        const now = new Date().toISOString();
        set((s) => ({
          notifications: s.notifications.map((n) => (message.ids === 'all' || message.ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)),
          unread: message.ids === 'all' ? 0 : s.notifications.filter((n) => !n.readAt && !(message.ids as string[]).includes(n.id)).length,
        }));
      } else if (message.type === 'notifications-cleared') {
        set({ notifications: [], unread: 0 });
      } else if (message.type === 'settings-changed') {
        void useDesktopStore.getState().load();
      }
    };
    const unsubscribe = eventsSocket.subscribe(onMessage);
    const reopen = eventsSocket.onOpen(() => void get().load());
    return () => {
      unsubscribe();
      reopen();
    };
  },
}));
