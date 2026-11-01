import type { FrameContext } from './Protocol';

export type Unsubscribe = () => void;
export type MetricName = 'cpu' | 'memory' | 'disks' | 'network' | 'temperatures' | 'uptime' | 'dockerCount' | 'processes';
export type WidgetSize = 's' | 'm' | 'l';
export type LogSource = { source: 'docker'; containerId: string; tail?: number; follow?: boolean } | { source: 'journal'; unit: string | null; lines?: number; follow?: boolean } | { source: 'file'; path: string; follow?: boolean };
export type ThemeTokens = { theme: 'light' | 'dark'; tokens: Record<string, string> };

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  ports: { ip: string | null; privatePort: number; publicPort: number | null; type: string }[];
  service: string | null;
  icon: string | null;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size: number;
  modifiedAt: string;
  mode: number;
  permissions: string;
  owner: number;
  group: number;
}

export interface MonitorStatus {
  target: { id: string; kind: 'http' | 'ping'; label: string; address: string; owner: string };
  state: 'up' | 'down' | 'unknown';
  checkedAt: string | null;
  latencyMs: number | null;
  reason: string | null;
  history: { at: string; up: boolean; latencyMs: number | null }[];
}

export interface ShortcutSummary {
  id: string;
  name: string;
  url: string;
  healthCheck: boolean;
}

/** `window.landscape` inside an app frame. Every call rejects with `{ code: 'permission_denied' }` when the permission is missing. */
export interface Landscape {
  /** Static facts about this frame (app id, surface, params, permissions). */
  readonly context: FrameContext;

  /** Host metrics (permission: metrics). */
  metrics: {
    subscribe<T = unknown>(metric: MetricName, intervalMs: number, listener: (sample: { at: number; data: T } | { unavailable: string }) => void): Unsubscribe;
    sample<T = unknown>(metric: MetricName): Promise<T>;
  };

  /** Containers (docker:read, docker:write). */
  docker: {
    list(): Promise<ContainerSummary[]>;
    action(containerId: string, action: 'start' | 'stop' | 'restart'): Promise<void>;
    /** Live stats stream for one container (docker:read). */
    stats(containerId: string, listener: (stats: { at: number; cpuPercent: number; memoryBytes: number; memoryLimitBytes: number; rxBytesPerSecond: number; txBytesPerSecond: number }) => void): Unsubscribe;
  };

  /** Files over SFTP (files:read, files:write). */
  files: {
    home(): Promise<string>;
    list(path: string): Promise<FileEntry[]>;
    stat(path: string): Promise<FileEntry>;
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
    mkdir(dir: string, name: string): Promise<void>;
    rename(path: string, name: string): Promise<void>;
    delete(paths: string[]): Promise<void>;
    /** Lets the user download a file (a new tab opened by the host). */
    download(path: string): Promise<void>;
  };

  /** Commands over SSH (ssh:exec). */
  ssh: { exec(command: string, timeoutMs?: number): Promise<{ stdout: string; stderr: string; code: number | null }> };

  /** Log streams (logs). */
  logs: { open(source: LogSource, listener: (message: { type: 'chunk'; text: string } | { type: 'end'; reason: string } | { type: 'error'; message: string }) => void): Unsubscribe };

  /** Host processes (metrics) and kill (ssh:exec). */
  processes: { kill(pid: number, signal: 'TERM' | 'KILL'): Promise<void> };

  /** Desktop shortcuts (shortcuts). */
  shortcuts: {
    list(): Promise<ShortcutSummary[]>;
    create(input: { name: string; url: string }): Promise<ShortcutSummary>;
  };

  /** Notifications (notifications). */
  notifications: { notify(input: { title: string; body?: string; level?: 'info' | 'warning' | 'error'; data?: Record<string, unknown> }): Promise<void> };

  /** Per-app key/value storage in LANdscape's database (storage). Values are JSON. */
  storage: {
    get<T = unknown>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    list(prefix?: string): Promise<string[]>;
  };

  /** Server-side fetch limited to the manifest's hosts, or any host when trusted (net:fetch). */
  net: {
    fetch(url: string, init?: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; headers?: Record<string, string>; body?: string }): Promise<{ status: number; headers: Record<string, string>; body: string }>;
  };

  /** Service monitor (monitor). Target ids are prefixed with the app id by the host. */
  monitor: {
    register(target: { key: string; kind: 'http' | 'ping'; label: string; address: string }): Promise<MonitorStatus>;
    unregister(key: string): Promise<void>;
    statuses(): Promise<MonitorStatus[]>;
    subscribe(listener: (status: MonitorStatus) => void): Unsubscribe;
  };

  /** Actions of LANdscape and other apps (actions:invoke). */
  actions: {
    invoke(id: string, params?: Record<string, unknown>): Promise<void>;
    /** Handles this app's own actions (declared in the manifest) when they run; no permission needed. */
    handle(id: string, handler: (params: Record<string, unknown>) => void | Promise<void>): Unsubscribe;
  };

  /** Theme and tokens (theme:read). */
  theme: {
    current(): ThemeTokens;
    subscribe(listener: (theme: ThemeTokens) => void): Unsubscribe;
    /** Applies the host tokens as CSS custom properties on this frame's :root (call once at start). */
    apply(): void;
  };

  /** This frame and its window (no permission). */
  ui: {
    setTitle(title: string): void;
    toast(message: string, kind?: 'info' | 'success' | 'error'): void;
    openWindow(windowId?: string, params?: Record<string, unknown>): void;
    close(): void;
    /** Asks the host for a confirmation dialog. */
    confirm(input: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean>;
    /** Widget frames: the host changed the widget settings or size. */
    onParams(listener: (params: Record<string, unknown>) => void): Unsubscribe;
    /** Register a guard that can block closing the window (unsaved changes). */
    onBeforeClose(guard: () => boolean | Promise<boolean>): Unsubscribe;
  };
}
