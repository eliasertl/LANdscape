import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import type { EventsServerMessage, MonitorStatus, Notification, Shortcut } from '@landscape/shared';
import { MonitorService, checkPing } from '@server/Monitor/MonitorService';
import { ThresholdTracker, Watchers } from '@server/Notify/Watchers';
import { NotificationService } from '@server/Notify/NotificationService';
import { EventBus } from '@server/Events/EventBus';
import { Database } from '@server/Db/Database';
import { createRepositories } from '@server/Db/Repositories';
import { createTestApp, loginCookie, type TestApp } from './TestApp';

const sameOrigin = { origin: 'http://localhost', host: 'localhost' };
const silentLog = { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {}, child() { return silentLog; }, level: 'silent' } as never;

function services() {
  const db = new Database(':memory:');
  const repos = createRepositories(db);
  const events = new EventBus();
  const received: EventsServerMessage[] = [];
  events.subscribe((m) => received.push(m));
  const notifications = new NotificationService(repos.notifications, events, silentLog);
  return { db, repos, events, received, notifications };
}

describe('threshold tracker', () => {
  it('fires once when a value crosses and re-arms after it drops below the hysteresis band', () => {
    const tracker = new ThresholdTracker();
    expect(tracker.update({ '/': 85 }, 90)).toEqual([]);
    expect(tracker.update({ '/': 91 }, 90)).toEqual(['/']);
    expect(tracker.update({ '/': 95 }, 90)).toEqual([]);
    expect(tracker.update({ '/': 88 }, 90)).toEqual([]); // still within 5 of the limit
    expect(tracker.update({ '/': 84 }, 90)).toEqual([]);
    expect(tracker.update({ '/': 92 }, 90)).toEqual(['/']);
  });
});

describe('watchers', () => {
  it('turns Docker die/oom/stop events into notifications, honouring the setting', () => {
    const { repos, notifications, received } = services();
    let docker = true;
    const watchers = new Watchers({
      docker: { available: false } as never,
      metrics: { sampleNow: async () => ({ available: false, reason: 'no' }) } as never,
      notifications,
      settings: () => ({ ...repos.settings.get().notifications, watchers: { ...repos.settings.get().notifications.watchers, docker } }),
      log: silentLog,
    });
    watchers.onDockerEvent(JSON.stringify({ Action: 'die', Actor: { ID: 'abc', Attributes: { name: 'plex', exitCode: '137' } } }));
    watchers.onDockerEvent(JSON.stringify({ Action: 'die', Actor: { ID: 'abc', Attributes: { name: 'plex', exitCode: '0' } } })); // clean exit: no notification
    watchers.onDockerEvent(JSON.stringify({ Action: 'oom', Actor: { ID: 'abc', Attributes: { name: 'plex' } } }));
    watchers.onDockerEvent(JSON.stringify({ Action: 'stop', Actor: { ID: 'abc', Attributes: { name: 'plex' } } }));
    watchers.onDockerEvent('not json');
    docker = false;
    watchers.onDockerEvent(JSON.stringify({ Action: 'stop', Actor: { ID: 'abc', Attributes: { name: 'plex' } } }));
    const titles = received.filter((m) => m.type === 'notification').map((m) => (m as { notification: Notification }).notification.title);
    expect(titles).toEqual(['plex died', 'plex ran out of memory', 'plex stopped']);
    expect(notifications.list()[0]).toMatchObject({ source: 'docker', level: 'warning', title: 'plex stopped' });
  });

  it('notifies on disk and temperature thresholds from the metrics hub', async () => {
    const { repos, notifications, received } = services();
    repos.settings.update({ notifications: { watchers: { disk: { percent: 80 }, temperature: { celsius: 70 } } } });
    const watchers = new Watchers({
      docker: { available: false } as never,
      metrics: {
        sampleNow: async (metric: string) =>
          metric === 'disks'
            ? { available: true, data: { usageSource: 'hostRoot', disks: [{ device: 'sda1', mountPoint: '/', fsType: 'ext4', totalBytes: 100, usedBytes: 85, freeBytes: 15 }] } }
            : { available: true, data: { sensors: [{ sensor: 'cpu', label: 'CPU', celsius: 75, max: null, critical: null }] } },
      } as never,
      notifications,
      settings: () => repos.settings.get().notifications,
      log: silentLog,
    });
    await watchers.checkThresholds();
    await watchers.checkThresholds(); // no repeat while still above
    const titles = received.filter((m) => m.type === 'notification').map((m) => (m as { notification: Notification }).notification.title);
    expect(titles).toEqual(['Disk / is 85 % full', 'CPU is at 75 °C']);
    expect(notifications.unreadCount()).toBe(2);
  });
});

