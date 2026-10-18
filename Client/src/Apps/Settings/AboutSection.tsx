import { useEffect, useState } from 'react';
import { ArrowsClockwise, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import type { IntegrationStatus, SystemStatus } from '@landscape/shared';
import { api, errorMessage } from '../../Api/Http';
import { Button } from '../../Components/Button';
import { Spinner } from '../../Components/Spinner';
import styles from './SettingsApp.module.css';

const ROWS: { key: keyof Omit<SystemStatus, 'version'>; label: string }[] = [
  { key: 'ssh', label: 'SSH to host' },
  { key: 'docker', label: 'Docker socket' },
  { key: 'hostProc', label: 'Host /proc' },
  { key: 'hostSys', label: 'Host /sys' },
  { key: 'hostRoot', label: 'Host root (disk usage)' },
];

export function AboutSection() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await api.get<SystemStatus>('/api/system/status'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>LANdscape</h3>
        <div className={styles.group}>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <span className={styles.rowLabel}>Version</span>
              <span className={styles.rowDetail}>{status?.version ?? '…'}</span>
            </div>
            <a href="https://github.com/eliasertl/LANdscape" target="_blank" rel="noreferrer noopener">
              GitHub
            </a>
          </div>
        </div>
      </section>
      <section className={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className={styles.sectionTitle}>Integrations</h3>
          <Button size="small" icon={<ArrowsClockwise />} loading={loading} onClick={() => void load()}>
            Re-check
          </Button>
        </div>
        {error && <p className="text-callout" style={{ color: 'var(--color-destructive)' }}>{error}</p>}
        <div className={styles.group}>
          {ROWS.map((row) => (
            <StatusRow key={row.key} label={row.label} status={status ? status[row.key] : null} />
          ))}
        </div>
        <p className="text-footnote text-secondary">The Docker socket grants root-equivalent access to the host. The SSH key acts with the permissions of the SSH user.</p>
      </section>
    </>
  );
}

function StatusRow({ label, status }: { label: string; status: IntegrationStatus | null }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        {status && <span className={styles.rowDetail}>{status.detail}</span>}
        {status?.hint && !status.ok && <span className={styles.rowHint}>{status.hint}</span>}
      </div>
      {status === null ? (
        <Spinner size={14} />
      ) : status.ok ? (
        <span className={`${styles.status} ${styles.statusOk}`}>
          <CheckCircle weight="fill" /> OK
        </span>
      ) : (
        <span className={`${styles.status} ${styles.statusBad}`}>
          <WarningCircle weight="fill" /> Not available
        </span>
      )}
    </div>
  );
}
