import { useEffect } from 'react';
import { setUnauthorizedHandler } from './Api/Http';
import { useSessionStore } from './Store/SessionStore';
import { LockScreen } from './LockScreen/LockScreen';
import { Desktop } from './Desktop/Desktop';
import { Spinner } from './Components/Spinner';
import { applyTheme, watchSystemTheme } from './Design/Theme';
import styles from './App.module.css';

export function App() {
  const status = useSessionStore((s) => s.status);
  const refresh = useSessionStore((s) => s.refresh);
  const lock = useSessionStore((s) => s.lock);

  useEffect(() => {
    setUnauthorizedHandler(lock);
    void refresh();
    applyTheme(readStoredTheme(), false);
    return watchSystemTheme();
  }, [refresh, lock]);

  if (status === 'loading') {
    return (
      <div className={styles.boot}>
        <Spinner size={28} />
      </div>
    );
  }
  if (status === 'locked') return <LockScreen />;
  return <Desktop />;
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
