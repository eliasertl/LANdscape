import { useEffect, useState } from 'react';
import { setUnauthorizedHandler } from './Api/Http';
import { useSessionStore } from './Store/SessionStore';
import { LockScreen } from './LockScreen/LockScreen';
import { Desktop } from './Desktop/Desktop';
import { Spinner } from './Components/Spinner';
import { applyTheme, watchSystemTheme } from './Design/Theme';
import { StartupAnimation } from './Startup/StartupAnimation';
import { isSafeMode } from './Platform/SafeMode';
import styles from './App.module.css';

export function App() {
  const status = useSessionStore((s) => s.status);
  const refresh = useSessionStore((s) => s.refresh);
  const lockedByServer = useSessionStore((s) => s.lockedByServer);
  const startup = useSessionStore((s) => s.startup);
  // The page-load animation plays once per load, before the lock screen (Settings → Startup → "When").
  const [bootDone, setBootDone] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler((kind) => lockedByServer(kind === 'locked'));
    void refresh();
    applyTheme(readStoredTheme(), false);
    return watchSystemTheme();
  }, [refresh, lockedByServer]);

  if (status === 'loading') {
    return (
      <div className={styles.boot}>
        <Spinner size={28} />
      </div>
    );
  }
  const boot = !bootDone && startup && !isSafeMode() ? <StartupAnimation settings={startup} userGesture={false} onDone={() => setBootDone(true)} /> : null;
  if (status === 'locked') {
    return (
      <>
        <LockScreen />
        {boot}
      </>
    );
  }
  return (
    <>
      <Desktop />
      {boot}
    </>
  );
}

function readStoredTheme(): 'light' | 'dark' | 'system' {
  try {
    const stored = localStorage.getItem('landscape.theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // ignore
  }
  return 'system';
}
