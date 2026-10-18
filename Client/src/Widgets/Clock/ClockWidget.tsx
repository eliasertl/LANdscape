import { useEffect, useState } from 'react';
import type { WidgetProps } from '../Types';
import { WidgetFrame } from '../WidgetFrame';
import styles from './ClockWidget.module.css';

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

/** Client-side clock; the interval setting controls the tick (default 1 s). */
export function ClockWidget({ widget }: WidgetProps) {
  const [now, setNow] = useState(() => new Date());
  const showSeconds = Boolean(widget.settings.showSeconds);
  const interval = Math.max(250, Math.min(widget.settings.intervalMs, 60000));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);

  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: showSeconds ? '2-digit' : undefined }).format(now);

  return (
    <WidgetFrame widget={widget} title="Clock">
      <div className={styles.clock}>
        <span className={`${styles.time} text-tabular`}>{time}</span>
        <span className={styles.date}>{dateFormat.format(now)}</span>
      </div>
    </WidgetFrame>
  );
}
