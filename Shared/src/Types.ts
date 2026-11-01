import type { WidgetType } from './AppIds';
import type { Settings } from './Settings';
import type { AnchoredPosition } from './Layout';

export type Theme = 'light' | 'dark' | 'system';

export type IconMode = 'favicon' | 'upload';
export type Embeddable = 'yes' | 'no' | 'unknown';
/**
 * auto = follow the embed check (blocked sites go through the proxy); embed = direct iframe even if
 * the check says no; proxy = always through the LANdscape embed proxy; newtab = always open in a new tab.
 */
export type OpenMode = 'auto' | 'embed' | 'proxy' | 'newtab';
/** Whether windows opened through the embed proxy show a small badge next to the title. */
export type ProxyIndicator = 'badge' | 'none';

export interface Shortcut {
  id: string;
  name: string;
  url: string;
  iconMode: IconMode;
  /** File name inside the data directory's icons folder, or null for the generated placeholder. */
  iconFile: string | null;
  position: AnchoredPosition;
  /** Desktop folder holding this shortcut, or null when it sits on the desktop itself. */
  folderId: string | null;
  embeddable: Embeddable;
  embedCheckedAt: string | null;
  embedReason: string | null;
  openMode: OpenMode;
  /** Embed proxy port assigned to this shortcut, or null when it does not use the proxy. */
  proxyPort: number | null;
  /** Whether the monitor service checks this shortcut's URL (health dot on the icon). */
  healthCheck: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WidgetSettings {
  intervalMs: number;
  /** Per-type extra settings (e.g. selected interface for the network widget). */
  [key: string]: unknown;
}

/** Widget size step; each widget type declares the cell span per step it supports. */
export type WidgetSize = 's' | 'm' | 'l';

export interface Widget {
  id: string;
  type: WidgetType;
  position: AnchoredPosition;
  size: WidgetSize;
  settings: WidgetSettings;
  createdAt: string;
}

export interface Folder {
  id: string;
  name: string;
  position: AnchoredPosition;
  createdAt: string;
}

export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

export type WindowMemory = Record<string, WindowGeometry>;

export interface WallpaperChoice {
  kind: 'bundled' | 'upload';
  file: string;
}

export interface WallpaperInfo {
  kind: 'bundled' | 'upload';
  file: string;
  name: string;
  url: string;
}

export interface EmbedCheckResult {
  status: Embeddable;
  reason: string;
  finalUrl: string | null;
  title: string | null;
}

export interface IntegrationStatus {
  ok: boolean;
  detail: string;
  hint: string | null;
}

export interface SystemStatus {
  version: string;
  ssh: IntegrationStatus;
  docker: IntegrationStatus;
  hostProc: IntegrationStatus;
  hostSys: IntegrationStatus;
  hostRoot: IntegrationStatus;
}

export interface ProxyRange {
  start: number;
  end: number;
}

/** closed = assigned but not bound (no window uses it); the listener opens on demand. */
export type ProxyPortState = 'closed' | 'opening' | 'open' | 'error';

export interface ProxyPortStatus {
  port: number;
  shortcutId: string;
  name: string;
  /** Origin the port forwards to. */
  target: string;
  state: ProxyPortState;
  listening: boolean;
  /** Why the listener is not running, if it failed. */
  error: string | null;
  /** Short explanation of the state for Settings → Proxy ("In use by 1 window", "Idle, closes in 42 s", …). */
  reason: string;
  /** Live leases (open windows) and active connections (in-flight requests, WebSockets). */
  leases: number;
  connections: number;
  closesInMs: number | null;
}

export interface ProxyLease {
  leaseId: string;
  port: number;
  /** The lease expires this long after the last renewal. */
  ttlMs: number;
}

export interface ProxyOverview extends ProxyRange {
  total: number;
  used: number;
  ports: ProxyPortStatus[];
  /** Shortcuts that would use the proxy but got no port because the range is full. */
  waiting: { shortcutId: string; name: string }[];
}

export interface DesktopBootstrap {
  shortcuts: Shortcut[];
  widgets: Widget[];
  folders: Folder[];
  settings: Settings;
  windowMemory: WindowMemory;
  integrations: { ssh: boolean; docker: boolean; hostProc: boolean; hostSys: boolean };
  proxy: ProxyRange;
  version: string;
}

export interface SessionInfo {
  authenticated: boolean;
  /** The session exists but is locked: the API refuses calls until the password is entered again. */
  locked: boolean;
  username: string | null;
  /** Wallpaper for the lock screen (bundled wallpapers only; uploads stay private until login). */
  lockScreenWallpaper: string | null;
  /** Lock-screen look (public: the screen shows before login). */
  lockScreen: { clock: 'none' | 'digital' | 'large'; showDate: boolean; message: string; blur: number };
  /** Startup animation to play on page load (public subset; null when it does not play on load). */
  startup: Settings['startup'] | null;
}

/** One row of Settings → Lock & Security → Sessions. Ids are opaque keys, never the cookie value. */
export interface SessionSummary {
  key: string;
  device: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  locked: boolean;
  current: boolean;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  ports: { ip: string | null; privatePort: number; publicPort: number | null; type: string }[];
  /** Compose service name (com.docker.compose.service), if any. */
  service: string | null;
  /** Icon URL from a CasaOS or common icon label, if any. */
  icon: string | null;
}

export type NotificationLevel = 'info' | 'warning' | 'error';

export interface Notification {
  id: string;
  /** "docker", "disk", "temperature", "monitor", "test", or "app:<id>". */
  source: string;
  level: NotificationLevel;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  /** Source-specific payload (container id, mount point, monitor target, …). */
  data: Record<string, unknown> | null;
}

export type MonitorKind = 'http' | 'ping';
export type MonitorState = 'up' | 'down' | 'unknown';

export interface MonitorTarget {
  /** "shortcut:<id>" for shortcuts, "<appId>:<key>" for app-registered targets. */
  id: string;
  kind: MonitorKind;
  label: string;
  /** URL for http targets; "host:port" for ping targets. */
  address: string;
  /** Who owns the target: a shortcut, or an app id. */
  owner: string;
}

export interface MonitorSample {
  at: string;
  up: boolean;
  latencyMs: number | null;
}

export interface MonitorStatus {
  target: MonitorTarget;
  state: MonitorState;
  checkedAt: string | null;
  latencyMs: number | null;
  reason: string | null;
  /** Newest last; the service keeps the last few hours. */
  history: MonitorSample[];
}

/** Pushed over /ws/events to every open client. */
export type EventsServerMessage =
  | { type: 'notification'; notification: Notification }
  | { type: 'notifications-read'; ids: string[] | 'all' }
  | { type: 'notifications-cleared' }
  | { type: 'monitor-status'; status: MonitorStatus }
  | { type: 'monitor-targets' }
  | { type: 'settings-changed' }
  | { type: 'error'; message: string };

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

export interface FileListing {
  path: string;
  entries: FileEntry[];
}

export interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  user: string;
  cpuPercent: number;
  memoryBytes: number;
  state: string;
  command: string;
}
