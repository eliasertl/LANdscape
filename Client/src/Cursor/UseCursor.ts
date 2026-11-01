import { useEffect } from 'react';
import { useDesktopStore } from '../Store/DesktopStore';
import { useDeviceStore } from '../Store/DeviceStore';
import { registries } from '../Platform/Registries';
import { useRegistry } from '../Platform/Registry';
import { applyCursor } from './ApplyCursor';

/** Keeps the page's cursor in line with Settings → Cursor and the per-device size. */
export function useCursor(): void {
  const cursor = useDesktopStore((s) => s.settings?.cursor);
  const scale = useDeviceStore((s) => s.settings.cursorScale);
  const sets = useRegistry(registries.cursorSets);
  useEffect(() => {
    if (cursor) applyCursor(cursor, scale);
  }, [cursor, scale, sets]);
}
