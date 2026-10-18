import type { MetricName, MetricPayloads, MetricsServerMessage } from '@landscape/shared';

export type MetricResult<K extends MetricName = MetricName> =
  | { available: true; data: MetricPayloads[K] }
  | { available: false; reason: string };

export type Sampler<K extends MetricName = MetricName> = () => Promise<MetricResult<K>>;

export interface Subscriber {
  subscribe(metric: MetricName, intervalMs: number): void;
  unsubscribe(metric: MetricName): void;
  dispose(): void;
}

interface Subscription {
  intervalMs: number;
  lastSentAt: number;
  send: (message: MetricsServerMessage) => void;
}

interface MetricState {
  timer: NodeJS.Timeout | null;
  intervalMs: number;
  subscriptions: Set<Subscription>;
  sampling: boolean;
  last: { at: number; result: MetricResult } | null;
}

/**
 * Shares metric sampling between all WebSocket subscribers. Each metric is
 * sampled at the fastest interval anyone asked for; every subscriber receives
 * a sample only when its own interval has elapsed.
 */
export class MetricsHub {
  private readonly samplers = new Map<MetricName, Sampler>();
  private readonly states = new Map<MetricName, MetricState>();

  register<K extends MetricName>(metric: K, sampler: Sampler<K>): void {
    this.samplers.set(metric, sampler as Sampler);
  }

  addSubscriber(send: (message: MetricsServerMessage) => void): Subscriber {
    const own = new Map<MetricName, Subscription>();
    return {
      subscribe: (metric, intervalMs) => {
        const existing = own.get(metric);
        if (existing) {
          existing.intervalMs = intervalMs;
          this.reschedule(metric);
          return;
        }
        const subscription: Subscription = { intervalMs, lastSentAt: 0, send };
        own.set(metric, subscription);
        this.attach(metric, subscription);
      },
      unsubscribe: (metric) => {
        const subscription = own.get(metric);
        if (!subscription) return;
        own.delete(metric);
        this.detach(metric, subscription);
      },
      dispose: () => {
        for (const [metric, subscription] of own) this.detach(metric, subscription);
        own.clear();
      },
    };
  }

  /** Samples once on demand (used by HTTP routes and the status check). */
  async sampleNow<K extends MetricName>(metric: K): Promise<MetricResult<K>> {
    const sampler = this.samplers.get(metric) as Sampler<K> | undefined;
    if (!sampler) return { available: false, reason: `Unknown metric ${metric}` };
    try {
      return await sampler();
    } catch (error) {
      return { available: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  stop(): void {
    for (const state of this.states.values()) {
      if (state.timer) clearInterval(state.timer);
      state.timer = null;
    }
    this.states.clear();
  }

  private attach(metric: MetricName, subscription: Subscription): void {
    let state = this.states.get(metric);
    if (!state) {
      state = { timer: null, intervalMs: subscription.intervalMs, subscriptions: new Set(), sampling: false, last: null };
      this.states.set(metric, state);
    }
    state.subscriptions.add(subscription);
    // Deliver the latest known sample immediately so widgets do not start empty.
    if (state.last && Date.now() - state.last.at < state.intervalMs * 2) {
      this.deliver(metric, subscription, state.last.at, state.last.result);
    } else {
      void this.sample(metric);
    }
    this.reschedule(metric);
  }

  private detach(metric: MetricName, subscription: Subscription): void {
    const state = this.states.get(metric);
    if (!state) return;
    state.subscriptions.delete(subscription);
    if (state.subscriptions.size === 0) {
      if (state.timer) clearInterval(state.timer);
      this.states.delete(metric);
      return;
    }
    this.reschedule(metric);
  }

  private reschedule(metric: MetricName): void {
    const state = this.states.get(metric);
    if (!state) return;
    let fastest = Number.POSITIVE_INFINITY;
    for (const s of state.subscriptions) fastest = Math.min(fastest, s.intervalMs);
    if (!Number.isFinite(fastest)) return;
    if (state.timer && state.intervalMs === fastest) return;
    if (state.timer) clearInterval(state.timer);
    state.intervalMs = fastest;
    state.timer = setInterval(() => void this.sample(metric), fastest);
    state.timer.unref();
  }

  private async sample(metric: MetricName): Promise<void> {
    const state = this.states.get(metric);
    if (!state || state.sampling) return;
    state.sampling = true;
    try {
      const result = await this.sampleNow(metric);
      const at = Date.now();
      state.last = { at, result };
      for (const subscription of state.subscriptions) {
        // Allow a little slack so a 2000 ms subscriber on a 2000 ms timer is not skipped by jitter.
        if (at - subscription.lastSentAt >= subscription.intervalMs * 0.9) {
          this.deliver(metric, subscription, at, result);
        }
      }
    } finally {
      state.sampling = false;
    }
  }

  private deliver(metric: MetricName, subscription: Subscription, at: number, result: MetricResult): void {
    subscription.lastSentAt = at;
    if (result.available) subscription.send({ type: 'sample', metric, at, data: result.data });
    else subscription.send({ type: 'unavailable', metric, reason: result.reason });
  }
}
