import { useMemo } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '@landscape/shared';
import { useDesktopStore } from '../Store/DesktopStore';
import { isSafeMode } from '../Platform/SafeMode';

/** The taskbar settings in effect, re-rendering on change; safe mode shows the default floating bar. */
export function useEffectiveTaskbar(): Settings['taskbar'] {
  const taskbar = useDesktopStore((s) => s.settings?.taskbar);
  return useMemo(() => {
    const current = taskbar ?? DEFAULT_SETTINGS.taskbar;
    return isSafeMode() ? { ...DEFAULT_SETTINGS.taskbar, pinned: current.pinned, clock: current.clock } : current;
  }, [taskbar]);
}
