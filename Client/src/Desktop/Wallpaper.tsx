import { useEffect, useState } from 'react';
import { resolveWallpaper, slideshowNextChangeMs } from '@landscape/shared';
import { useDesktopStore, wallpaperFileUrl } from '../Store/DesktopStore';
import styles from './Wallpaper.module.css';

/** The wallpaper to show right now: time of day, then slideshow, then the fixed choice (Shared/src/WallpaperSchedule.ts). */
export function useCurrentWallpaperUrl(): string | null {
  const settings = useDesktopStore((s) => s.settings);
  const [, setTick] = useState(0);

  // Re-render when the slideshow advances or the part of the day changes.
  useEffect(() => {
    if (!settings) return;
    const now = new Date();
    const nextSlide = slideshowNextChangeMs(settings.appearance.slideshow, now);
    const nextHour = 3_600_000 - (now.getTime() % 3_600_000);
    const delay = Math.max(1000, Math.min(nextSlide ?? Infinity, settings.appearance.timeOfDay.enabled ? nextHour : Infinity));
    if (!Number.isFinite(delay)) return;
    const timer = window.setTimeout(() => setTick((t) => t + 1), delay + 50);
    return () => window.clearTimeout(timer);
  });

  if (!settings) return null;
  return wallpaperFileUrl(resolveWallpaper({ wallpaper: settings.wallpaper, ...settings.appearance }, new Date()));
}

/** Full-screen wallpaper that cross-fades when the picture changes. */
export function Wallpaper() {
  const url = useCurrentWallpaperUrl();
  const [layers, setLayers] = useState<{ url: string; key: number }[]>(() => (url ? [{ url, key: 1 }] : []));

  useEffect(() => {
    if (!url) return;
    setLayers((current) => {
      const last = current[current.length - 1];
      if (last?.url === url) return current;
      const key = (last?.key ?? 0) + 1;
      return [...current.slice(-1), { url, key }];
    });
  }, [url]);

  return (
    <div className={styles.wallpaper} aria-hidden="true">
      {layers.map((layer, index) => (
        <img
          key={layer.key}
          src={layer.url}
          alt=""
          className={`${styles.layer} ${index === layers.length - 1 ? styles.top : ''}`}
          onTransitionEnd={() => setLayers((current) => current.slice(-1))}
          draggable={false}
        />
      ))}
    </div>
  );
}
