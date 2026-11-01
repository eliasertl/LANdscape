import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { TASKBAR_SIZE_PX, type Settings } from '@landscape/shared';
import { useUiStore } from '../Store/UiStore';
import { useEffectiveTaskbar } from './UseTaskbarSettings';
import { TaskbarApps } from './TaskbarApps';
import { TaskbarClock } from './TaskbarClock';
import { TaskbarTray } from './TaskbarTray';
import { ErrorBoundary } from '../Components/ErrorBoundary';
import { toLayout } from '../Design/Scale';
import styles from './Taskbar.module.css';

interface TaskbarProps {
  /** Renders these settings inline (Settings → Taskbar live preview) instead of the real, positioned bar. */
  preview?: Settings['taskbar'];
}

const REVEAL_DELAY_MS = 150;
const HIDE_DELAY_MS = 600;

/**
 * The taskbar in one of four styles (Settings → Taskbar): a floating
 * centered pill (default), Windows 10 (full width, launcher left), Windows
 * 11 (full width, launcher centered) or a macOS-like dock with magnification.
 * It can sit on any edge, auto-hide, and comes in three sizes.
 */
export function Taskbar({ preview }: TaskbarProps) {
  const live = useEffectiveTaskbar();
  const settings = preview ?? live;
  const startMenuOpen = useUiStore((s) => s.startMenuOpen);
  const contextMenuOpen = useUiStore((s) => s.contextMenu !== null);
  const toggleStartMenu = useUiStore((s) => s.toggleStartMenu);
  const hostRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(!settings.autoHide);

  const vertical = settings.position === 'left' || settings.position === 'right';
  const docked = settings.style === 'win10' || settings.style === 'win11';
  const size = TASKBAR_SIZE_PX[settings.size];

  // Other parts (start menu placement, window geometry) read the position and size from <html>.
  useEffect(() => {
    if (preview) return;
    const root = document.documentElement;
    root.dataset.taskbarPosition = settings.position;
    root.dataset.taskbarStyle = settings.style;
    root.style.setProperty('--taskbar-height', `${size}px`);
    window.dispatchEvent(new Event('resize'));
  }, [preview, settings.position, settings.style, size]);

  // Auto-hide: reveal when the pointer reaches the edge, hide a moment after it leaves the bar.
  useEffect(() => {
    if (preview) return;
    if (!settings.autoHide) {
      setRevealed(true);
      return;
    }
    setRevealed(false);
    let revealTimer: number | null = null;
    let hideTimer: number | null = null;
    const onMove = (event: PointerEvent) => {
      const x = toLayout(event.clientX);
      const y = toLayout(event.clientY);
      const width = toLayout(window.innerWidth);
      const height = toLayout(window.innerHeight);
      const atEdge =
        (settings.position === 'bottom' && height - y <= 4) ||
        (settings.position === 'top' && y <= 4) ||
        (settings.position === 'left' && x <= 4) ||
        (settings.position === 'right' && width - x <= 4);
      const rect = hostRef.current?.getBoundingClientRect();
      const overBar = rect ? event.clientX >= rect.left - 20 && event.clientX <= rect.right + 20 && event.clientY >= rect.top - 20 && event.clientY <= rect.bottom + 20 : false;
      if (atEdge || overBar) {
        if (hideTimer !== null) window.clearTimeout(hideTimer);
        hideTimer = null;
        if (revealTimer === null) revealTimer = window.setTimeout(() => setRevealed(true), atEdge ? REVEAL_DELAY_MS : 0);
      } else {
        if (revealTimer !== null) window.clearTimeout(revealTimer);
        revealTimer = null;
        if (hideTimer === null) hideTimer = window.setTimeout(() => setRevealed(false), HIDE_DELAY_MS);
      }
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (revealTimer !== null) window.clearTimeout(revealTimer);
      if (hideTimer !== null) window.clearTimeout(hideTimer);
    };
  }, [preview, settings.autoHide, settings.position]);

  const shown = revealed || startMenuOpen || contextMenuOpen || !settings.autoHide;
  const hostClass = [
    styles.host,
    preview ? styles.preview : '',
    styles[`pos-${settings.position}`],
    styles[`style-${settings.style}`],
    vertical ? styles.vertical : '',
    settings.autoHide && !shown ? styles.hiddenBar : '',
  ].join(' ');
  const style = { '--taskbar-height': `${size}px`, '--taskbar-icon': `${size - 12}px` } as CSSProperties;

  const launcher = (
    <button
      type="button"
      className={`${styles.search} ${startMenuOpen ? styles.searchActive : ''}`}
      aria-label="Search and launch"
      aria-expanded={startMenuOpen}
      title="Search (Ctrl+Space)"
      data-taskbar-search={preview ? undefined : ''}
      onClick={preview ? undefined : toggleStartMenu}
    >
      <MagnifyingGlass weight="bold" />
    </button>
  );
  const apps = (
    <ErrorBoundary label="Taskbar apps" compact>
      <TaskbarApps settings={settings} vertical={vertical} preview={Boolean(preview)} />
    </ErrorBoundary>
  );
  const tray = (
    <ErrorBoundary label="Taskbar tray" compact>
      <TaskbarTray settings={settings} vertical={vertical} />
    </ErrorBoundary>
  );
  const clock = (
    <ErrorBoundary label="Taskbar clock" compact>
      <TaskbarClock settings={settings.clock} vertical={vertical} />
    </ErrorBoundary>
  );

  return (
    <div ref={hostRef} className={hostClass} style={style} data-taskbar={preview ? 'preview' : ''} data-taskbar-position={settings.position} data-taskbar-style={settings.style}>
      <div className={`${styles.bar} material`} role="toolbar" aria-label="Taskbar">
        {docked ? (
          <>
            <div className={styles.region}>{settings.style === 'win10' && launcher}{settings.style === 'win10' && apps}</div>
            <div className={`${styles.region} ${styles.center}`}>{settings.style === 'win11' && launcher}{settings.style === 'win11' && apps}</div>
            <div className={`${styles.region} ${styles.end}`}>
              {tray}
              <div className={styles.divider} />
              {clock}
            </div>
          </>
        ) : (
          <>
            {launcher}
            <div className={styles.divider} />
            {apps}
            <div className={styles.divider} />
            {tray}
            {clock}
          </>
        )}
      </div>
      {settings.autoHide && !preview && <div className={styles.edgeCatcher} aria-hidden="true" />}
    </div>
  );
}
