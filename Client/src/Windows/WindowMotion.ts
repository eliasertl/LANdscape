import { SPRING, reducedMotion, type SpringConfig } from '../Design/Spring';
import { useDesktopStore } from '../Store/DesktopStore';

/** Window animation springs per Settings → Windows → Animation speed; `off` (or reduced motion) jumps. */
export function windowMotion(): { off: boolean; open: SpringConfig; move: SpringConfig; bounce: SpringConfig } {
  const speed = useDesktopStore.getState().settings?.windows.animation ?? 'normal';
  if (speed === 'off' || reducedMotion()) return { off: true, open: SPRING.window, move: SPRING.standard, bounce: SPRING.bounce };
  if (speed === 'fast') {
    return {
      off: false,
      open: { response: 0.14, dampingFraction: 1 },
      move: { response: 0.16, dampingFraction: 1 },
      bounce: { response: 0.2, dampingFraction: 0.9 },
    };
  }
  return { off: false, open: SPRING.window, move: SPRING.standard, bounce: SPRING.bounce };
}
