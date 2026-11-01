import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { InstalledApp } from '@landscape/shared';
import { registerFrame, type FrameHost } from '../Platform/AppBroker';
import { Spinner } from '../Components/Spinner';
import styles from './AppFrame.module.css';

interface AppFrameProps {
  app: InstalledApp;
  surface: 'window' | 'widget' | 'tray' | 'taskbar' | 'startup' | 'background';
  surfaceId: string;
  params?: Record<string, unknown>;
  phone?: boolean;
  ui?: FrameHost['ui'];
  /** Gets the frame window once mounted (for events such as params updates). */
  onWindow?: (target: Window | null) => void;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * One sandboxed app surface. `sandbox="allow-scripts"` without
 * allow-same-origin gives the frame an opaque origin: it cannot read
 * LANdscape's cookies, DOM or API. The document comes from the server with
 * everything inlined (Server/src/Apps/FrameInjector.ts) and a CSP that
 * forbids network access; all it can do is talk to the broker.
 */
export function AppFrame({ app, surface, surfaceId, params, phone, ui, onWindow, className, style, title }: AppFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [nonce] = useState(randomNonce);
  const [loaded, setLoaded] = useState(false);
  const src = useMemo(() => {
    const query = new URLSearchParams({ nonce, phone: phone ? '1' : '0' });
    if (params && Object.keys(params).length > 0) query.set('params', JSON.stringify(params));
    return `/apps/frame/${encodeURIComponent(app.id)}/${surface}/${encodeURIComponent(surfaceId)}?${query.toString()}`;
    // Params only matter at load; later changes go through the "params" event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id, app.version, surface, surfaceId, nonce, phone]);

  useEffect(() => {
    const target = ref.current?.contentWindow;
    if (!target) return;
    const unregister = registerFrame({ app, surface, surfaceId, nonce, window: target, ui: ui ?? {} });
    onWindow?.(target);
    return () => {
      unregister();
      onWindow?.(null);
    };
    // The frame identity is fixed for the iframe's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <div className={`${styles.host} ${className ?? ''}`} style={style}>
      {!loaded && surface !== 'background' && (
        <div className={styles.loading}>
          <Spinner size={20} />
        </div>
      )}
      <iframe
        ref={ref}
        key={src}
        className={styles.frame}
        src={src}
        title={title ?? `${app.manifest.name} (${surface})`}
        sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        data-app-frame={app.id}
        data-app-surface={surface}
      />
    </div>
  );
}
