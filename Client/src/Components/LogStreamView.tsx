import { useEffect, useRef, useState } from 'react';
import { ArrowLineDown, Pause, Play, Trash, TextAlignLeft } from '@phosphor-icons/react';
import type { LogSource, LogsServerMessage } from '@landscape/shared';
import { wsUrl } from '../Api/Http';
import { Button } from './Button';
import { TextField } from './TextField';
import styles from './LogStreamView.module.css';

const MAX_LINES = 5000;

type Status = 'idle' | 'connecting' | 'streaming' | 'ended' | 'error';

/** Streams one log source over /ws/logs with follow, pause, filter and clear. */
export function LogStreamView({ source }: { source: LogSource | null }) {
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [detail, setDetail] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [follow, setFollow] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [filter, setFilter] = useState('');
  const [generation, setGeneration] = useState(0);
  const bodyRef = useRef<HTMLPreElement>(null);
  const pausedRef = useRef(false);
  const bufferRef = useRef<string[]>([]);
  const partialRef = useRef('');
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const key = source ? JSON.stringify(source) : null;

  useEffect(() => {
    setLines([]);
    bufferRef.current = [];
    partialRef.current = '';
    setDetail(null);
    if (!source) {
      setStatus('idle');
      return;
    }
    setStatus('connecting');
    const socket = new WebSocket(wsUrl('/ws/logs'));
    let flushTimer: number | null = null;
    const flush = () => {
      flushTimer = null;
      if (bufferRef.current.length === 0) return;
      const next = bufferRef.current;
      bufferRef.current = [];
      setLines((current) => {
        const merged = current.concat(next);
        return merged.length > MAX_LINES ? merged.slice(merged.length - MAX_LINES) : merged;
      });
    };
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'open', ...source }));
      setStatus('streaming');
    });
    socket.addEventListener('message', (event) => {
      let message: LogsServerMessage;
      try {
        message = JSON.parse(String(event.data)) as LogsServerMessage;
      } catch {
        return;
      }
      if (message.type === 'chunk') {
        const text = partialRef.current + message.text.replace(/\r\n?/g, '\n');
        const parts = text.split('\n');
        partialRef.current = parts.pop() ?? '';
        if (!pausedRef.current) {
          bufferRef.current.push(...parts);
          if (flushTimer === null) flushTimer = window.setTimeout(flush, 80);
        }
      } else if (message.type === 'end') {
        if (partialRef.current) {
          bufferRef.current.push(partialRef.current);
          partialRef.current = '';
        }
        flush();
        setStatus('ended');
        setDetail(message.reason);
      } else if (message.type === 'error') {
        setStatus('error');
        setDetail(message.message);
      }
    });
    socket.addEventListener('close', () => {
      setStatus((s) => (s === 'error' || s === 'ended' ? s : 'ended'));
    });
    socket.addEventListener('error', () => {
      setStatus('error');
      setDetail('WebSocket connection failed.');
    });
    return () => {
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, generation]);

  useEffect(() => {
    if (!follow || paused) return;
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [lines, follow, paused]);

  const onScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 24;
    if (!atBottom && follow) setFollow(false);
    if (atBottom && !follow) setFollow(true);
  };

  const needle = filter.trim().toLowerCase();
  const shown = needle ? lines.filter((l) => l.toLowerCase().includes(needle)) : lines;

  return (
    <div className={styles.view}>
      <div className={styles.toolbar}>
        <TextField placeholder="Filter lines…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter log lines" className={styles.filter} />
        <Button size="small" icon={paused ? <Play /> : <Pause />} onClick={() => setPaused((p) => !p)} aria-pressed={paused} title={paused ? 'Resume' : 'Pause'}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button size="small" icon={<ArrowLineDown />} aria-pressed={follow} title="Scroll to the end as new lines arrive" onClick={() => setFollow((f) => !f)}>
          Follow
        </Button>
        <Button size="small" icon={<TextAlignLeft />} aria-pressed={wrap} title="Wrap long lines" onClick={() => setWrap((w) => !w)}>
          Wrap
        </Button>
        <Button size="small" icon={<Trash />} onClick={() => setLines([])} title="Clear">
          Clear
        </Button>
        {(status === 'ended' || status === 'error') && (
          <Button size="small" variant="primary" onClick={() => setGeneration((g) => g + 1)}>
            Reconnect
          </Button>
        )}
      </div>
      <pre ref={bodyRef} className={`${styles.body} ${wrap ? styles.wrap : ''} scroll selectable`} onScroll={onScroll}>
        {shown.length === 0 && status === 'streaming' && <span className={styles.muted}>Waiting for output…</span>}
        {shown.join('\n')}
      </pre>
      <div className={`${styles.status} ${status === 'error' ? styles.statusError : ''}`}>
        <span>
          {status === 'idle' && 'Choose a source.'}
          {status === 'connecting' && 'Connecting…'}
          {status === 'streaming' && (paused ? 'Paused' : 'Streaming')}
          {status === 'ended' && `Ended${detail ? ` (${detail})` : ''}`}
          {status === 'error' && (detail ?? 'Error')}
        </span>
        <span>
          {shown.length}
          {needle ? ` / ${lines.length}` : ''} lines
        </span>
      </div>
    </div>
  );
}
