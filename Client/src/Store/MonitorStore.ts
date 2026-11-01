import { create } from 'zustand';
import type { EventsServerMessage, MonitorStatus } from '@landscape/shared';
import { api } from '../Api/Http';
import { eventsSocket } from '../Api/EventsSocket';

interface MonitorState {
  /** By target id ("shortcut:<id>", "<appId>:<key>"). */
  statuses: Record<string, MonitorStatus>;
  intervalSeconds: number;
  loaded: boolean;
  load: () => Promise<void>;
  checkNow: () => Promise<void>;
  connect: () => () => void;
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  statuses: {},
  intervalSeconds: 60,
  loaded: false,

  async load() {
    try {
      const result = await api.get<{ intervalSeconds: number; statuses: MonitorStatus[] }>('/api/monitor');
      set({ statuses: Object.fromEntries(result.statuses.map((s) => [s.target.id, s])), intervalSeconds: result.intervalSeconds, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  async checkNow() {
    const result = await api.post<{ statuses: MonitorStatus[] }>('/api/monitor/check');
    set({ statuses: Object.fromEntries(result.statuses.map((s) => [s.target.id, s])) });
  },

  connect() {
    void get().load();
    const onMessage = (message: EventsServerMessage) => {
      if (message.type === 'monitor-status') set((s) => ({ statuses: { ...s.statuses, [message.status.target.id]: message.status } }));
      else if (message.type === 'monitor-targets') void get().load();
    };
    const unsubscribe = eventsSocket.subscribe(onMessage);
    const reopen = eventsSocket.onOpen(() => void get().load());
    return () => {
      unsubscribe();
      reopen();
    };
  },
}));

/** Summary for the tray: how many targets are up, down or unknown. */
export function monitorSummary(statuses: Record<string, MonitorStatus>): { up: number; down: number; unknown: number } {
  const summary = { up: 0, down: 0, unknown: 0 };
  for (const status of Object.values(statuses)) summary[status.state] += 1;
  return summary;
}
