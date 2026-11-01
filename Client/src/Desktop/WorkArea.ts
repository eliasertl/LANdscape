import { DEFAULT_SETTINGS, taskbarInset, type Settings } from '@landscape/shared';
import { useDesktopStore } from '../Store/DesktopStore';
import { layoutViewport } from '../Design/Scale';
import { isSafeMode } from '../Platform/SafeMode';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The taskbar settings in effect: safe mode falls back to the default floating bar. */
export function effectiveTaskbar(): Settings['taskbar'] {
  const taskbar = useDesktopStore.getState().settings?.taskbar ?? DEFAULT_SETTINGS.taskbar;
  return isSafeMode() ? { ...DEFAULT_SETTINGS.taskbar, pinned: taskbar.pinned, clock: taskbar.clock } : taskbar;
}

/** What the taskbar takes from each edge of the screen (layout px). */
export function screenInset(): { top: number; right: number; bottom: number; left: number } {
  return taskbarInset(effectiveTaskbar());
}

/**
 * The area windows and desktop items may occupy: the viewport minus the
 * taskbar's edge. Maximized and snapped windows fill exactly this rect.
 */
export function workArea(): Rect {
  const viewport = layoutViewport();
  const inset = screenInset();
  return {
    x: inset.left,
    y: inset.top,
    width: Math.max(200, viewport.width - inset.left - inset.right),
    height: Math.max(200, viewport.height - inset.top - inset.bottom),
  };
}