describe('monitor service', () => {
  it('checks shortcut and app targets, keeps history, and notifies on state changes only', async () => {
    const { repos, events, notifications, received } = services();
    const shortcut = repos.shortcuts.create({
      name: 'Plex',
      url: 'http://plex.lan/',
      iconMode: 'upload',
      iconFile: null,
      position: { anchorX: 'left', anchorY: 'top', offsetCol: 0, offsetRow: 0 },
      folderId: null,
      embeddable: 'unknown',
      embedReason: null,
      openMode: 'auto',
    });
    repos.shortcuts.create({ name: 'Skipped', url: 'http://skip.lan/', iconMode: 'upload', iconFile: null, position: { anchorX: 'left', anchorY: 'top', offsetCol: 1, offsetRow: 0 }, folderId: null, embeddable: 'unknown', embedReason: null, openMode: 'auto', healthCheck: false });
    let up = true;
    const monitor = new MonitorService({
      repos,
      events,
      notifications,
      log: silentLog,
      intervalSeconds: () => 60,
      notifyOnChange: () => true,
      check: async () => (up ? { up: true, latencyMs: 12, reason: null } : { up: false, latencyMs: null, reason: 'ECONNREFUSED' }),
    });
    monitor.register({ id: 'uptime:nas', kind: 'ping', label: 'NAS', address: '192.168.1.5:445', owner: 'uptime' });
    expect(monitor.targets().map((t) => t.id)).toEqual([`shortcut:${shortcut.id}`, 'uptime:nas']);

    await monitor.checkAll();
    expect(monitor.statusOf(`shortcut:${shortcut.id}`)).toMatchObject({ state: 'up', latencyMs: 12 });
    // unknown → up is not a notification.
    expect(received.filter((m) => m.type === 'notification')).toHaveLength(0);
    expect(received.filter((m) => m.type === 'monitor-status')).toHaveLength(2);

    up = false;
    await monitor.checkAll();
    await monitor.checkAll(); // still down: no second notification
    const downs = received.filter((m) => m.type === 'notification').map((m) => (m as { notification: Notification }).notification);
    expect(downs.map((n) => n.title).sort()).toEqual(['NAS is down', 'Plex is down']);
    expect(downs[0]).toMatchObject({ source: 'monitor', level: 'error' });
    up = true;
    await monitor.checkAll();
    expect(received.filter((m) => m.type === 'notification').map((m) => (m as { notification: Notification }).notification.title)).toContain('Plex is back');
    expect(monitor.statusOf('uptime:nas')?.history).toHaveLength(4);

    expect(monitor.unregister('uptime:nas')).toBe(true);
    expect(monitor.unregister('uptime:nas')).toBe(false);
    expect(monitor.statuses().map((s) => s.target.id)).toEqual([`shortcut:${shortcut.id}`]);
  });

  it('pings by TCP connect', async () => {
    const { createServer } = await import('node:net');
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    expect((await checkPing(`127.0.0.1:${port}`)).up).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect((await checkPing(`127.0.0.1:${port}`)).up).toBe(false);
    expect((await checkPing('nonsense')).reason).toBe('Use host:port');
  });
});

