import { describe, expect, it } from 'vitest';
import { dayPart, resolveWallpaper, slideshowNextChangeMs, slideshowWallpaper, type SlideshowSettings, type TimeOfDaySettings } from '@landscape/shared';

const a = { kind: 'bundled' as const, file: 'a.webp' };
const b = { kind: 'bundled' as const, file: 'b.webp' };
const c = { kind: 'upload' as const, file: 'c.webp' };
const at = (hour: number, minute = 0) => new Date(2026, 10, 1, hour, minute);

describe('wallpaper schedule', () => {
  it('splits the day into four parts', () => {
    expect(dayPart(at(7))).toBe('morning');
    expect(dayPart(at(12))).toBe('day');
    expect(dayPart(at(18))).toBe('evening');
    expect(dayPart(at(23))).toBe('night');
    expect(dayPart(at(3))).toBe('night');
  });

  it('cycles the slideshow in order by wall-clock slot, the same on every device', () => {
    const slideshow: SlideshowSettings = { enabled: true, intervalMinutes: 30, order: 'sequence', wallpapers: [a, b, c] };
    const first = slideshowWallpaper(slideshow, at(10, 0));
    expect(slideshowWallpaper(slideshow, at(10, 29))).toEqual(first);
    expect(slideshowWallpaper(slideshow, at(10, 30))).not.toEqual(first);
    expect(slideshowWallpaper(slideshow, at(11, 30))).toEqual(first);
    expect(slideshowNextChangeMs(slideshow, at(10, 10))).toBe(20 * 60_000);
  });

  it('shuffles deterministically and shows every picture once per cycle', () => {
    const slideshow: SlideshowSettings = { enabled: true, intervalMinutes: 1, order: 'shuffle', wallpapers: [a, b, c] };
    const base = Math.floor(at(10).getTime() / 60_000 / 3) * 3 * 60_000;
    const cycle = [0, 1, 2].map((i) => slideshowWallpaper(slideshow, new Date(base + i * 60_000)));
    expect(new Set(cycle.map((w) => w?.file)).size).toBe(3);
    expect(slideshowWallpaper(slideshow, new Date(base + 60_000))).toEqual(cycle[1]);
  });

  it('is off with fewer than two pictures or when disabled', () => {
    expect(slideshowWallpaper({ enabled: true, intervalMinutes: 5, order: 'sequence', wallpapers: [a] }, at(10))).toBeNull();
    expect(slideshowWallpaper({ enabled: false, intervalMinutes: 5, order: 'sequence', wallpapers: [a, b] }, at(10))).toBeNull();
    expect(slideshowNextChangeMs({ enabled: false, intervalMinutes: 5, order: 'sequence', wallpapers: [a, b] }, at(10))).toBeNull();
  });

  it('lets time of day win over the slideshow and the fixed choice, with gaps falling through', () => {
    const timeOfDay: TimeOfDaySettings = { enabled: true, morning: c, day: null, evening: null, night: b };
    const slideshow: SlideshowSettings = { enabled: true, intervalMinutes: 30, order: 'sequence', wallpapers: [a, b] };
    expect(resolveWallpaper({ wallpaper: a, slideshow, timeOfDay }, at(8))).toEqual(c);
    expect(resolveWallpaper({ wallpaper: a, slideshow, timeOfDay }, at(23))).toEqual(b);
    expect([a, b]).toContainEqual(resolveWallpaper({ wallpaper: a, slideshow, timeOfDay }, at(13)));
    expect(resolveWallpaper({ wallpaper: a, slideshow: { ...slideshow, enabled: false }, timeOfDay: { ...timeOfDay, enabled: false } }, at(8))).toEqual(a);
  });
});
