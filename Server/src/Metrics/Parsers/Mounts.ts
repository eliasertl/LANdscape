export interface MountEntry {
  device: string;
  mountPoint: string;
  fsType: string;
}

const REAL_FS = new Set([
  'ext2',
  'ext3',
  'ext4',
  'xfs',
  'btrfs',
  'zfs',
  'f2fs',
  'jfs',
  'reiserfs',
  'vfat',
  'exfat',
  'ntfs',
  'ntfs3',
  'fuseblk',
  'hfsplus',
  'nfs',
  'nfs4',
  'cifs',
  'smb3',
  'fuse.mergerfs',
  'fuse.rclone',
]);

const IGNORED_MOUNT_PREFIXES = ['/proc', '/sys', '/dev', '/run', '/boot/efi', '/snap/', '/var/lib/docker/', '/var/lib/containers/'];

/** Parses /proc/<pid>/mounts and keeps real block/network file systems. */
export function parseMounts(text: string): MountEntry[] {
  const entries: MountEntry[] = [];
  const seenDevices = new Map<string, number>();
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [device, rawMount, fsType] = parts as [string, string, string];
    const mountPoint = rawMount.replace(/\\040/g, ' ');
    if (!REAL_FS.has(fsType)) continue;
    const isBlock = device.startsWith('/dev/');
    const isNetwork = /^(nfs|nfs4|cifs|smb3)$/.test(fsType);
    const isFuse = fsType.startsWith('fuse');
    if (!isBlock && !isNetwork && !isFuse) continue;
    if (IGNORED_MOUNT_PREFIXES.some((prefix) => mountPoint === prefix || mountPoint.startsWith(prefix))) continue;
    // The same device mounted several times (bind mounts, btrfs subvolumes): keep the shortest mount point.
    const key = `${device}`;
    const existingIndex = seenDevices.get(key);
    if (existingIndex !== undefined) {
      const existing = entries[existingIndex] as MountEntry;
      if (mountPoint.length < existing.mountPoint.length && fsType !== 'btrfs') entries[existingIndex] = { device, mountPoint, fsType };
      else if (fsType === 'btrfs' && !entries.some((e) => e.mountPoint === mountPoint)) entries.push({ device, mountPoint, fsType });
      continue;
    }
    seenDevices.set(key, entries.length);
    entries.push({ device, mountPoint, fsType });
  }
  return entries.sort((a, b) => a.mountPoint.localeCompare(b.mountPoint));
}

/** Parses `df -P -B1` output (POSIX format, 1-byte blocks). */
export function parseDf(text: string): { mountPoint: string; totalBytes: number; usedBytes: number; freeBytes: number }[] {
  const rows: { mountPoint: string; totalBytes: number; usedBytes: number; freeBytes: number }[] = [];
  for (const line of text.split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const total = Number(parts[1]);
    const used = Number(parts[2]);
    const free = Number(parts[3]);
    const mountPoint = parts.slice(5).join(' ');
    if (!Number.isFinite(total) || total <= 0) continue;
    rows.push({ mountPoint, totalBytes: total, usedBytes: used, freeBytes: free });
  }
  return rows;
}
