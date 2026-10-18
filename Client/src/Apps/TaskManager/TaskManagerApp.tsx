import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Skull } from '@phosphor-icons/react';
import type { ProcessInfo } from '@landscape/shared';
import type { AppWindowProps } from '../Types';
import { api, errorMessage } from '../../Api/Http';
import { useDesktopStore } from '../../Store/DesktopStore';
import { useUiStore } from '../../Store/UiStore';
import { useMetric } from '../../Widgets/UseMetric';
import { Button } from '../../Components/Button';
import { Select } from '../../Components/Select';
import { SetupState } from '../../Components/SetupState';
import { Spinner } from '../../Components/Spinner';
import { TextField } from '../../Components/TextField';
import { toast } from '../../Components/Toast';
import { formatBytes } from '../../Widgets/Format';
import styles from './TaskManagerApp.module.css';

type SortKey = 'pid' | 'name' | 'user' | 'cpuPercent' | 'memoryBytes';

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'pid', label: 'PID', className: styles.colPid },
  { key: 'name', label: 'Name' },
  { key: 'user', label: 'User', className: styles.colUser },
  { key: 'cpuPercent', label: 'CPU %', className: styles.colNum },
  { key: 'memoryBytes', label: 'Memory', className: styles.colNum },
];

/** Host processes from /host/proc, sortable and searchable; kill runs over SSH. */
export default function TaskManagerApp({ phone }: AppWindowProps) {
  const [intervalMs, setIntervalMs] = useState(3000);
  const [sortKey, setSortKey] = useState<SortKey>('cpuPercent');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [query, setQuery] = useState('');
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [killing, setKilling] = useState(false);
  const state = useMetric('processes', intervalMs);
  const sshAvailable = useDesktopStore((s) => s.integrations.ssh);
  const hostProc = useDesktopStore((s) => s.integrations.hostProc);
  const requestConfirm = useUiStore((s) => s.requestConfirm);

  const processes = useMemo(() => (state.status === 'ok' ? state.data.processes : []), [state]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? processes.filter((p) => p.name.toLowerCase().includes(q) || p.command.toLowerCase().includes(q) || p.user.toLowerCase().includes(q) || String(p.pid) === q) : processes;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir || a.pid - b.pid;
      return String(av).localeCompare(String(bv)) * dir || a.pid - b.pid;
    });
  }, [processes, query, sortKey, sortDir]);

  const selected = processes.find((p) => p.pid === selectedPid) ?? null;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'user' ? 'asc' : 'desc');
    }
  };

  const kill = (process: ProcessInfo, signal: 'TERM' | 'KILL') => {
    requestConfirm({
      title: signal === 'KILL' ? `Force kill “${process.name}” (PID ${process.pid})?` : `End “${process.name}” (PID ${process.pid})?`,
      message: signal === 'KILL' ? 'SIGKILL stops the process immediately without cleanup.' : 'SIGTERM asks the process to exit. Use “Force kill” if it does not respond.',
      confirmLabel: signal === 'KILL' ? 'Force kill' : 'End process',
      danger: true,
      onConfirm: async () => {
        setKilling(true);
        try {
          await api.post(`/api/processes/${process.pid}/kill`, { signal });
          toast.success(`Sent SIG${signal} to ${process.name} (${process.pid})`);
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setKilling(false);
        }
      },
    });
  };

  if (!hostProc) return <SetupState integration="hostProc" appName="Task Manager" />;

  return (
    <div className={`${styles.app} ${phone ? styles.phone : ''}`}>
      <div className={styles.toolbar}>
        <TextField placeholder="Search processes…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search processes" className={styles.search} />
        <Select
          aria-label="Refresh interval"
          value={String(intervalMs)}
          onChange={(v) => setIntervalMs(Number(v))}
          options={[
            { value: '1000', label: 'Every 1 s' },
            { value: '2000', label: 'Every 2 s' },
            { value: '3000', label: 'Every 3 s' },
            { value: '5000', label: 'Every 5 s' },
            { value: '10000', label: 'Every 10 s' },
          ]}
        />
        <Button variant="destructive" size="regular" icon={<Skull />} disabled={!selected || !sshAvailable || killing} onClick={() => selected && kill(selected, 'TERM')} title={sshAvailable ? 'Send SIGTERM' : 'Needs SSH'}>
          End process
        </Button>
        <Button variant="plain" disabled={!selected || !sshAvailable || killing} onClick={() => selected && kill(selected, 'KILL')} title={sshAvailable ? 'Send SIGKILL' : 'Needs SSH'}>
          Force kill
        </Button>
      </div>
      {!sshAvailable && <div className={styles.hint}>Ending processes needs SSH (set SSH_USER and the key). Process control is limited to what the SSH user may do.</div>}
      <div className={`${styles.list} scroll`}>
        {state.status === 'waiting' ? (
          <div className={styles.center}>
            <Spinner size={22} />
          </div>
        ) : state.status === 'unavailable' ? (
          <SetupState integration="hostProc" appName="Task Manager" detail={state.reason} />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key} className={col.className} aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className={styles.sortButton} onClick={() => toggleSort(col.key)}>
                      {col.label}
                      {sortKey === col.key && (sortDir === 'asc' ? <ArrowUp weight="bold" /> : <ArrowDown weight="bold" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 600).map((p) => (
                <tr
                  key={p.pid}
                  className={p.pid === selectedPid ? styles.selected : ''}
                  onClick={() => setSelectedPid(p.pid)}
                  onDoubleClick={() => sshAvailable && kill(p, 'TERM')}
                  title={p.command}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSelectedPid(p.pid);
                    if (e.key === 'Delete' && sshAvailable) kill(p, 'TERM');
                  }}
                >
                  <td className={`${styles.colPid} text-tabular`}>{p.pid}</td>
                  <td className={styles.nameCell}>
                    <span className="text-truncate">{p.name}</span>
                    <span className={`${styles.command} text-truncate`}>{p.command}</span>
                  </td>
                  <td className={`${styles.colUser} text-truncate`}>{p.user}</td>
                  <td className={`${styles.colNum} text-tabular`} style={p.cpuPercent >= 50 ? { color: 'var(--system-orange)' } : undefined}>
                    {p.cpuPercent.toFixed(1)}
                  </td>
                  <td className={`${styles.colNum} text-tabular`}>{formatBytes(p.memoryBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className={styles.statusBar}>
        <span>
          {processes.length} processes{state.status === 'ok' ? ` · ${state.data.cpuCount} cores` : ''}
        </span>
        <span>{shown.length > 600 ? `showing 600 of ${shown.length}` : selected ? `PID ${selected.pid} selected` : ''}</span>
      </div>
    </div>
  );
}
