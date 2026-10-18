import { useEffect, useState } from 'react';
import styles from './TaskbarClock.module.css';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function TaskbarClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    // Align to the next minute boundary, then every minute.
    let interval: number | undefined;
    const timeout = window.setTimeout(
      () => {
        tick();
        interval = window.setInterval(tick, 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );
    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, []);
  return (
    <div className={styles.clock} aria-label={`${timeFormat.format(now)}, ${dateFormat.format(now)}`}>
      <span className={`${styles.time} text-tabular`}>{timeFormat.format(now)}</span>
      <span className={styles.date}>{dateFormat.format(now)}</span>
    </div>
  );
}
