import { ArrowDown, ArrowUp } from '@phosphor-icons/react';
import type { WidgetProps } from '../Types';
import { WidgetFrame } from '../WidgetFrame';
import { useHistory, useMetric } from '../UseMetric';
import { Sparkline } from '../../Components/Sparkline';
import { formatRate } from '../Format';
import styles from '../Widgets.module.css';

export function NetworkWidget({ widget }: WidgetProps) {
  const state = useMetric('network', widget.settings.intervalMs);
  const selected = typeof widget.settings.interface === 'string' ? widget.settings.interface : 'all';
  const interfaces = state.status === 'ok' ? state.data.interfaces : [];
  const shown = selected === 'all' ? interfaces : interfaces.filter((i) => i.name === selected);
  const rx = shown.reduce((sum, i) => sum + i.rxBytesPerSecond, 0);
  const tx = shown.reduce((sum, i) => sum + i.txBytesPerSecond, 0);
  const rxHistory = useHistory(state.status === 'ok' ? rx : null, 40);
  const txHistory = useHistory(state.status === 'ok' ? tx : null, 40);
  const showIps = widget.settings.showAddresses !== false;
  const addresses = shown.flatMap((i) => i.addresses.map((a) => ({ iface: i.name, address: a })));
  const height = 128 + (showIps ? Math.min(3, Math.ceil(addresses.length / 2)) * 20 : 0);

  return (
    <WidgetFrame widget={widget} title={selected === 'all' ? 'Network' : `Network · ${selected}`} width={260} height={height} unavailable={state.status === 'unavailable' ? state.reason : null}>
      {state.status === 'ok' ? (
        <div className={styles.stack}>
          <div className={styles.row}>
            <span className={styles.value} style={{ fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ArrowDown weight="bold" color="var(--system-green)" /> {formatRate(rx)}
            </span>
            <span className={styles.value} style={{ fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ArrowUp weight="bold" color="var(--system-blue)" /> {formatRate(tx)}
            </span>
          </div>
          <div style={{ position: 'relative', height: 36 }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              <Sparkline values={rxHistory} width={236} height={36} color="var(--system-green)" />
            </div>
            <div style={{ position: 'absolute', inset: 0 }}>
              <Sparkline values={txHistory} width={236} height={36} color="var(--system-blue)" />
            </div>
          </div>
          {showIps && addresses.length > 0 && (
            <div className={styles.ipList}>
              {addresses.slice(0, 6).map((a) => (
                <span key={`${a.iface}-${a.address}`} className={styles.ip} title={a.iface}>
                  {a.address}
                </span>
              ))}
            </div>
          )}
          {shown.length === 0 && <span className={styles.muted}>No interfaces found.</span>}
        </div>
      ) : (
        <div className={styles.waiting}>Waiting for data…</div>
      )}
    </WidgetFrame>
  );
}