describe('notifications and monitor API', () => {
  let app: TestApp;
  let cookie: string;
  const call = (method: 'GET' | 'POST' | 'DELETE' | 'PATCH', url: string, payload?: unknown) =>
    app.app.inject({ method, url, headers: { ...sameOrigin, cookie }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });

  beforeEach(async () => {
    app = await createTestApp();
    cookie = await loginCookie(app);
  });
  afterEach(async () => {
    await app.cleanup();
  });

  it('creates, lists, reads and clears notifications and pushes them over /ws/events', async () => {
    await app.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.app.server.address() as AddressInfo).port;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/events`, { headers: { cookie, origin: `http://127.0.0.1:${port}` } });
    const messages: EventsServerMessage[] = [];
    socket.on('message', (data: Buffer) => messages.push(JSON.parse(data.toString('utf8')) as EventsServerMessage));
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });

    const created = await call('POST', '/api/notifications', { title: 'Test', body: 'Hello', level: 'info' });
    expect(created.statusCode).toBe(201);
    const notification = created.json<Notification>();
    expect(notification).toMatchObject({ source: 'test', title: 'Test', readAt: null });
    expect((await call('POST', '/api/notifications', { title: 'x', source: 'evil' })).statusCode).toBe(400);
    const list = (await call('GET', '/api/notifications')).json<{ notifications: Notification[]; unread: number }>();
    expect(list.unread).toBe(1);
    expect((await call('POST', '/api/notifications/read', { ids: [notification.id] })).json()).toMatchObject({ changed: 1 });
    expect((await call('GET', '/api/notifications')).json<{ unread: number }>().unread).toBe(0);
    expect((await call('DELETE', '/api/notifications')).json()).toMatchObject({ removed: 1 });
    await new Promise((r) => setTimeout(r, 100));
    expect(messages.map((m) => m.type)).toEqual(['notification', 'notifications-read', 'notifications-cleared']);
    socket.close();

    // No session or a foreign origin: refused.
    const anonymous = new WebSocket(`ws://127.0.0.1:${port}/ws/events`, { headers: { origin: `http://127.0.0.1:${port}` } });
    const status = await new Promise<number>((resolve) => {
      anonymous.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      anonymous.on('error', () => undefined);
    });
    expect(status).toBe(401);
  });

  it('exposes monitor statuses, registers app targets and lets shortcuts opt out', async () => {
    const shortcut = (await call('POST', '/api/shortcuts', { name: 'Svc', url: 'http://127.0.0.1:9/', iconMode: 'upload' })).json<Shortcut>();
    expect(shortcut.healthCheck).toBe(true);
    let statuses = (await call('GET', '/api/monitor')).json<{ intervalSeconds: number; statuses: MonitorStatus[] }>();
    expect(statuses.intervalSeconds).toBe(60);
    expect(statuses.statuses.map((s) => s.target.id)).toContain(`shortcut:${shortcut.id}`);
    const registered = await call('POST', '/api/monitor/targets', { id: 'uptime:nas', kind: 'ping', label: 'NAS', address: '127.0.0.1:1', owner: 'uptime' });
    expect(registered.statusCode).toBe(201);
    expect((await call('POST', '/api/monitor/targets', { id: 'bad id', kind: 'ping', label: 'x', address: 'x', owner: 'u' })).statusCode).toBe(400);
    const checked = (await call('POST', '/api/monitor/check')).json<{ statuses: MonitorStatus[] }>();
    expect(checked.statuses.find((s) => s.target.id === 'uptime:nas')?.state).toBe('down');
    expect((await call('GET', '/api/monitor/uptime:nas/history')).json<MonitorStatus>().history).toHaveLength(1);
    await call('PATCH', `/api/shortcuts/${shortcut.id}`, { healthCheck: false });
    statuses = (await call('GET', '/api/monitor')).json<{ intervalSeconds: number; statuses: MonitorStatus[] }>();
    expect(statuses.statuses.map((s) => s.target.id)).not.toContain(`shortcut:${shortcut.id}`);
    expect((await call('DELETE', '/api/monitor/targets/uptime:nas')).statusCode).toBe(200);
    expect((await call('GET', '/api/monitor/uptime:nas/history')).statusCode).toBe(404);
  });
});
