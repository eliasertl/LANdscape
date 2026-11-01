import type { InstalledApp } from '@landscape/shared';
import { AppFrame } from '../../Apps/AppFrame';

/** A tray item contributed by an app: a small sandboxed frame (28 px high). */
export default function AppTrayItem({ app, surfaceId, vertical }: { app: InstalledApp; surfaceId: string; vertical: boolean }) {
  return <AppFrame app={app} surface="tray" surfaceId={surfaceId} params={{ vertical }} style={{ width: 36, height: 28 }} title={`${app.manifest.name} tray item`} />;
}
