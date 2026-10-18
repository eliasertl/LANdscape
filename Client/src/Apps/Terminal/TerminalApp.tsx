import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import '@xterm/xterm/css/xterm.css';
import type { TerminalServerMessage } from '@landscape/shared';
import type { AppWindowProps } from '../Types';
import { wsUrl } from '../../Api/Http';
import { useWindowStore } from '../../Store/WindowStore';
import { Button } from '../../Components/Button';
import { useMediaQuery } from '../../Hooks/UseMediaQuery';
import styles from './TerminalApp.module.css';

const LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#1d1d1f',
  cursor: '#1d1d1f',
  selectionBackground: 'rgba(0, 122, 255, 0.25)',
  black: '#000000',
  red: '#c41e3a',
  green: '#1f8a3b',
  yellow: '#b8860b',
  blue: '#0a64d8',
  magenta: '#a333c8',
  cyan: '#0d8b9f',
  white: '#bfbfbf',
  brightBlack: '#666666',
  brightRed: '#ff3b30',
  brightGreen: '#34c759',
  brightYellow: '#ffcc00',
  brightBlue: '#007aff',
  brightMagenta: '#af52de',
  brightCyan: '#32ade6',
  brightWhite: '#ffffff',
};

const DARK_THEME = {
  background: '#000000',
  foreground: '#f2f2f7',
  cursor: '#f2f2f7',
  selectionBackground: 'rgba(10, 132, 255, 0.35)',
  black: '#1c1c1e',
  red: '#ff453a',
  green: '#30d158',
  yellow: '#ffd60a',
  blue: '#0a84ff',
  magenta: '#bf5af2',
  cyan: '#64d2ff',
  white: '#d1d1d6',
  brightBlack: '#636366',
  brightRed: '#ff6961',
  brightGreen: '#4cd964',
  brightYellow: '#ffe066',
  brightBlue: '#409cff',
  brightMagenta: '#da8fff',
  brightCyan: '#70d7ff',
  brightWhite: '#ffffff',
};

type Status = 'connecting' | 'connected' | 'closed' | 'error';

/** Interactive SSH shell: xterm.js in the browser, ssh2 on the server, one WebSocket per window. */
export default function TerminalApp({ windowId }: AppWindowProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [message, setMessage] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  const themeAttr = typeof document !== 'undefined' ? document.documentElement.dataset.theme : 'dark';
  const isDark = themeAttr ? themeAttr === 'dark' : dark;
  const setTitle = useWindowStore((s) => s.setTitle);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: 5000,
      allowProposedApi: true,
      theme: isDark ? DARK_THEME : LIGHT_THEME,
      macOptionIsMeta: true,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri, '_blank', 'noopener')));
    terminal.loadAddon(new ClipboardAddon());
    terminal.open(host);
    fit.fit();

    const socket = new WebSocket(wsUrl(`/ws/terminal?cols=${terminal.cols}&rows=${terminal.rows}`));
    socket.binaryType = 'arraybuffer';
    setStatus('connecting');
    setMessage(null);

    socket.addEventListener('open', () => {
      // Resize once more in case the layout settled after the socket was created.
      socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
    });
    socket.addEventListener('message', (event) => {
      if (event.data instanceof ArrayBuffer) {
        terminal.write(new Uint8Array(event.data));
        return;
      }
      try {
        const parsed = JSON.parse(String(event.data)) as TerminalServerMessage;
        if (parsed.type === 'ready') setStatus('connected');
        else if (parsed.type === 'exit') {
          setStatus('closed');
          setMessage(`The shell exited${parsed.code !== null ? ` with code ${parsed.code}` : ''}.`);
        } else if (parsed.type === 'error') {
          setStatus('error');
          setMessage(parsed.message);
        }
      } catch {
        terminal.write(String(event.data));
      }
    });
    socket.addEventListener('close', () => {
      setStatus((s) => (s === 'error' ? s : 'closed'));
      setMessage((m) => m ?? 'Connection closed.');
    });
    socket.addEventListener('error', () => {
      setStatus('error');
      setMessage('Could not connect to the terminal WebSocket.');
    });

    const encoder = new TextEncoder();
    const dataDisposable = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(encoder.encode(data));
    });
    const binaryDisposable = terminal.onBinary((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(Uint8Array.from(data, (c) => c.charCodeAt(0)));
    });
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'resize', cols, rows }));
    });
    const titleDisposable = terminal.onTitleChange((title) => {
      if (title.trim()) setTitle(windowId, `Terminal — ${title.trim().slice(0, 60)}`);
    });

    // Ctrl+Shift+C / Ctrl+Shift+V copy & paste (Ctrl+C stays the interrupt).
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'c' && terminal.hasSelection()) {
        void navigator.clipboard?.writeText(terminal.getSelection());
        return false;
      }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'v') {
        void navigator.clipboard?.readText().then((text) => terminal.paste(text)).catch(() => undefined);
        return false;
      }
      return true;
    });

    // Right-click pastes (common terminal convention); selection + right-click copies first.
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (terminal.hasSelection()) {
        void navigator.clipboard?.writeText(terminal.getSelection());
        terminal.clearSelection();
        return;
      }
      void navigator.clipboard?.readText().then((text) => terminal.paste(text)).catch(() => undefined);
    };
    host.addEventListener('contextmenu', onContextMenu);

    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // host may be hidden (minimized)
      }
    });
    observer.observe(host);
    terminal.focus();

    return () => {
      observer.disconnect();
      host.removeEventListener('contextmenu', onContextMenu);
      dataDisposable.dispose();
      binaryDisposable.dispose();
      resizeDisposable.dispose();
      titleDisposable.dispose();
      socket.close();
      terminal.dispose();
    };
    // Theme changes recreate the terminal (rare); generation reconnects after a close.
  }, [isDark, generation, windowId, setTitle]);

  return (
    <div className={styles.app}>
      <div ref={hostRef} className={styles.terminal} />
      {status !== 'connected' && (
        <div className={`${styles.overlay} ${status === 'connecting' ? styles.connecting : ''}`}>
          {status === 'connecting' ? (
            <span>Connecting to the host…</span>
          ) : (
            <>
              <span className={styles.overlayText}>{message ?? 'Disconnected.'}</span>
              <Button variant="primary" onClick={() => setGeneration((g) => g + 1)}>
                Reconnect
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
