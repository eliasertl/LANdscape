import { useEffect, useState } from 'react';
import type { AppWindowProps } from './Types';
import { AppFrame } from './AppFrame';
import { installedApp, windowFrames } from '../Platform/InstalledApps';
import { useWindowStore } from '../Store/WindowStore';
import { askFrameBeforeClose, sendFrameEvent } from '../Platform/AppBroker';
import styles from '../Windows/WindowContent.module.css';

/** The window surface of a catalog app: one AppFrame filling the window, wired to the window store. */
export default function AppWindow({ windowId, params, phone }: AppWindowProps) {
  const win = useWindowStore((s) => s.windows.find((w) => w.id === windowId));
  const setTitle = useWindowStore((s) => s.setTitle);
  const requestClose = useWindowStore((s) => s.requestClose);
  const open = useWindowStore((s) => s.open);
  const registerBeforeClose = useWindowStore((s) => s.registerBeforeClose);
  const [frame, setFrame] = useState<Window | null>(null);
  const app = win?.appId ? installedApp(win.appId) : undefined;
  const wantedWindow = typeof params.windowId === 'string' ? params.windowId : 'main';
  const windowSpec = app?.manifest.contributes.windows.find((w) => w.id === wantedWindow) ?? app?.manifest.contributes.windows[0];

  useEffect(() => {
    if (!frame) return;
    windowFrames.set(windowId, frame);
    registerBeforeClose(windowId, () => askFrameBeforeClose(frame));
    return () => {
      windowFrames.delete(windowId);
      registerBeforeClose(windowId, null);
    };
  }, [frame, windowId, registerBeforeClose]);

  // Params can change on an open single window (the launcher passes new action params).
  useEffect(() => {
    if (frame) sendFrameEvent(frame, 'params', params);
  }, [frame, params]);

  if (!app || !windowSpec) return <div className={styles.center}>This app is not installed any more.</div>;
  return (
    <AppFrame
      app={app}
      surface="window"
      surfaceId={windowSpec.id}
      params={params}
      phone={phone}
      onWindow={setFrame}
      title={app.manifest.name}
      ui={{
        setTitle: (title) => setTitle(windowId, title),
        close: () => void requestClose(windowId),
        openWindow: (id, p) => {
          const spec = app.manifest.contributes.windows.find((w) => w.id === id);
          if (!spec) return;
          open({ kind: 'app', appId: app.id, title: spec.title ?? app.manifest.name, params: { ...p, windowId: id }, defaultSize: spec.defaultSize, single: spec.single });
        },
      }}
    />
  );
}
