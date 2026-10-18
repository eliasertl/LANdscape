import type { MetricName, MetricPayloads, MetricsClientMessage, MetricsServerMessage } from '@landscape/shared';
import { wsUrl } from './Http';

export type MetricState<K extends MetricName = MetricName> =
  | { status: 'waiting' }
  | { status: 'ok'; data: MetricPayloads[K]; at: number }
  | { status: 'unavailable'; reason: string };

type Listener = (state: MetricState) => void;

interface Subscription {
  intervalMs: number;
  listener: Listener;
}

/**
 * One WebSocket for all widgets. Each subscriber asks for a metric at its
 * own interval; the socket forwards the fastest interval to the server and
 * reconnects with backoff when the connection drops.
 */
class MetricsSocket {
  private socket: WebSocket | null = null;
  private readonly subscriptions = new Map<MetricName, Set<Subscription>>();
  private readonly latest = new Map<MetricName, MetricState>();
  private readonly sent = new Map<MetricName, number>();
  private reconnectTimer: number | null = null;
  private attempts = 0;
  private closedByUs = false;

  subscribe<K extends MetricName>(metric: K, intervalMs: number, listener: (state: MetricState<K>) => void): () => void {
    const subscription: Subscription = { intervalMs, listener: listener as Listener };
    let set = this.subscriptions.get(metric);
    if (!set) {
      set = new Set();
      this.subscriptions.set(metric, set);
    }
    set.add(subscription);
    const known = this.latest.get(metric);
    listener((known ?? { status: 'waiting' }) as MetricState<K>);
    this.ensureOpen();
    this.sync(metric);
    return () => {
      set.delete(subscription);
      if (set.size === 0) {
        this.subscriptions.delete(metric);
        this.send({ type: 'unsubscribe', metric });
        this.sent.delete(metric);
        this.latest.delete(metric);
        if (this.subscriptions.size === 0) this.closeIdle();
      } else {
        this.sync(metric);
      }
    };
  }

  private ensureOpen(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
    this.closedByUs = false;
    const socket = new WebSocket(wsUrl('/ws/metrics'));
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.attempts = 0;
      this.sent.clear();
      for (const metric of this.subscriptions.keys()) this.sync(metric);
    });
    socket.addEventListener('message', (event) => {
      let message: MetricsServerMessage;
      try {
        message = JSON.parse(String(event.data)) as MetricsServerMessage;
      } catch {
        return;
      }
      if (message.type === 'sample') this.dispatch(message.metric, { status: 'ok', data: message.data, at: message.at });
      else if (message.type === 'unavailable') this.dispatch(message.metric, { status: 'unavailable', reason: message.reason });
    });
    socket.addEventListener('close', () => {
      if (this.socket === socket) this.socket = null;
      if (!this.closedByUs && this.subscriptions.size > 0) this.scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      // close follows; nothing else to do
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.attempts, 5));
    this.attempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.subscriptions.size > 0) this.ensureOpen();
    }, delay);
  }

  private closeIdle(): void {
    this.closedByUs = true;
    this.socket?.close();
    this.socket = null;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /** Sends the fastest interval requested for a metric, if it changed. */
  private sync(metric: MetricName): void {
    const set = this.subscriptions.get(metric);
    if (!set || set.size === 0) return;
    let fastest = Number.POSITIVE_INFINITY;
    for (const s of set) fastest = Math.min(fastest, s.intervalMs);
    if (this.sent.get(metric) === fastest) return;
    if (this.send({ type: 'subscribe', metric, intervalMs: fastest })) this.sent.set(metric, fastest);
  }

  private send(message: MetricsClientMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private dispatch(metric: MetricName, state: MetricState): void {
    this.latest.set(metric, state);
    const set = this.subscriptions.get(metric);
    if (!set) return;
    for (const s of set) s.listener(state);
  }
}

export const metricsSocket = new MetricsSocket();
