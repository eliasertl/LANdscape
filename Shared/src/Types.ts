import type { AppId, WidgetType } from './AppIds';

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
  x: number;
  y: number;
  embeddable: Embeddable;
  embedCheckedAt: string | null;
  embedReason: string | null;
  openMode: OpenMode;
  /** Embed proxy port assigned to this shortcut, or null when it does not use the proxy. */
  proxyPort: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WidgetSettings {
  intervalMs: number;
  /** Per-type extra settings (e.g. selected interface for the network widget). */
  [key: string]: unknown;
}

export interface Widget {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  settings: WidgetSettings;
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

export interface Settings {
  theme: Theme;
  wallpaper: WallpaperChoice;
  enabledApps: Record<AppId, boolean>;
  proxyIndicator: ProxyIndicator;
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

export interface ProxyPortStatus {
  port: number;
  shortcutId: string;
  name: string;
  /** Origin the port forwards to. */
  target: string;
  listening: boolean;
  /** Why the listener is not running, if it failed. */
  error: string | null;
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
  settings: Settings;
  windowMemory: WindowMemory;
  integrations: { ssh: boolean; docker: boolean; hostProc: boolean; hostSys: boolean };
  proxy: ProxyRange;
  version: string;
}

export interface SessionInfo {
  authenticated: boolean;
  username: string | null;
  /** Wallpaper for the lock screen (bundled wallpapers only; uploads stay private until login). */
  lockScreenWallpaper: string | null;
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
