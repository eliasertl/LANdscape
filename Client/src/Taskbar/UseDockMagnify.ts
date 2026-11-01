import { useEffect, type RefObject } from 'react';
import { SpringValue, reducedMotion } from '../Design/Spring';

const MAX_SCALE = 1.45;
const RADIUS = 110;
const CONFIG = { response: 0.22, dampingFraction: 0.85 };

/**
 * macOS-dock magnification: items near the pointer scale up, driven by one
 * spring per item so entering and leaving feel soft. Off under reduced
 * motion and for the other taskbar styles.
 */
export function useDockMagnify(containerRef: RefObject<HTMLElement | null>, enabled: boolean, vertical: boolean): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container || reducedMotion()) return;
    const springs = new Map<HTMLElement, SpringValue>();
    const springFor = (element: HTMLElement) => {
      let spring = springs.get(element);
      if (!spring) {
        spring = new SpringValue(1, CONFIG, 0.002);
        spring.onChange((value) => {
          element.style.transform = `scale(${value})`;
          element.style.transformOrigin = vertical ? 'left center' : 'center bottom';
          element.style.zIndex = value > 1.01 ? '1' : '';
        });
        springs.set(element, spring);
      }
      return spring;
    };
    const items = () => [...container.querySelectorAll<HTMLElement>('[data-taskbar-app]')];
    const onMove = (event: PointerEvent) => {
      for (const element of items()) {
        const rect = element.getBoundingClientRect();
        const center = vertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
        const distance = Math.abs((vertical ? event.clientY : event.clientX) - center);
        const target = 1 + (MAX_SCALE - 1) * Math.max(0, 1 - distance / RADIUS);
        void springFor(element).set(target);
      }
    };
    const onLeave = () => {
      for (const element of items()) void springFor(element).set(1);
    };
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerleave', onLeave);
    return () => {
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', onLeave);
      for (const [element, spring] of springs) {
        spring.jump(1);
        element.style.transform = '';
        element.style.zIndex = '';
      }
    };
  }, [containerRef, enabled, vertical]);
}
