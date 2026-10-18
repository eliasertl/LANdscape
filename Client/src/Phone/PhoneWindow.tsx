import { memo, useEffect, useRef } from 'react';
import { ArrowLeft, X } from '@phosphor-icons/react';
import { useWindowStore, type DesktopWindow } from '../Store/WindowStore';
import { WindowContent } from '../Windows/WindowContent';
import { WindowIcon } from '../Windows/WindowIcon';
import { SPRING } from '../Design/Spring';
import { useSpringStyle, useSpringValue } from '../Design/UseSpring';
import styles from './PhoneShell.module.css';

/** Full-screen window with a back/close bar. Stays mounted while minimized so iframes keep state. */
export const PhoneWindow = memo(function PhoneWindow({ win, active }: { win: DesktopWindow; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const minimize = useWindowStore((s) => s.minimize);
  const requestClose = useWindowStore((s) => s.requestClose);
  const remove = useWindowStore((s) => s.remove);
  const slide = useSpringValue(40, SPRING.standard, 0.3);
  const opacity = useSpringValue(0, SPRING.standard, 0.005);
  useSpringStyle(ref, [slide, opacity], ([y, o]) => ({ transform: `translateY(${y ?? 0}px)`, opacity: String(o ?? 1) }));

  useEffect(() => {
    if (active) {
      void slide.set(0);
      void opacity.set(1);
    } else {
      void slide.set(40);
      void opacity.set(0);
    }
  }, [active, slide, opacity]);

  useEffect(() => {
    if (!win.closing) return;
    let cancelled = false;
    void Promise.all([slide.set(60), opacity.set(0)]).then(() => {
      if (!cancelled) remove(win.id);
    });
    return () => {
      cancelled = true;
    };
  }, [win.closing, win.id, slide, opacity, remove]);

  return (
    <div ref={ref} className={`${styles.window} ${active ? '' : styles.windowHidden}`} role="dialog" aria-label={win.title} aria-hidden={!active} data-window-id={win.id}>
      <div className={`${styles.windowBar} material`}>
        <button type="button" className={styles.barButton} aria-label="Back to home" onClick={() => minimize(win.id)}>
          <ArrowLeft weight="bold" />
        </button>
        <span className={styles.barTitle}>
          <WindowIcon win={win} size={18} />
          <span className="text-truncate">{win.title}</span>
        </span>
        <button type="button" className={styles.barButton} aria-label="Close window" onClick={() => void requestClose(win.id)}>
          <X weight="bold" />
        </button>
      </div>
      <div className={styles.windowBody}>
        <WindowContent win={win} />
      </div>
    </div>
  );
});
