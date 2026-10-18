import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowClockwise, ArrowsClockwise, Play, Scroll as ScrollText, Stop, X } from '@phosphor-icons/react';
import type { ContainerInfo } from '@landscape/shared';
import type { AppWindowProps } from '../Types';
import { api, errorMessage } from '../../Api/Http';
import { Button } from '../../Components/Button';
import { Spinner } from '../../Components/Spinner';
import { TextField } from '../../Components/TextField';
import { LogStreamView } from '../../Components/LogStreamView';
import { toast } from '../../Components/Toast';
import { formatDuration } from '../../Widgets/Format';
import styles from './DockerApp.module.css';

const REFRESH_MS = 5000;

function stateColor(state: string): string {
  if (state === 'running') return 'var(--system-green)';
  if (state === 'paused' || state === 'restarting') return 'var(--system-orange)';
  if (state === 'exited' || state === 'dead') return 'var(--system-gray)';
  return 'var(--system-blue)';
}

/** Container list with start/stop/restart and an inline live log pane. */
export default function DockerApp({ params, phone }: AppWindowProps) {
  const [containers, setContainers] = useState<ContainerInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const [logsFor, setLogsFor] = useState<ContainerInfo | null>(null);
  const [now, setNow] = useState(() => 0);

  const load = useCallback(async () => {
    try {
      const list = await api.get<ContainerInfo[]>('/api/docker/containers');
      setContainers(list);
      setError(null);
      setNow(Date.now());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const id = typeof params.containerId === 'string' ? params.containerId : null;
    if (id && containers) {
      const match = containers.find((c) => c.id === id || c.name === id);
      if (match) setLogsFor(match);
    }
  }, [params.containerId, containers]);

  const act = async (container: ContainerInfo, action: 'start' | 'stop' | 'restart') => {
    setBusy((b) => ({ ...b, [container.id]: action }));
    try {
      await api.post(`/api/docker/containers/${container.id}/${action}`);
      toast.success(`${container.name}: ${action === 'stop' ? 'stopped' : action === 'start' ? 'started' : 'restarted'}`);
      await load();
    } catch (err) {
      toast.error(`${container.name}: ${errorMessage(err)}`);
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[container.id];
        return next;
      });
    }
  };

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!containers) return [];
    if (!q) return containers;
    return containers.filter((c) => c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q) || c.state.includes(q));
  }, [containers, filter]);

  const running = containers?.filter((c) => c.state === 'running').length ?? 0;

  return (
    <div className={`${styles.app} ${phone ? styles.phone : ''}`}>
      <div className={styles.listPane} style={logsFor && !phone ? { flex: '0 0 55%' } : undefined}>
        <div className={styles.toolbar}>
          <TextField placeholder="Filter containers…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter containers" className={styles.filter} />
          <span className={styles.summary}>
            {containers ? `${running} running / ${containers.length}` : ''}
          </span>
          <Button variant="plain" icon={<ArrowClockwise />} aria-label="Refresh" title="Refresh" onClick={() => void load()} />
        </div>
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}
        <div className={`${styles.list} scroll`}>
          {containers === null && !error ? (
            <div className={styles.center}>
              <Spinner size={22} />
            </div>
          ) : shown.length === 0 ? (
            <div className={styles.center}>{containers?.length === 0 ? 'No containers.' : 'No matches.'}</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th className={styles.colImage}>Image</th>
                  <th className={styles.colPorts}>Ports</th>
                  <th className={styles.colUptime}>Uptime</th>
                  <th className={styles.colActions}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const isRunning = c.state === 'running';
                  const uptime = isRunning && c.startedAt ? formatDuration(Math.max(0, (now - new Date(c.startedAt).getTime()) / 1000)) : '—';
                  const ports = c.ports
                    .filter((p) => p.publicPort)
                    .map((p) => `${p.publicPort}→${p.privatePort}/${p.type}`)
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .join(', ');
                  const action = busy[c.id];
                  return (
                    <tr key={c.id} className={logsFor?.id === c.id ? styles.active : ''}>
                      <td className={styles.nameCell}>
                        <span className={styles.dot} style={{ background: stateColor(c.state) }} title={c.status} />
                        <span className={styles.nameText}>
                          <span className="text-truncate">{c.name}</span>
                          <span className={`${styles.status} text-truncate`}>{c.status}</span>
                        </span>
                      </td>
                      <td className={`${styles.colImage} text-truncate`} title={c.image}>
                        {c.image}
                      </td>
                      <td className={`${styles.colPorts} text-truncate`} title={ports}>
                        {ports || '—'}
                      </td>
                      <td className={`${styles.colUptime} text-tabular`}>{uptime}</td>
                      <td className={styles.colActions}>
                        <div className={styles.actions}>
                          {isRunning ? (
                            <Button size="small" icon={<Stop weight="fill" />} loading={action === 'stop'} disabled={Boolean(action)} onClick={() => void act(c, 'stop')} title="Stop">
                              Stop
                            </Button>
                          ) : (
                            <Button size="small" variant="primary" icon={<Play weight="fill" />} loading={action === 'start'} disabled={Boolean(action)} onClick={() => void act(c, 'start')} title="Start">
                              Start
                            </Button>
                          )}
                          <Button size="small" icon={<ArrowsClockwise />} loading={action === 'restart'} disabled={Boolean(action)} onClick={() => void act(c, 'restart')} title="Restart">
                            Restart
                          </Button>
                          <Button size="small" icon={<ScrollText />} aria-pressed={logsFor?.id === c.id} onClick={() => setLogsFor(logsFor?.id === c.id ? null : c)} title="Live logs">
                            Logs
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {logsFor && (
        <div className={styles.logPane}>
          <div className={styles.logHeader}>
            <span className="text-headline text-truncate">Logs · {logsFor.name}</span>
            <Button variant="plain" size="small" icon={<X weight="bold" />} aria-label="Close logs" onClick={() => setLogsFor(null)} />
          </div>
          <LogStreamView source={{ source: 'docker', containerId: logsFor.id, tail: 500, follow: true }} />
        </div>
      )}
    </div>
  );
}
