import { useEffect } from 'react';
import { useWindowStore } from '../Store/WindowStore';
import { Window } from './Window';
import styles from './WindowManager.module.css';

/**
 * Renders every window in creation order (stable keys keep iframes mounted)
 * and stacks them with z-index. Also focuses a window when its iframe takes
 * keyboard focus, since iframes swallow pointer events.
 */
export function WindowManager() {
  const windows = useWindowStore((s) => s.windows);
  const focusedId = useWindowStore((s) => s.focusedId);
  const focus = useWindowStore((s) => s.focus);
  const relayout = useWindowStore((s) => s.relayout);

  useEffect(() => {
    const onBlur = () => {
      // Focus moved into an iframe: find its window and bring it to the front.
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active?.tagName !== 'IFRAME') return;
        const id = active.closest<HTMLElement>('[data-window-id]')?.dataset.windowId;
        if (id) focus(id);
      }, 0);
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [focus]);

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(relayout);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, [relayout]);

  return (
    <div className={styles.layer}>
      {windows.map((win) => (
        <Window key={win.id} win={win} focused={win.id === focusedId} />
      ))}
    </div>
  );
}
