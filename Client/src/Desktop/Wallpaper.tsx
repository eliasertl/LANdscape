import { useEffect, useState } from 'react';
import { useDesktopStore, wallpaperUrl } from '../Store/DesktopStore';
import styles from './Wallpaper.module.css';

/** Full-screen wallpaper that cross-fades when the choice changes. */
export function Wallpaper() {
  const settings = useDesktopStore((s) => s.settings);
  const url = wallpaperUrl(settings);
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
