import { describe, expect, it } from 'vitest';
import { LeaseTable, idleDecision } from '@server/Proxy/Leases';

describe('proxy lease table', () => {
  it('keeps a lease alive while it is renewed and expires it otherwise', () => {
    const table = new LeaseTable(1000);
    const id = table.acquire(8081, 0);
    expect(table.count(8081, 500)).toBe(1);
    expect(table.renew(id, 900)).toBe(8081);
    expect(table.count(8081, 1800)).toBe(1);
    expect(table.expire(1899)).toEqual([]);
    expect(table.expire(1900)).toEqual([8081]);
    expect(table.count(8081, 1900)).toBe(0);
    expect(table.renew(id, 1901)).toBeNull();
  });

  it('refuses to renew an expired lease even before the sweep removed it', () => {
    const table = new LeaseTable(1000);
    const id = table.acquire(8081, 0);
    expect(table.renew(id, 1000)).toBeNull();
    expect(table.count(8081, 1000)).toBe(0);
  });

  it('counts leases per port and releases them individually or per port', () => {
    const table = new LeaseTable(1000);
    const a = table.acquire(8081, 0);
    table.acquire(8081, 0);
    table.acquire(8082, 0);
    expect(table.count(8081, 1)).toBe(2);
    expect(table.release(a)).toBe(8081);
    expect(table.release(a)).toBeNull();
    expect(table.count(8081, 1)).toBe(1);
    table.releasePort(8081);
    expect(table.count(8081, 1)).toBe(0);
    expect(table.count(8082, 1)).toBe(1);
  });
});

describe('idle decision', () => {
  const base = { leases: 0, activeConnections: 0, idleSince: 0, now: 0, graceMs: 60_000 };

  it('keeps a port open while a window holds a lease, whatever the idle time', () => {
    expect(idleDecision({ ...base, leases: 2, now: 10 * 60_000 })).toEqual({ close: false, reason: 'In use by 2 windows', closesInMs: null });
  });

  it('keeps a port open while a request or WebSocket is active', () => {
    expect(idleDecision({ ...base, activeConnections: 1, now: 10 * 60_000 })).toEqual({ close: false, reason: '1 active connection', closesInMs: null });
  });

  it('counts the grace period from the last use and then closes', () => {
    expect(idleDecision({ ...base, idleSince: 1000, now: 19_000 })).toEqual({ close: false, reason: 'Idle, closes in 42 s', closesInMs: 42_000 });
    expect(idleDecision({ ...base, idleSince: 1000, now: 60_999 })).toMatchObject({ close: false, closesInMs: 1 });
    expect(idleDecision({ ...base, idleSince: 1000, now: 61_000 })).toEqual({ close: true, reason: 'Idle', closesInMs: null });
  });
});
