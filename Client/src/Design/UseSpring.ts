import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { SPRING, SpringValue, type SpringConfig } from './Spring';

/** A SpringValue that lives as long as the component. */
export function useSpringValue(initial: number, config: SpringConfig = SPRING.standard, tolerance = 0.01): SpringValue {
  const [spring] = useState(() => new SpringValue(initial, config, tolerance));
  return spring;
}

/**
 * Writes spring values straight into an element's style on every frame,
 * bypassing React renders. `compute` receives the current values in order.
 */
export function useSpringStyle(
  ref: RefObject<HTMLElement | null>,
  springs: SpringValue[],
  compute: (values: number[]) => Partial<CSSStyleDeclaration>,
): void {
  const computeRef = useRef(compute);
  useLayoutEffect(() => {
    computeRef.current = compute;
  });

  useLayoutEffect(() => {
    const apply = () => {
      const element = ref.current;
      if (!element) return;
      const style = computeRef.current(springs.map((s) => s.value));
      Object.assign(element.style, style);
    };
    apply();
    const unsubscribes = springs.map((s) => s.onChange(apply));
    return () => unsubscribes.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...springs]);
}

/** Animates a spring from `from` to `to` once on mount. */
export function useMountSpring(spring: SpringValue, from: number, to: number, config?: SpringConfig): void {
  useEffect(() => {
    spring.jump(from);
    void spring.set(to, config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
