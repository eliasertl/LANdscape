import { useEffect, useState } from 'react';
import { ArrowSquareOut, ShieldWarning } from '@phosphor-icons/react';
import type { Shortcut } from '@landscape/shared';
import { useDesktopStore, proxyTotal } from '../Store/DesktopStore';
import { Button } from '../Components/Button';
import { Spinner } from '../Components/Spinner';
import { resolveShortcutFrame } from './ShortcutFrame';
import styles from './IframeContent.module.css';

/**
 * Proxied sites forbid framing, so they often also carry JavaScript frame-busters
 * (`top.location = …`) that would navigate the whole LANdscape tab away. Everything a
 * normal page needs stays allowed; only navigating the top window is not.
 */
const PROXY_SANDBOX = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-modals',
  'allow-downloads',
  'allow-pointer-lock',
  'allow-presentation',
  'allow-orientation-lock',
  'allow-storage-access-by-user-activation',
  'allow-top-navigation-to-custom-protocols',
].join(' ');

export function IframeContent({ shortcut }: { shortcut: Shortcut }) {
  const total = useDesktopStore((s) => proxyTotal(s.proxy));
  const frame = resolveShortcutFrame(shortcut, total);
  const src = frame.kind === 'blocked' ? null : frame.url;
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [src]);

  if (frame.kind === 'blocked') {
    return (
      <div className={styles.blocked}>
        <div className={styles.blockedIcon}>
          <ShieldWarning weight="duotone" />
        </div>
        <h3 className="text-title3 emphasized">{frame.title}</h3>
        <p className={`${styles.detail} text-callout text-secondary`}>{frame.detail}</p>
        <Button variant="primary" icon={<ArrowSquareOut weight="bold" />} onClick={() => window.open(shortcut.url, '_blank', 'noopener')}>
          Open in new tab
        </Button>
        {frame.hint && <p className={`${styles.hint} text-footnote text-tertiary`}>{frame.hint}</p>}
      </div>
    );
  }

  return (
    <div className={styles.frameHost}>
      {!loaded && (
        <div className={styles.loading}>
          <Spinner size={22} />
          <span className="text-callout text-secondary">{slow ? 'Still loading… the site may be slow or offline.' : `Loading ${shortcut.name}…`}</span>
          {slow && (
            <Button size="small" icon={<ArrowSquareOut />} onClick={() => window.open(shortcut.url, '_blank', 'noopener')}>
              Open in new tab
            </Button>
          )}
        </div>
      )}
      <iframe
        key={frame.url}
        className={styles.frame}
        src={frame.url}
        title={shortcut.name}
        onLoad={() => setLoaded(true)}
        allow="clipboard-read; clipboard-write; fullscreen; autoplay; camera; microphone; geolocation; display-capture"
        referrerPolicy="no-referrer-when-downgrade"
        sandbox={frame.kind === 'proxy' ? PROXY_SANDBOX : undefined}
        data-frame-kind={frame.kind}
      />
    </div>
  );
}
