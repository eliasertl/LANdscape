import { useEffect, useState } from 'react';
import type { InstalledApp } from '@landscape/shared';
import type { StartupAnimationProps } from '../Platform/Registries';
import { AppFrame } from '../Apps/AppFrame';
import { sendFrameEvent } from '../Platform/AppBroker';

/** A startup animation contributed by an app: a full-screen sandboxed frame that ends after the duration or when the app calls close(). */
export default function AppStartupAnimation({ app, surfaceId, params, onDone }: StartupAnimationProps & { app: InstalledApp; surfaceId: string }) {
  const [frame, setFrame] = useState<Window | null>(null);
  const duration = typeof params.durationMs === 'number' ? params.durationMs : 2200;
  useEffect(() => {
    const timer = window.setTimeout(onDone, duration);
    return () => window.clearTimeout(timer);
  }, [onDone, duration]);
  useEffect(() => {
    if (frame) sendFrameEvent(frame, 'params', params);
  }, [frame, params]);
  return <AppFrame app={app} surface="startup" surfaceId={surfaceId} params={params} onWindow={setFrame} style={{ position: 'absolute', inset: 0 }} ui={{ close: onDone }} title={`${app.manifest.name} startup animation`} />;
}
