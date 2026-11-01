import { useShallow } from 'zustand/react/shallow';
import { monitorSummary, useMonitorStore } from '../../Store/MonitorStore';
import { openApp } from '../../Desktop/Launch';
import styles from '../TaskbarTray.module.css';

/** Tray summary of the monitor service: green when everything answers, red with the count when something is down. */
export function ServiceHealth() {
  const summary = useMonitorStore(useShallow((s) => monitorSummary(s.statuses)));
  const total = summary.up + summary.down + summary.unknown;
  const label = total === 0 ? 'No services are monitored' : summary.down > 0 ? `${summary.down} of ${total} services down` : summary.unknown === total ? 'Services not checked yet' : `All ${total} services up`;
  const color = summary.down > 0 ? 'var(--system-red)' : summary.unknown === total ? 'var(--color-tertiary-label)' : 'var(--system-green)';
  return (
    <button type="button" className={styles.button} aria-label={label} title={label} data-service-health={summary.down > 0 ? 'down' : summary.unknown === total ? 'unknown' : 'up'} onClick={() => openApp('settings', { section: 'notifications' })}>
      <span className={styles.healthDot} style={{ background: color }} />
      {summary.down > 0 && <span className={styles.healthCount}>{summary.down}</span>}
    </button>
  );
}
