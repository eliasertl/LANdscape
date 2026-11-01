import type { FastifyBaseLogger } from 'fastify';
import type { Settings } from '@landscape/shared';
import type { DockerClient } from '../Docker/Client';
import type { MetricsHub } from '../Metrics/Hub';
import type { NotificationService } from './NotificationService';

/** How often disk usage and temperatures are compared with the thresholds. */
const THRESHOLD_INTERVAL_MS = 60_000;

/** Decides whether a threshold watcher fires: once when a value crosses, again only after it dropped below (hysteresis of 5). */
export class ThresholdTracker {
  private readonly above = new Set<string>();

  /** Returns the keys that just crossed `limit` (and arms the others again when they fall under limit - 5). */
  update(values: Record<string, number>, limit: number): string[] {
    const fired: string[] = [];
    for (const [key, value] of Object.entries(values)) {
      if (value >= limit) {
        if (!this.above.has(key)) {
          this.above.add(key);
          fired.push(key);
        }
      } else if (value < limit - 5) {
        this.above.delete(key);
      }
    }
    return fired;
  }
}

/**
 * Server-side watchers that run while no browser is open: Docker container
 * events (stop, die, OOM), disk usage and temperatures above their
 * thresholds. Settings → Notifications switches each one on or off.
 */
export class Watchers {
  private timer: NodeJS.Timeout | null = null;
  private dockerStream: NodeJS.ReadableStream | null = null;
  private readonly disks = new ThresholdTracker();
  private readonly temperatures = new ThresholdTracker();

  constructor(
    private readonly deps: {
      docker: DockerClient;
      metrics: MetricsHub;
      notifications: NotificationService;
      settings: () => Settings['notifications'];
      log: FastifyBaseLogger;
    },
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.checkThresholds(), THRESHOLD_INTERVAL_MS);
    this.timer.unref();
    void this.watchDocker();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const stream = this.dockerStream as (NodeJS.ReadableStream & { destroy?: () => void }) | null;
    stream?.destroy?.();
    this.dockerStream = null;
  }

  /** Compares the latest disk and temperature samples with the thresholds; public for tests. */
  async checkThresholds(): Promise<void> {
    const settings = this.deps.settings();
    if (settings.watchers.disk.enabled) {
      const disks = await this.deps.metrics.sampleNow('disks');
      if (disks.available) {
        const values: Record<string, number> = {};
        for (const disk of disks.data.disks) {
          if (disk.totalBytes && disk.usedBytes !== null) values[disk.mountPoint] = Math.round((disk.usedBytes / disk.totalBytes) * 100);
        }
        for (const mount of this.disks.update(values, settings.watchers.disk.percent)) {
          this.deps.notifications.notify({ source: 'disk', level: 'warning', title: `Disk ${mount} is ${values[mount]} % full`, body: `Above the ${settings.watchers.disk.percent} % threshold from Settings → Notifications.`, data: { mountPoint: mount, percent: values[mount] } });
        }
      }
    }
    if (settings.watchers.temperature.enabled) {
      const temps = await this.deps.metrics.sampleNow('temperatures');
      if (temps.available) {
        const values: Record<string, number> = {};
        for (const sensor of temps.data.sensors) values[sensor.label] = sensor.celsius;
        for (const label of this.temperatures.update(values, settings.watchers.temperature.celsius)) {
          this.deps.notifications.notify({ source: 'temperature', level: 'warning', title: `${label} is at ${Math.round(values[label] ?? 0)} °C`, body: `Above the ${settings.watchers.temperature.celsius} °C threshold from Settings → Notifications.`, data: { sensor: label, celsius: values[label] } });
        }
      }
    }
  }

  /** Follows the Docker event stream; reconnects with a delay when it ends. */
  private async watchDocker(): Promise<void> {
    if (!this.deps.docker.available) return;
    try {
      const stream = await this.deps.docker.docker.getEvents({ filters: { type: ['container'], event: ['die', 'stop', 'oom', 'start'] } });
      this.dockerStream = stream;
      let buffer = '';
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        let index = buffer.indexOf('\n');
        while (index >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (line) this.onDockerEvent(line);
          index = buffer.indexOf('\n');
        }
      });
      stream.on('end', () => this.reconnectDocker());
      stream.on('error', () => this.reconnectDocker());
    } catch (error) {
      this.deps.log.debug({ err: error }, 'Docker event stream not available');
      this.reconnectDocker();
    }
  }

  private reconnectDocker(): void {
    this.dockerStream = null;
    if (!this.timer) return;
    const retry = setTimeout(() => void this.watchDocker(), 30_000);
    retry.unref();
  }

  /** Public for tests: one JSON line from the Docker event stream. */
  onDockerEvent(line: string): void {
    if (!this.deps.settings().watchers.docker) return;
    let event: { Action?: string; Actor?: { Attributes?: Record<string, string>; ID?: string }; status?: string };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      return;
    }
    const action = event.Action ?? event.status ?? '';
    const name = event.Actor?.Attributes?.name ?? event.Actor?.ID?.slice(0, 12) ?? 'container';
    const exitCode = event.Actor?.Attributes?.exitCode;
    if (action === 'die' && exitCode !== undefined && exitCode !== '0') {
      this.deps.notifications.notify({ source: 'docker', level: 'error', title: `${name} died`, body: `Exit code ${exitCode}.`, data: { container: event.Actor?.ID, action, exitCode } });
    } else if (action === 'oom') {
      this.deps.notifications.notify({ source: 'docker', level: 'error', title: `${name} ran out of memory`, body: 'The container was OOM-killed.', data: { container: event.Actor?.ID, action } });
    } else if (action === 'stop') {
      this.deps.notifications.notify({ source: 'docker', level: 'warning', title: `${name} stopped`, body: '', data: { container: event.Actor?.ID, action } });
    }
  }
}
