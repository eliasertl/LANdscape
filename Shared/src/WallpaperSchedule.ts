import type { WallpaperChoice } from './Types';

export type DayPart = 'morning' | 'day' | 'evening' | 'night';

export interface SlideshowSettings {
  enabled: boolean;
  intervalMinutes: number;
  order: 'sequence' | 'shuffle';
  /** Wallpapers to rotate through; fewer than two disables the slideshow. */
  wallpapers: WallpaperChoice[];
}

export interface TimeOfDaySettings {
  enabled: boolean;
  morning: WallpaperChoice | null;
  day: WallpaperChoice | null;
  evening: WallpaperChoice | null;
  night: WallpaperChoice | null;
}

/** Morning 6–11, day 11–17, evening 17–21, night otherwise (local time). */
export function dayPart(date: Date): DayPart {
  const hour = date.getHours();
  if (hour >= 6 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/** Small deterministic PRNG so every device shows the same shuffle order for the same day. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], seed: number): T[] {
  const copy = [...items];
  const random = mulberry32(seed);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/**
 * The slideshow picture for a moment in time. Computed from the clock alone
 * (no stored state), so every device shows the same picture and the server
 * can pick the same one for the lock screen.
 */
export function slideshowWallpaper(slideshow: SlideshowSettings, now: Date): WallpaperChoice | null {
  const list = slideshow.wallpapers;
  if (!slideshow.enabled || list.length < 2) return null;
  const intervalMs = Math.max(1, slideshow.intervalMinutes) * 60_000;
  const slot = Math.floor(now.getTime() / intervalMs);
  if (slideshow.order === 'sequence') return list[slot % list.length] ?? null;
  // One shuffle per full cycle, re-shuffled when the cycle wraps.
  const cycle = Math.floor(slot / list.length);
  return shuffled(list, cycle)[slot % list.length] ?? null;
}

/** When the slideshow picture changes next (ms from `now`), or null when it is off. */
export function slideshowNextChangeMs(slideshow: SlideshowSettings, now: Date): number | null {
  if (!slideshow.enabled || slideshow.wallpapers.length < 2) return null;
  const intervalMs = Math.max(1, slideshow.intervalMinutes) * 60_000;
  return intervalMs - (now.getTime() % intervalMs);
}

/** Time of day wins over the slideshow, which wins over the fixed choice. */
export function resolveWallpaper(
  settings: { wallpaper: WallpaperChoice; slideshow: SlideshowSettings; timeOfDay: TimeOfDaySettings },
  now: Date,
): WallpaperChoice {
  if (settings.timeOfDay.enabled) {
    const choice = settings.timeOfDay[dayPart(now)];
    if (choice) return choice;
  }
  return slideshowWallpaper(settings.slideshow, now) ?? settings.wallpaper;
}
