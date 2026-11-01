import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowsOutSimple, CornersOut, Minus, Square, X } from '@phosphor-icons/react';
import { useWindowStore, type DesktopWindow } from '../Store/WindowStore';
import { useDesktopStore } from '../Store/DesktopStore';
import { WindowIcon } from './WindowIcon';
import { ProxyBadge } from './ProxyBadge';
import styles from './TitleBar.module.css';

interface TitleBarProps {
  win: DesktopWindow;
  focused: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
}

/** macOS traffic lights on the left, or Windows-style buttons on the right (Settings → Windows). */
export function TitleBar({ win, focused, onPointerDown, onDoubleClick }: TitleBarProps) {
  const requestClose = useWindowStore((s) => s.requestClose);
  const minimize = useWindowStore((s) => s.minimize);
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize);
  const buttons = useDesktopStore((s) => s.settings?.windows.buttons ?? 'mac');

  const stop = (e: ReactPointerEvent) => e.stopPropagation();
  const windowsStyle = buttons === 'windows';

  return (
    <div
      className={`${styles.titleBar} ${focused ? styles.focused : ''} ${windowsStyle ? styles.windowsStyle : ''} material`}
      data-title-buttons={buttons}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        onDoubleClick();
      }}
    >
      {!windowsStyle && (
        <div className={styles.lights} role="group" aria-label="Window controls" onPointerDown={stop} onDoubleClick={(e) => e.stopPropagation()}>
          <button type="button" className={`${styles.light} ${styles.close}`} aria-label="Close window" title="Close" onClick={() => void requestClose(win.id)}>
            <X weight="bold" />
          </button>
          <button type="button" className={`${styles.light} ${styles.minimize}`} aria-label="Minimize window" title="Minimize" onClick={() => minimize(win.id)}>
            <Minus weight="bold" />
          </button>
          <button type="button" className={`${styles.light} ${styles.maximize}`} aria-label={win.maximized ? 'Restore window' : 'Maximize window'} title={win.maximized ? 'Restore' : 'Maximize'} onClick={() => toggleMaximize(win.id)}>
            <ArrowsOutSimple weight="bold" />
          </button>
        </div>
      )}
      <div className={styles.title}>
        <span className={styles.icon}>
          <WindowIcon win={win} size={16} />
        </span>
        <span className={`${styles.text} text-truncate`}>{win.title}</span>
        <ProxyBadge win={win} />
      </div>
      <div className={styles.spacer} />
      {windowsStyle && (
        <div className={styles.controls} role="group" aria-label="Window controls" onPointerDown={stop} onDoubleClick={(e) => e.stopPropagation()}>
          <button type="button" className={styles.control} aria-label="Minimize window" title="Minimize" onClick={() => minimize(win.id)}>
            <Minus />
          </button>
          <button type="button" className={styles.control} aria-label={win.maximized ? 'Restore window' : 'Maximize window'} title={win.maximized ? 'Restore' : 'Maximize'} onClick={() => toggleMaximize(win.id)}>
            {win.maximized ? <CornersOut /> : <Square />}
          </button>
          <button type="button" className={`${styles.control} ${styles.controlClose}`} aria-label="Close window" title="Close" onClick={() => void requestClose(win.id)}>
            <X />
          </button>
        </div>
      )}
    </div>
  );
}
