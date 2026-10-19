import { describe, expect, it } from 'vitest';
import { planProxyPorts, type PlanShortcut } from '@server/Proxy/Assignments';

const range = { start: 9001, end: 9003 };

function sc(id: string, partial: Partial<PlanShortcut> = {}): PlanShortcut {
  return { id, openMode: 'auto', embeddable: 'no', proxyPort: null, createdAt: `2026-01-0${id.replace(/\D/g, '') || '1'}T00:00:00Z`, ...partial };
}

describe('proxy port planning', () => {
  it('assigns the lowest free ports to blocked auto and explicit proxy shortcuts, oldest first', () => {
    const plan = planProxyPorts([sc('s2'), sc('s1'), sc('s3', { embeddable: 'yes' }), sc('s4', { openMode: 'proxy', embeddable: 'yes' })], range);
    expect(plan.assign).toEqual([
      { id: 's4', port: 9001 },
      { id: 's1', port: 9002 },
      { id: 's2', port: 9003 },
    ]);
    expect(plan.release).toEqual([]);
    expect(plan.waiting).toEqual([]);
  });

  it('never proxies direct, new-tab, embeddable or unchecked auto shortcuts', () => {
    const plan = planProxyPorts(
      [sc('s1', { openMode: 'embed' }), sc('s2', { openMode: 'newtab' }), sc('s3', { embeddable: 'yes' }), sc('s4', { embeddable: 'unknown' })],
      range,
    );
    expect(plan).toEqual({ release: [], assign: [], waiting: [] });
  });

  it('keeps existing assignments and fills the gaps', () => {
    const plan = planProxyPorts([sc('s1', { proxyPort: 9002 }), sc('s2')], range);
    expect(plan.release).toEqual([]);
    expect(plan.assign).toEqual([{ id: 's2', port: 9001 }]);
  });

  it('reports shortcuts that do not fit as waiting', () => {
    const plan = planProxyPorts([sc('s1'), sc('s2'), sc('s3'), sc('s4'), sc('s5')], range);
    expect(plan.assign.map((a) => a.id)).toEqual(['s1', 's2', 's3']);
    expect(plan.waiting).toEqual(['s4', 's5']);
  });

  it('releases ports of shortcuts that stopped needing one, left the range, or collide', () => {
    const plan = planProxyPorts(
      [
        sc('s1', { proxyPort: 9001, openMode: 'newtab' }),
        sc('s2', { proxyPort: 8000 }),
        sc('s3', { proxyPort: 9003 }),
        sc('s4', { proxyPort: 9003 }),
      ],
      range,
    );
    expect(plan.release).toEqual(['s1', 's2', 's4']);
    expect(plan.assign).toEqual([
      { id: 's2', port: 9001 },
      { id: 's4', port: 9002 },
    ]);
  });
});
