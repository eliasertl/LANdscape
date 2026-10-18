import { useSyncExternalStore } from 'react';

let cached = { width: 0, height: 0 };

function snapshot() {
  if (cached.width !== window.innerWidth || cached.height !== window.innerHeight) {
    cached = { width: window.innerWidth, height: window.innerHeight };
  }
  return cached;
}

function subscribe(callback: () => void) {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

/** Viewport size that re-renders the component on resize. */
export function useViewportSize(): { width: number; height: number } {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
