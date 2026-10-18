import { useSyncExternalStore } from 'react';
import { PHONE_BREAKPOINT } from '@landscape/shared';

const queries = new Map<string, MediaQueryList>();

function getQuery(query: string): MediaQueryList {
  let mql = queries.get(query);
  if (!mql) {
    mql = window.matchMedia(query);
    queries.set(query, mql);
  }
  return mql;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const mql = getQuery(query);
      mql.addEventListener('change', callback);
      return () => mql.removeEventListener('change', callback);
    },
    () => getQuery(query).matches,
    () => false,
  );
}

/** True below the phone breakpoint: the simplified phone layout is used. */
export function useIsPhone(): boolean {
  return useMediaQuery(`(max-width: ${PHONE_BREAKPOINT - 1}px)`);
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
