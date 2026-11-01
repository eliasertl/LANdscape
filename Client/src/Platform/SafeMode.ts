/**
 * Safe mode starts the desktop without anything that could have broken it:
 * catalog apps, custom cursor, startup animation, custom taskbar style and
 * the per-device UI scale. Turn it on with `?safe=1` (or the lock-screen
 * link); it then sticks for this tab until "Leave safe mode".
 *
 * Every customization checks isSafeMode() before it applies.
 */
const STORAGE_KEY = 'landscape.safeMode';

function detect(): boolean {
  const param = new URLSearchParams(location.search).get('safe');
  try {
    if (param === '1') sessionStorage.setItem(STORAGE_KEY, '1');
    if (param === '0') sessionStorage.removeItem(STORAGE_KEY);
    return param === '1' || (param !== '0' && sessionStorage.getItem(STORAGE_KEY) === '1');
  } catch {
    return param === '1';
  }
}

const active = typeof window !== 'undefined' && detect();

export function isSafeMode(): boolean {
  return active;
}

function navigateWithSafe(value: '1' | '0'): void {
  const url = new URL(location.href);
  url.searchParams.set('safe', value);
  location.replace(url.toString());
}

export function enterSafeMode(): void {
  navigateWithSafe('1');
}

export function leaveSafeMode(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  const url = new URL(location.href);
  url.searchParams.delete('safe');
  location.replace(url.toString());
}
