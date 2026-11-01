import { useEffect, useState } from 'react';
import type { Settings } from '@landscape/shared';
import styles from './TaskbarClock.module.css';

interface TaskbarClockProps {
  settings: Settings['taskbar']['clock'];
  vertical: boolean;
}

export function TaskbarClock({ settings, vertical }: TaskbarClockProps) {
  const [now, setNow] = useState(() => new Date());
  const step = settings.seconds ? 1000 : 60_000;

  useEffect(() => {
    const tick = () => setNow(new Date());
    // Align to the next boundary, then every step.
    let interval: number | undefined;
    const timeout = window.setTimeout(
      () => {
        tick();
        interval = window.setInterval(tick, step);
      },
      step - (Date.now() % step),
    );
    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, [step]);

  const timeFormat = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: settings.seconds ? '2-digit' : undefined,
    hour12: settings.hours === 'auto' ? undefined : settings.hours === '12',
  });
  const dateFormat = new Intl.DateTimeFormat(undefined, vertical ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric', month: 'short' });
  const time = timeFormat.format(now);
  const date = dateFormat.format(now);

  return (
    <div className={`${styles.clock} ${vertical ? styles.vertical : ''}`} aria-label={`${time}, ${date}`} data-taskbar-clock>
      <span className={`${styles.time} text-tabular`}>{time}</span>
      {settings.showDate && <span className={styles.date}>{date}</span>}
    </div>
  );
}
