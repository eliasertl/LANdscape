/**
 * App permissions (Docs/AppPlatform.md). Every broker call checks the
 * app's granted permissions; "trusted" grants all of them (including
 * unrestricted net:fetch) but never lifts the sandbox.
 */
export const PERMISSIONS = [
  'metrics',
  'docker:read',
  'docker:write',
  'files:read',
  'files:write',
  'ssh:exec',
  'logs',
  'shortcuts',
  'notifications',
  'storage',
  'net:fetch',
  'monitor',
  'actions:invoke',
  'theme:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const DANGEROUS_PERMISSIONS: readonly Permission[] = ['docker:write', 'files:write', 'ssh:exec'];

/** Plain-language descriptions for the install dialog. */
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  metrics: 'Read host metrics (CPU, memory, disks, network, temperatures, uptime).',
  'docker:read': 'List containers and read their status and stats.',
  'docker:write': 'Start, stop and restart containers.',
  'files:read': 'Read files and folders on the host over SFTP (with the SSH user’s rights).',
  'files:write': 'Create, change and delete files on the host over SFTP.',
  'ssh:exec': 'Run commands on the host over SSH.',
  logs: 'Read container, journal and file logs.',
  shortcuts: 'List and create desktop shortcuts.',
  notifications: 'Show notifications.',
  storage: 'Keep its own data in LANdscape’s database.',
  'net:fetch': 'Fetch URLs through the server (only the hosts the app declares, unless trusted).',
  monitor: 'Register targets with the service monitor and read their status.',
  'actions:invoke': 'Run actions of LANdscape and other apps.',
  'theme:read': 'Read the current theme and design tokens.',
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function isDangerous(permission: Permission): boolean {
  return DANGEROUS_PERMISSIONS.includes(permission);
}

/** Whether a call needing `permission` may proceed for an app with these grants. */
export function isAllowed(granted: readonly Permission[], trusted: boolean, permission: Permission): boolean {
  return trusted || granted.includes(permission);
}

/** Permissions a new manifest version asks for that the installed one did not (need re-approval). */
export function newPermissions(installed: readonly Permission[], requested: readonly Permission[]): Permission[] {
  return requested.filter((p) => !installed.includes(p));
}

/**
 * Whether a server-side fetch for an app may reach `url`. Trusted apps may
 * fetch anything http(s); others only hosts from the manifest (exact, or a
 * "*.example.com" wildcard for subdomains).
 */
export function fetchAllowed(url: string, hosts: readonly string[], trusted: boolean): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (trusted) return true;
  const host = parsed.hostname.toLowerCase();
  return hosts.some((pattern) => {
    const p = pattern.toLowerCase();
    if (p.startsWith('*.')) return host === p.slice(2) || host.endsWith(p.slice(1));
    return host === p;
  });
}
