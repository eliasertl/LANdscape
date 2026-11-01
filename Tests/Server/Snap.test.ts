import { describe, expect, it } from 'vitest';
import { snapRect, snapZoneAt, taskbarInset } from '@landscape/shared';

const area = { x: 0, y: 0, width: 1440, height: 828 };

describe('window snapping', () => {
  it('detects edges and corners from the pointer position', () => {
    expect(snapZoneAt({ x: 700, y: 400 }, area)).toBeNull();
    expect(snapZoneAt({ x: 3, y: 400 }, area)).toBe('left');
    expect(snapZoneAt({ x: 1438, y: 400 }, area)).toBe('right');
    expect(snapZoneAt({ x: 700, y: 2 }, area)).toBe('top');
    expect(snapZoneAt({ x: 3, y: 30 }, area)).toBe('top-left');
    expect(snapZoneAt({ x: 1436, y: 30 }, area)).toBe('top-right');
    expect(snapZoneAt({ x: 3, y: 800 }, area)).toBe('bottom-left');
    expect(snapZoneAt({ x: 1437, y: 810 }, area)).toBe('bottom-right');
    // The bottom edge alone is not a zone (that is where the taskbar lives).
    expect(snapZoneAt({ x: 700, y: 826 }, area)).toBeNull();
  });

  it('respects a work area that does not start at the origin (taskbar on top or left)', () => {
    const shifted = { x: 56, y: 56, width: 1384, height: 844 };
    expect(snapZoneAt({ x: 58, y: 400 }, shifted)).toBe('left');
    expect(snapZoneAt({ x: 700, y: 58 }, shifted)).toBe('top');
    expect(snapZoneAt({ x: 10, y: 400 }, shifted)).toBe('left'); // beyond the edge still counts
  });

  it('computes halves, quarters and the whole area', () => {
    expect(snapRect('left', area)).toEqual({ x: 0, y: 0, width: 720, height: 828 });
    expect(snapRect('right', area)).toEqual({ x: 720, y: 0, width: 720, height: 828 });
    expect(snapRect('top', area)).toEqual(area);
    expect(snapRect('top-right', area)).toEqual({ x: 720, y: 0, width: 720, height: 414 });
    expect(snapRect('bottom-left', area)).toEqual({ x: 0, y: 414, width: 720, height: 414 });
    const odd = { x: 10, y: 10, width: 1001, height: 601 };
    const l = snapRect('left', odd);
    const r = snapRect('right', odd);
    expect(l.width + r.width).toBe(odd.width);
    expect(r.x).toBe(odd.x + l.width);
  });
});

describe('taskbar inset', () => {
  it('reserves the bar plus a margin for floating styles, the bar alone for docked ones, nothing when auto-hiding', () => {
    expect(taskbarInset({ position: 'bottom', style: 'floating', size: 'm', autoHide: false })).toEqual({ top: 0, right: 0, bottom: 72, left: 0 });
    expect(taskbarInset({ position: 'top', style: 'win11', size: 's', autoHide: false })).toEqual({ top: 44, right: 0, bottom: 0, left: 0 });
    expect(taskbarInset({ position: 'left', style: 'dock', size: 'l', autoHide: false })).toEqual({ top: 0, right: 0, bottom: 0, left: 84 });
    expect(taskbarInset({ position: 'right', style: 'win10', size: 'm', autoHide: true })).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
