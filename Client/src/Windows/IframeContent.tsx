import { useEffect, useState } from 'react';
import { ArrowSquareOut, ShieldWarning } from '@phosphor-icons/react';
import type { Shortcut } from '@landscape/shared';
import { Button } from '../Components/Button';
import { Spinner } from '../Components/Spinner';
import styles from './IframeContent.module.css';

/** Why a shortcut cannot be embedded, or null when it can. */
export function embedBlockReason(shortcut: Shortcut): { title: string; detail: string } | null {
  if (shortcut.openMode === 'newtab') {
    return { title: 'Opens in a new tab', detail: 'This shortcut is set to always open in a new browser tab.' };
  }
  if (location.protocol === 'https:' && shortcut.url.startsWith('http:')) {
    return {
      title: 'Blocked as mixed content',
      detail: 'LANdscape is served over HTTPS, so the browser refuses to embed this plain-http site. Open it in a new tab instead.',
    };
  }
  if (shortcut.openMode === 'embed') return null;
  if (shortcut.embeddable === 'no') {
    return {
      title: "This site can't be embedded",
      detail: shortcut.embedReason ?? 'The site sends headers that forbid showing it inside another page.',
    };
  }
  return null;
}

export function IframeContent({ shortcut }: { shortcut: Shortcut }) {
  const blocked = embedBlockReason(shortcut);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [shortcut.url]);

  if (blocked) {
    return (
      <div className={styles.blocked}>
        <div className={styles.blockedIcon}>
          <ShieldWarning weight="duotone" />
        </div>
        <h3 className="text-title3 emphasized">{blocked.title}</h3>
        <p className={`${styles.detail} text-callout text-secondary`}>{blocked.detail}</p>
        <Button variant="primary" icon={<ArrowSquareOut weight="bold" />} onClick={() => window.open(shortcut.url, '_blank', 'noopener')}>
          Open in new tab
        </Button>
        {shortcut.embeddable === 'no' && shortcut.openMode === 'auto' && (
          <p className={`${styles.hint} text-footnote text-tertiary`}>Edit the shortcut and choose “Try embedding anyway” if you know the site allows it.</p>
        )}
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
        key={shortcut.url}
        className={styles.frame}
        src={shortcut.url}
        title={shortcut.name}
        onLoad={() => setLoaded(true)}
        allow="clipboard-read; clipboard-write; fullscreen; autoplay; camera; microphone; geolocation; display-capture"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
