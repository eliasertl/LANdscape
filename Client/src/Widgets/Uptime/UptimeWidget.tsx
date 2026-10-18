import { useEffect, useState } from 'react';
import type { WidgetProps } from '../Types';
import { WidgetFrame } from '../WidgetFrame';
import { useMetric } from '../UseMetric';
import { formatDuration } from '../Format';
import styles from '../Widgets.module.css';

const bootFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function UptimeWidget({ widget }: WidgetProps) {
  const state = useMetric('uptime', widget.settings.intervalMs);
  // Tick locally between samples so the display keeps counting.
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = state.status === 'ok' ? state.data.seconds + Math.max(0, now - state.at) / 1000 : null;
  return (
    <WidgetFrame widget={widget} title="Uptime" unavailable={state.status === 'unavailable' ? state.reason : null}>
      {state.status === 'ok' && seconds !== null ? (
        <div className={styles.stack}>
          <span className={styles.big} style={{ fontSize: 24, lineHeight: '28px' }}>
            {formatDuration(seconds)}
          </span>
          <span className={styles.muted}>since {bootFormat.format(new Date(state.data.bootedAt))}</span>
        </div>
      ) : (
        <div className={styles.waiting}>Waiting for data…</div>
      )}
    </WidgetFrame>
  );
}
