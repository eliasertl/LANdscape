import { useMetric } from '../../Widgets/UseMetric';
import { usageColor } from '../../Components/Sparkline';
import { openApp } from '../../Desktop/Launch';
import styles from '../TaskbarTray.module.css';

/** Two tiny bars: CPU and memory usage; double-click opens the Task Manager. */
export function CpuRamMeter() {
  const cpu = useMetric('cpu', 2000);
  const memory = useMetric('memory', 5000);
  const cpuRatio = cpu.status === 'ok' ? cpu.data.total / 100 : null;
  const memRatio = memory.status === 'ok' ? memory.data.usedBytes / Math.max(1, memory.data.totalBytes) : null;
  const label = `CPU ${cpuRatio === null ? '–' : `${Math.round(cpuRatio * 100)} %`} · Memory ${memRatio === null ? '–' : `${Math.round(memRatio * 100)} %`}`;
  return (
    <span className={styles.meter} role="img" aria-label={label} title={label} onDoubleClick={() => openApp('task-manager')}>
      <Bar ratio={cpuRatio} />
      <Bar ratio={memRatio} />
    </span>
  );
}

function Bar({ ratio }: { ratio: number | null }) {
  return (
    <span className={styles.bar}>
      <span className={styles.fill} style={{ height: `${Math.round((ratio ?? 0) * 100)}%`, background: ratio === null ? 'var(--color-tertiary-label)' : usageColor(ratio) }} />
    </span>
  );
}
