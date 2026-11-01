import { useEffect, useState } from 'react';
import { useDesktopStore } from '../Store/DesktopStore';
import { useSessionStore } from '../Store/SessionStore';
import { isSafeMode } from '../Platform/SafeMode';
import { StartupAnimation } from './StartupAnimation';

/** Plays the startup animation once after each login or unlock when Settings → Startup says "after login" or "both". */
export function AfterLoginAnimation() {
  const startup = useDesktopStore((s) => s.settings?.startup);
  const unlockCount = useSessionStore((s) => s.unlockCount);
  const [playedFor, setPlayedFor] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!startup || unlockCount === 0 || unlockCount === playedFor || isSafeMode()) return;
    if (startup.when !== 'login' && startup.when !== 'both') return;
    setPlayedFor(unlockCount);
    setVisible(true);
  }, [startup, unlockCount, playedFor]);

  if (!visible || !startup) return null;
  return <StartupAnimation settings={startup} userGesture onDone={() => setVisible(false)} />;
}
