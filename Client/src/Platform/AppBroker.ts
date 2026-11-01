import { z } from 'zod';
import { isAllowed, type InstalledApp, type MonitorStatus, type Permission } from '@landscape/shared';
import { api } from '../Api/Http';
import { metricsSocket } from '../Api/MetricsSocket';
import { eventsSocket } from '../Api/EventsSocket';
import { wsUrl } from '../Api/Http';
import { runAction } from './Actions';
import { toast } from '../Components/Toast';
import { confirmAsync } from '../Store/UiStore';
import { currentThemeTokens } from '../Design/ThemeTokens';

/**
 * The host side of the app RPC (Sdk/src/Protocol.ts). Every app surface is
 * an iframe with `sandbox="allow-scripts"`: it has an opaque origin, no
 * cookie and no network. All it can do is postMessage to this broker, which
 * checks the frame's nonce and the app's granted permissions on every call
 * and forwards to the REST and WebSocket API. See Docs/AppPlatform.md.
 */
export interface FrameHost {
  app: InstalledApp;
  surface: string;
  surfaceId: string;
  nonce: string;
  window: Window;
  /** Surface-specific calls (window title, close, params). */
  ui: {
    setTitle?: (title: string) => void;
    close?: () => void;
    openWindow?: (windowId: string, params: Record<string, unknown>) => void;
  };
}

const requestSchema = z.object({ landscape: z.literal(1), nonce: z.string().min(8).max(64), id: z.number().int().min(0), method: z.string().min(1).max(64), params: z.unknown() });

interface FrameState {
  host: FrameHost;
  ready: boolean;
  queued: { event: string; data: unknown }[];
  subscriptions: Map<string, () => void>;
  nextSubscription: number;
  closeDecisions: Map<number, (allow: boolean) => void>;
  actionDone: Map<number, (error?: string) => void>;
}

class BrokerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const frames = new Map<Window, FrameState>();
let installed = false;
let nextToken = 1;

function appHeaders(app: InstalledApp): Record<string, string> {
  return { 'x-landscape-app': app.id };
}

/** Registers a frame; call when the iframe mounts. Returns the unregister function. */
export function registerFrame(host: FrameHost): () => void {
  installBroker();
  const state: FrameState = { host, ready: false, queued: [], subscriptions: new Map(), nextSubscription: 1, closeDecisions: new Map(), actionDone: new Map() };
  frames.set(host.window, state);
  return () => {
    for (const off of state.subscriptions.values()) off();
    frames.delete(host.window);
  };
}

export function frameForWindow(target: Window): FrameHost | null {
  return frames.get(target)?.host ?? null;
}

/** Sends an event to a frame (queued until its SDK reported ready). */
export function sendFrameEvent(target: Window, event: string, data: unknown): void {
  const state = frames.get(target);
  if (!state) return;
  if (!state.ready) {
    state.queued.push({ event, data });
    return;
  }
  state.host.window.postMessage({ landscape: 1, event, data }, '*');
}

/** Asks a frame whether its window may close (SDK onBeforeClose guards); resolves true without guards. */
export function askFrameBeforeClose(target: Window): Promise<boolean> {
  const state = frames.get(target);
  if (!state || !state.ready) return Promise.resolve(true);
  return new Promise((resolve) => {
    const token = nextToken++;
    state.closeDecisions.set(token, resolve);
    window.setTimeout(() => {
      if (state.closeDecisions.delete(token)) resolve(true);
    }, 5000);
    sendFrameEvent(target, 'window.beforeClose', { token });
  });
}

/** Runs one of the app's own actions inside a frame (the background page or an open window). */
export function runFrameAction(target: Window, actionId: string, params: Record<string, unknown>): Promise<void> {
  const state = frames.get(target);
  if (!state) return Promise.reject(new Error('The app is not running'));
  return new Promise((resolve, reject) => {
    const token = nextToken++;
    state.actionDone.set(token, (error) => (error ? reject(new Error(error)) : resolve()));
    window.setTimeout(() => {
      if (state.actionDone.delete(token)) reject(new Error('The app did not finish the action in time'));
    }, 60_000);
    sendFrameEvent(target, 'action.run', { id: actionId, params, token });
  });
}

/** Broadcasts theme changes to every frame. */
export function broadcastTheme(): void {
  const data = currentThemeTokens();
  for (const [target] of frames) sendFrameEvent(target, 'theme.changed', data);
}

function need(app: InstalledApp, permission: Permission): void {
  if (!isAllowed(app.granted, app.trusted, permission)) throw new BrokerError('permission_denied', `${app.manifest.name} does not have the ${permission} permission`);
}

