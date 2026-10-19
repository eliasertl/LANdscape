import { useEffect, useState } from 'react';
import { ArrowsClockwise, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import type { ProxyOverview } from '@landscape/shared';
import { api, errorMessage } from '../../Api/Http';
import { useDesktopStore } from '../../Store/DesktopStore';
import { Button } from '../../Components/Button';
import { Spinner } from '../../Components/Spinner';
import { Toggle } from '../../Components/Toggle';
import { toast } from '../../Components/Toast';
import styles from './SettingsApp.module.css';

export function ProxySection() {
  const settings = useDesktopStore((s) => s.settings);
  const updateSettings = useDesktopStore((s) => s.updateSettings);
  // Reload when assignments change (a shortcut was added, edited or deleted while Settings is open).
  const assignmentKey = useDesktopStore((s) => s.shortcuts.map((x) => `${x.id}:${x.proxyPort ?? ''}`).join(','));
  const [overview, setOverview] = useState<ProxyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await api.get<ProxyOverview>('/api/proxy'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [assignmentKey]);

  const setBadge = (on: boolean) => {
    void updateSettings({ proxyIndicator: on ? 'badge' : 'none' }).catch((err: unknown) => toast.error(errorMessage(err)));
  };

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Embed proxy</h3>
        <p className="text-callout text-secondary">
          Sites that forbid being shown inside another page are served on their own LANdscape port with that restriction removed. Only you, while logged in to LANdscape, can reach those ports.
        </p>
        <div className={styles.group}>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <span className={styles.rowLabel}>Show proxy badge</span>
              <span className={styles.rowDetail}>A small mark next to the window title for sites shown through the proxy.</span>
            </div>
            <Toggle checked={settings?.proxyIndicator !== 'none'} onChange={setBadge} />
          </div>
        </div>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>
            Ports{' '}
            {overview && (
              <span className={styles.sectionCount} data-proxy-usage>
                {overview.used} of {overview.total} in use
              </span>
            )}
          </h3>
          <Button size="small" icon={<ArrowsClockwise />} loading={loading} onClick={() => void load()}>
            Refresh
          </Button>
        </div>
        {error && <p className="text-callout" style={{ color: 'var(--color-destructive)' }}>{error}</p>}
        {overview === null && !error ? (
          <Spinner size={16} />
        ) : overview && overview.ports.length === 0 ? (
          <p className="text-callout text-secondary">
            No shortcut uses the proxy. Ports {overview.start}–{overview.end} are reserved and stay closed until one does.
          </p>
        ) : (
          overview && (
            <div className={styles.group}>
              {overview.ports.map((entry) => (
                <div key={entry.port} className={styles.row} data-proxy-port={entry.port}>
                  <div className={styles.rowText}>
                    <span className={styles.rowLabel}>
                      <span className={styles.mono}>:{entry.port}</span> {entry.name}
                    </span>
                    <span className={styles.rowDetail}>{entry.target}</span>
                    {entry.error && <span className={styles.rowHint}>{entry.error}</span>}
                  </div>
                  {entry.listening ? (
                    <span className={`${styles.status} ${styles.statusOk}`}>
                      <CheckCircle weight="fill" /> Listening
                    </span>
                  ) : (
                    <span className={`${styles.status} ${styles.statusBad}`}>
                      <WarningCircle weight="fill" /> Not listening
                    </span>
                  )}
                </div>
              ))}
            </div>
          )
        )}
        {overview && overview.waiting.length > 0 && (
          <p className="text-footnote" style={{ color: 'var(--system-orange)' }}>
            Waiting for a free port (they offer a new tab until then): {overview.waiting.map((w) => w.name).join(', ')}. Free a port or widen PROXY_PORT_START/END.
          </p>
        )}
        <p className="text-footnote text-secondary">
          Apps that build links to their own original address in JavaScript can still leave the proxy. The proxy ports use plain HTTP, so they only work while LANdscape itself is opened over HTTP.
        </p>
      </section>
    </>
  );
}
