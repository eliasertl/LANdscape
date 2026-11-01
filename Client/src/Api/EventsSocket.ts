import type { EventsServerMessage } from '@landscape/shared';
import { wsUrl } from './Http';

type Listener = (message: EventsServerMessage) => void;

/**
 * One WebSocket to /ws/events for the whole desktop: notifications, monitor
 * status changes and settings changes made elsewhere. Reconnects with
 * backoff; stays closed while nobody listens.
 */
class EventsSocket {
  private socket: WebSocket | null = null;
  private readonly listeners = new Set<Listener>();
  private reconnectTimer: number | null = null;
  private attempts = 0;
  private closedByUs = false;
  private readonly openListeners = new Set<() => void>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.ensureOpen();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.close();
    };
  }

  /** Called after every (re)connect, so stores can re-fetch what they missed. */
  onOpen(listener: () => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  private ensureOpen(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
    this.closedByUs = false;
    const socket = new WebSocket(wsUrl('/ws/events'));
    this.socket = socket;
    socket.addEventListener('open', () => {
      const reconnected = this.attempts > 0;
      this.attempts = 0;
      if (reconnected) for (const listener of this.openListeners) listener();
    });
    socket.addEventListener('message', (event) => {
      let message: EventsServerMessage;
      try {
        message = JSON.parse(String(event.data)) as EventsServerMessage;
      } catch {
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
    socket.addEventListener('close', () => {
      if (this.socket === socket) this.socket = null;
      if (!this.closedByUs && this.listeners.size > 0) this.scheduleReconnect();
    });
    socket.addEventListener('error', () => undefined);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.attempts, 5));
    this.attempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.listeners.size > 0) this.ensureOpen();
    }, delay);
  }

  private close(): void {
    this.closedByUs = true;
    this.socket?.close();
    this.socket = null;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export const eventsSocket = new EventsSocket();