const str = (v: unknown, max = 4096) => z.string().max(max).parse(v);
const obj = (v: unknown) => z.record(z.string(), z.unknown()).parse(v ?? {});

async function handle(state: FrameState, method: string, params: unknown): Promise<unknown> {
  const { host } = state;
  const app = host.app;
  const p = obj(params);
  const headers = appHeaders(app);
  switch (method) {
    case 'frame.ready': {
      state.ready = true;
      // The server does not know this browser's theme; hand the live tokens over before anything else.
      host.window.postMessage({ landscape: 1, event: 'theme.changed', data: currentThemeTokens() }, '*');
      for (const event of state.queued) host.window.postMessage({ landscape: 1, event: event.event, data: event.data }, '*');
      state.queued = [];
      return true;
    }
    // ---- metrics -------------------------------------------------------------
    case 'metrics.subscribe': {
      need(app, 'metrics');
      const { metric, intervalMs } = z.object({ metric: z.enum(['cpu', 'memory', 'disks', 'network', 'temperatures', 'uptime', 'dockerCount', 'processes']), intervalMs: z.number().int().min(500).max(600000) }).parse(p);
      const id = String(state.nextSubscription++);
      const off = metricsSocket.subscribe(metric, intervalMs, (sample) => {
        if (sample.status === 'ok') sendFrameEvent(host.window, `metrics:${id}`, { at: sample.at, data: sample.data });
        else if (sample.status === 'unavailable') sendFrameEvent(host.window, `metrics:${id}`, { unavailable: sample.reason });
      });
      state.subscriptions.set(`metrics:${id}`, off);
      return id;
    }
    case 'metrics.unsubscribe':
      state.subscriptions.get(`metrics:${str(p.id)}`)?.();
      state.subscriptions.delete(`metrics:${str(p.id)}`);
      return true;
    case 'metrics.sample': {
      need(app, 'metrics');
      const metric = z.enum(['cpu', 'memory', 'disks', 'network', 'temperatures', 'uptime', 'dockerCount', 'processes']).parse(p.metric);
      return new Promise((resolve, reject) => {
        const off = metricsSocket.subscribe(metric, 1000, (sample) => {
          if (sample.status === 'waiting') return;
          off();
          if (sample.status === 'ok') resolve(sample.data);
          else reject(new BrokerError('unavailable', sample.reason));
        });
      });
    }
    // ---- docker --------------------------------------------------------------
    case 'docker.list':
      need(app, 'docker:read');
      return api.get('/api/docker/containers');
    case 'docker.action': {
      need(app, 'docker:write');
      const { containerId, action } = z.object({ containerId: z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/), action: z.enum(['start', 'stop', 'restart']) }).parse(p);
      await api.post(`/api/docker/containers/${containerId}/${action}`);
      return true;
    }
    case 'docker.stats.subscribe': {
      need(app, 'docker:read');
      const { containerId } = z.object({ containerId: z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/) }).parse(p);
      const id = String(state.nextSubscription++);
      const socket = new WebSocket(wsUrl(`/ws/docker-stats?container=${encodeURIComponent(containerId)}`));
      socket.addEventListener('message', (event) => {
        try {
          sendFrameEvent(host.window, `docker.stats:${id}`, JSON.parse(String(event.data)));
        } catch {
          // ignore
        }
      });
      state.subscriptions.set(`docker.stats:${id}`, () => socket.close());
      return id;
    }
    case 'docker.stats.unsubscribe':
      state.subscriptions.get(`docker.stats:${str(p.id)}`)?.();
      state.subscriptions.delete(`docker.stats:${str(p.id)}`);
      return true;
    // ---- files ---------------------------------------------------------------
    case 'files.home':
      need(app, 'files:read');
      return (await api.get<{ path: string }>('/api/files/home')).path;
    case 'files.list':
      need(app, 'files:read');
      return (await api.get<{ entries: unknown[] }>(`/api/files/list?path=${encodeURIComponent(str(p.path))}`)).entries;
    case 'files.stat':
      need(app, 'files:read');
      return api.get(`/api/files/stat?path=${encodeURIComponent(str(p.path))}`);
    case 'files.read':
      need(app, 'files:read');
      return (await api.get<{ content: string }>(`/api/files/read?path=${encodeURIComponent(str(p.path))}`)).content;
    case 'files.write':
      need(app, 'files:write');
      await api.put('/api/files/write', { path: str(p.path), content: str(p.content, 2 * 1024 * 1024) });
      return true;
    case 'files.mkdir':
      need(app, 'files:write');
      await api.post('/api/files/mkdir', { dir: str(p.dir), name: str(p.name, 255) });
      return true;
    case 'files.rename':
      need(app, 'files:write');
      await api.post('/api/files/rename', { path: str(p.path), name: str(p.name, 255) });
      return true;
    case 'files.delete':
      need(app, 'files:write');
      await api.post('/api/files/delete', { paths: z.array(z.string().max(4096)).max(500).parse(p.paths) });
      return true;
    case 'files.download':
      need(app, 'files:read');
      window.open(`/api/files/download?path=${encodeURIComponent(str(p.path))}`, '_blank', 'noopener');
      return true;
    // ---- ssh, processes, logs ----------------------------------------------------
    case 'ssh.exec': {
      need(app, 'ssh:exec');
      const input = z.object({ command: z.string().min(1).max(4096), timeoutMs: z.number().int().min(1000).max(120000).optional() }).parse(p);
      return api.post('/api/ssh/exec', input, { headers });
    }
    case 'processes.kill':
      need(app, 'ssh:exec');
      await api.post(`/api/processes/${z.number().int().min(1).parse(p.pid)}/kill`, { signal: z.enum(['TERM', 'KILL']).parse(p.signal) });
      return true;
    case 'logs.subscribe': {
      need(app, 'logs');
      const id = String(state.nextSubscription++);
      const socket = new WebSocket(wsUrl('/ws/logs'));
      socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'open', ...obj(params) })));
      socket.addEventListener('message', (event) => {
        try {
          sendFrameEvent(host.window, `logs:${id}`, JSON.parse(String(event.data)));
        } catch {
          // ignore
        }
      });
      socket.addEventListener('close', () => sendFrameEvent(host.window, `logs:${id}`, { type: 'end', reason: 'closed' }));
      state.subscriptions.set(`logs:${id}`, () => socket.close());
      return id;
    }
    case 'logs.unsubscribe':
      state.subscriptions.get(`logs:${str(p.id)}`)?.();
      state.subscriptions.delete(`logs:${str(p.id)}`);
      return true;
    // ---- shortcuts, notifications, storage, net, monitor ------------------------------
    case 'shortcuts.list':
      need(app, 'shortcuts');
      return (await api.get<{ id: string; name: string; url: string; healthCheck: boolean }[]>('/api/shortcuts')).map((s) => ({ id: s.id, name: s.name, url: s.url, healthCheck: s.healthCheck }));
    case 'shortcuts.create': {
      need(app, 'shortcuts');
      const input = z.object({ name: z.string().min(1).max(64), url: z.string().url().max(2048) }).parse(p);
      const created = await api.post<{ id: string; name: string; url: string; healthCheck: boolean }>('/api/shortcuts', { ...input, iconMode: 'favicon' });
      return { id: created.id, name: created.name, url: created.url, healthCheck: created.healthCheck };
    }
    case 'notifications.notify': {
      need(app, 'notifications');
      const input = z.object({ title: z.string().min(1).max(120), body: z.string().max(1000).optional(), level: z.enum(['info', 'warning', 'error']).optional(), data: z.record(z.string(), z.unknown()).optional() }).parse(p);
      await api.post('/api/notifications', { ...input, source: `app:${app.id}` });
      return true;
    }
    case 'storage.get':
      need(app, 'storage');
      return (await api.get<{ value: unknown }>(`/api/apps/${app.id}/storage/${encodeURIComponent(str(p.key, 128))}`)).value;
    case 'storage.set':
      need(app, 'storage');
      await api.put(`/api/apps/${app.id}/storage/${encodeURIComponent(str(p.key, 128))}`, { value: p.value ?? null });
      return true;
    case 'storage.delete':
      need(app, 'storage');
      await api.delete(`/api/apps/${app.id}/storage/${encodeURIComponent(str(p.key, 128))}`);
      return true;
    case 'storage.list':
      need(app, 'storage');
      return (await api.get<{ keys: string[] }>(`/api/apps/${app.id}/storage?prefix=${encodeURIComponent(str(p.prefix ?? '', 128))}`)).keys;
    case 'net.fetch': {
      need(app, 'net:fetch');
      const input = z.object({ url: z.string().url().max(2048), method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(), headers: z.record(z.string(), z.string()).optional(), body: z.string().max(1024 * 1024).optional() }).parse(p);
      return api.post(`/api/apps/${app.id}/fetch`, input);
    }
    case 'monitor.register': {
      need(app, 'monitor');
      const input = z.object({ key: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), kind: z.enum(['http', 'ping']), label: z.string().min(1).max(80), address: z.string().min(1).max(2048) }).parse(p);
      return api.post('/api/monitor/targets', { id: `${app.id}:${input.key}`, kind: input.kind, label: input.label, address: input.address, owner: app.id });
    }
    case 'monitor.unregister':
      need(app, 'monitor');
      await api.delete(`/api/monitor/targets/${encodeURIComponent(`${app.id}:${z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).parse(p.key)}`)}`);
      return true;
    case 'monitor.statuses':
      need(app, 'monitor');
      return (await api.get<{ statuses: MonitorStatus[] }>('/api/monitor')).statuses;
    case 'monitor.subscribe': {
      need(app, 'monitor');
      const id = String(state.nextSubscription++);
      const off = eventsSocket.subscribe((message) => {
        if (message.type === 'monitor-status') sendFrameEvent(host.window, `monitor:${id}`, message.status);
      });
      state.subscriptions.set(`monitor:${id}`, off);
      return id;
    }
    case 'monitor.unsubscribe':
      state.subscriptions.get(`monitor:${str(p.id)}`)?.();
      state.subscriptions.delete(`monitor:${str(p.id)}`);
      return true;
    // ---- actions, theme, ui --------------------------------------------------------
    case 'actions.invoke': {
      const id = str(p.id, 100);
      // An app may always run its own actions; everything else needs actions:invoke.
      if (!id.startsWith(`${app.id}.`)) need(app, 'actions:invoke');
      await runAction(id, obj(p.params));
      return true;
    }
    case 'action.done': {
      const { token, error } = z.object({ token: z.number().int(), error: z.string().optional() }).parse(p);
      state.actionDone.get(token)?.(error);
      state.actionDone.delete(token);
      return true;
    }
    case 'window.closeDecision': {
      const { token, allow } = z.object({ token: z.number().int(), allow: z.boolean() }).parse(p);
      state.closeDecisions.get(token)?.(allow);
      state.closeDecisions.delete(token);
      return true;
    }
    case 'theme.current':
      need(app, 'theme:read');
      return currentThemeTokens();
    case 'ui.setTitle':
      host.ui.setTitle?.(str(p.title, 120));
      return true;
    case 'ui.toast': {
      const { message, kind } = z.object({ message: z.string().min(1).max(300), kind: z.enum(['info', 'success', 'error']).default('info') }).parse(p);
      toast[kind](`${app.manifest.name}: ${message}`);
      return true;
    }
    case 'ui.openWindow': {
      const { windowId, params: windowParams } = z.object({ windowId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/).default('main'), params: z.record(z.string(), z.unknown()).default({}) }).parse(p);
      host.ui.openWindow?.(windowId, windowParams);
      return true;
    }
    case 'ui.close':
      host.ui.close?.();
      return true;
    case 'ui.confirm': {
      const input = z.object({ title: z.string().min(1).max(120), message: z.string().max(600), confirmLabel: z.string().max(40).optional(), danger: z.boolean().optional() }).parse(p);
      return confirmAsync({ title: `${app.manifest.name}: ${input.title}`, message: input.message, confirmLabel: input.confirmLabel, danger: input.danger });
    }
    default:
      throw new BrokerError('unknown_method', `Unknown method ${method}`);
  }
}

function installBroker(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('message', (event: MessageEvent) => {
    // A sandboxed frame's window is a cross-origin WindowProxy: `instanceof Window` is false for it,
    // but its identity matches the iframe's contentWindow we registered.
    const source = event.source as Window | null;
    if (!source) return;
    const state = frames.get(source);
    if (!state) return;
    const parsed = requestSchema.safeParse(event.data);
    if (!parsed.success) return;
    const request = parsed.data;
    // The nonce was handed to this frame's document by the server; nobody else knows it.
    if (request.nonce !== state.host.nonce) return;
    if (request.id === 0 && request.method !== 'frame.ready') return;
    handle(state, request.method, request.params).then(
      (result) => source.postMessage({ landscape: 1, id: request.id, result: result ?? null }, '*'),
      (error: unknown) => {
        const code = error instanceof BrokerError ? error.code : error instanceof z.ZodError ? 'bad_params' : (error as { code?: string })?.code ?? 'error';
        const message = error instanceof Error ? error.message : String(error);
        source.postMessage({ landscape: 1, id: request.id, error: { code, message } }, '*');
      },
    );
  });
}
