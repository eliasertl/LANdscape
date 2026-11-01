import { useSyncExternalStore } from 'react';
import { layoutViewport } from '../Design/Scale';

let cached = { width: 0, height: 0 };

function snapshot() {
  const { width, height } = layoutViewport();
  if (cached.width !== width || cached.height !== height) cached = { width, height };
  return cached;
}

function subscribe(callback: () => void) {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

/** Viewport size in layout pixels (see Design/Scale.ts) that re-renders the component on resize. */
export function useViewportSize(): { width: number; height: number } {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
