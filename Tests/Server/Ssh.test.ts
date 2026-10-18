import { describe, expect, it } from 'vitest';
import { logsClientMessageSchema } from '@landscape/shared';
import { joinRemote, normalizeRemotePath, validateEntryName } from '@server/Ssh/PathValidation';
import { DockerLogDemuxer } from '@server/Docker/LogStream';
import { journalCommand, shellQuote } from '@server/Logs/LogsWs';
import { fingerprint, HostKeyStore } from '@server/Ssh/HostKeys';
import { mapSftpError } from '@server/Ssh/Sftp';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('remote path validation', () => {
  it('normalises absolute POSIX paths', () => {
    expect(normalizeRemotePath('/')).toBe('/');
    expect(normalizeRemotePath('/home//user/./docs/')).toBe('/home/user/docs');
    expect(normalizeRemotePath('/var/log/syslog')).toBe('/var/log/syslog');
    expect(normalizeRemotePath('/mnt/media disk/file.txt')).toBe('/mnt/media disk/file.txt');
  });

  it('rejects relative, traversal and malformed paths', () => {
    expect(() => normalizeRemotePath('')).toThrow();
    expect(() => normalizeRemotePath('etc/passwd')).toThrow(/absolute/);
    // ".." above the root clamps at "/" like a real shell would
    expect(normalizeRemotePath('/etc/../../root')).toBe('/root');
    expect(() => normalizeRemotePath('/a/\0b')).toThrow(/invalid/);
    expect(() => normalizeRemotePath('/' + 'x'.repeat(5000))).toThrow(/long/);
    // ".." that normalises away is fine
    expect(normalizeRemotePath('/home/user/../user2')).toBe('/home/user2');
  });

  it('validates entry names and joins them', () => {
    expect(validateEntryName('  notes.txt ')).toBe('notes.txt');
    expect(() => validateEntryName('..')).toThrow();
    expect(() => validateEntryName('a/b')).toThrow();
    expect(() => validateEntryName('')).toThrow();
    expect(joinRemote('/home/user', 'file.txt')).toBe('/home/user/file.txt');
    expect(joinRemote('/', 'root.txt')).toBe('/root.txt');
    expect(() => joinRemote('/home', '../etc')).toThrow();
  });

  it('maps SFTP status codes to readable errors', () => {
    expect(mapSftpError({ code: 2 }, '/x').statusCode).toBe(404);
    expect(mapSftpError({ code: 3 }, '/x')).toMatchObject({ statusCode: 403, message: '/x: permission denied for the SSH user' });
    expect(mapSftpError(new Error('boom'), '/x').statusCode).toBe(500);
  });
});

describe('logs message schema', () => {
  it('parses every source variant and rejects junk', () => {
    expect(logsClientMessageSchema.safeParse({ type: 'close' }).success).toBe(true);
    const file = logsClientMessageSchema.safeParse({ type: 'open', source: 'file', path: '/var/log/syslog' });
    expect(file.success).toBe(true);
    expect(file.data).toMatchObject({ type: 'open', source: 'file', follow: true });
    const journal = logsClientMessageSchema.safeParse({ type: 'open', source: 'journal', unit: 'docker.service', lines: 100, follow: false });
    expect(journal.success).toBe(true);
    const docker = logsClientMessageSchema.safeParse({ type: 'open', source: 'docker', containerId: 'abc123' });
    expect(docker.success).toBe(true);
    expect(logsClientMessageSchema.safeParse({ type: 'open', source: 'file', path: 'relative' }).success).toBe(false);
    expect(logsClientMessageSchema.safeParse({ type: 'open', source: 'journal', unit: 'bad unit; rm' }).success).toBe(false);
    expect(logsClientMessageSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });
});

describe('shell helpers', () => {
  it('quotes arguments safely', () => {
    expect(shellQuote('docker.service')).toBe("'docker.service'");
    expect(shellQuote("it's; rm -rf /")).toBe("'it'\\''s; rm -rf /'");
  });

  it('builds journalctl commands', () => {
    expect(journalCommand(null, 500, true)).toBe('journalctl --no-pager -o short-iso -n 500 -f');
    expect(journalCommand('ssh', 100, false)).toBe("journalctl --no-pager -o short-iso -n 100 -u 'ssh'");
  });
});

describe('docker log demuxer', () => {
  function frame(type: number, text: string): Buffer {
    const payload = Buffer.from(text, 'utf8');
    const header = Buffer.alloc(8);
    header[0] = type;
    header.writeUInt32BE(payload.length, 4);
    return Buffer.concat([header, payload]);
  }

  it('demultiplexes multiplexed frames split across chunks', () => {
    const out: string[] = [];
    const demuxer = new DockerLogDemuxer((t) => out.push(t));
    const data = Buffer.concat([frame(1, 'hello\n'), frame(2, 'warn\n'), frame(1, 'world\n')]);
    demuxer.push(data.subarray(0, 5));
    demuxer.push(data.subarray(5, 20));
    demuxer.push(data.subarray(20));
    demuxer.flush();
    expect(out.join('')).toBe('hello\nwarn\nworld\n');
  });

  it('passes raw TTY output through', () => {
    const out: string[] = [];
    const demuxer = new DockerLogDemuxer((t) => out.push(t));
    demuxer.push(Buffer.from('plain tty output line\n'));
    demuxer.flush();
    expect(out.join('')).toBe('plain tty output line\n');
  });
});

describe('host key store', () => {
  it('trusts the first key and refuses a changed one', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'landscape-hostkey-'));
    try {
      const store = new HostKeyStore(dir);
      const keyA = Buffer.from('ssh-ed25519 AAAA key-a');
      const keyB = Buffer.from('ssh-ed25519 AAAA key-b');
      expect(store.verify('host', 22, keyA)).toBe(true);
      expect(store.verify('host', 22, keyA)).toBe(true);
      expect(() => store.verify('host', 22, keyB)).toThrow(/host key changed/i);
      expect(store.verify('other', 22, keyB)).toBe(true);
      expect(fingerprint(keyA)).toMatch(/^SHA256:[A-Za-z0-9+/]+$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
