import { useEffect, useState, type FormEvent } from 'react';
import { Cube, FileText, Newspaper } from '@phosphor-icons/react';
import type { ContainerInfo, LogSource } from '@landscape/shared';
import type { AppWindowProps } from '../Types';
import { api } from '../../Api/Http';
import { useDesktopStore } from '../../Store/DesktopStore';
import { Button } from '../../Components/Button';
import { Segmented, Select } from '../../Components/Select';
import { TextField } from '../../Components/TextField';
import { Toggle } from '../../Components/Toggle';
import { SetupState } from '../../Components/SetupState';
import { LogStreamView } from '../../Components/LogStreamView';
import styles from './LogViewerApp.module.css';

type SourceKind = 'docker' | 'journal' | 'file';

/** Three log sources (Docker, journalctl via SSH, file via SFTP) feeding one streaming view. */
export default function LogViewerApp({ params }: AppWindowProps) {
  const integrations = useDesktopStore((s) => s.integrations);
  const initialKind = (typeof params.source === 'string' ? params.source : integrations.docker ? 'docker' : 'journal') as SourceKind;
  const [kind, setKind] = useState<SourceKind>(initialKind);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [containerId, setContainerId] = useState<string>(typeof params.containerId === 'string' ? params.containerId : '');
  const [unit, setUnit] = useState<string>(typeof params.unit === 'string' ? params.unit : '');
  const [filePath, setFilePath] = useState<string>(typeof params.path === 'string' ? params.path : '/var/log/syslog');
  const [lines, setLines] = useState(500);
  const [follow, setFollow] = useState(true);
  const [source, setSource] = useState<LogSource | null>(null);

  useEffect(() => {
    if (!integrations.docker) return;
    api
      .get<ContainerInfo[]>('/api/docker/containers')
      .then((list) => {
        setContainers(list);
        setContainerId((current) => current || list[0]?.id || '');
      })
      .catch(() => setContainers([]));
  }, [integrations.docker]);

  // Auto-open when launched with a concrete source (e.g. from the Docker app).
  useEffect(() => {
    if (typeof params.containerId === 'string' && params.containerId) setSource({ source: 'docker', containerId: params.containerId, tail: 500, follow: true });
    else if (typeof params.path === 'string' && params.path) setSource({ source: 'file', path: params.path, follow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = (event?: FormEvent) => {
    event?.preventDefault();
    if (kind === 'docker' && containerId) setSource({ source: 'docker', containerId, tail: lines, follow });
    else if (kind === 'journal') setSource({ source: 'journal', unit: unit.trim() || null, lines, follow });
    else if (kind === 'file' && filePath.trim().startsWith('/')) setSource({ source: 'file', path: filePath.trim(), follow });
  };

  const needsSsh = kind !== 'docker' && !integrations.ssh;
  const needsDocker = kind === 'docker' && !integrations.docker;

  return (
    <div className={styles.app}>
      <form className={styles.sourceBar} onSubmit={start}>
        <Segmented
          ariaLabel="Log source"
          value={kind}
          onChange={(value) => {
            setKind(value);
            setSource(null);
          }}
          options={[
            { value: 'docker', label: 'Docker', icon: <Cube /> },
            { value: 'journal', label: 'Journal', icon: <Newspaper /> },
            { value: 'file', label: 'File', icon: <FileText /> },
          ]}
        />
        {kind === 'docker' && (
          <Select
            aria-label="Container"
            value={containerId}
            onChange={setContainerId}
            options={containers.length > 0 ? containers.map((c) => ({ value: c.id, label: `${c.name} (${c.state})` })) : [{ value: '', label: integrations.docker ? 'No containers' : 'Docker not available' }]}
            disabled={!integrations.docker}
            className={styles.grow}
          />
        )}
        {kind === 'journal' && <TextField aria-label="Unit filter" placeholder="Unit (optional), e.g. docker.service or ssh" value={unit} onChange={(e) => setUnit(e.target.value)} className={styles.grow} spellCheck={false} />}
        {kind === 'file' && <TextField aria-label="File path" placeholder="/var/log/syslog" value={filePath} onChange={(e) => setFilePath(e.target.value)} className={styles.grow} spellCheck={false} />}
        {kind !== 'file' && (
          <Select
            aria-label="Lines"
            value={String(lines)}
            onChange={(v) => setLines(Number(v))}
            options={[100, 500, 2000, 5000].map((n) => ({ value: String(n), label: `${n} lines` }))}
          />
        )}
        <Toggle label="Follow" checked={follow} onChange={setFollow} />
        <Button type="submit" variant="primary" disabled={needsSsh || needsDocker || (kind === 'docker' && !containerId)}>
          Open
        </Button>
      </form>
      {needsSsh ? (
        <SetupState integration="ssh" appName="Log Viewer (journal and file sources)" />
      ) : needsDocker ? (
        <SetupState integration="docker" appName="Log Viewer (Docker source)" />
      ) : (
        <LogStreamView source={source} />
      )}
    </div>
  );
}
