import { Suspense } from 'react';
import { useDesktopStore } from '../Store/DesktopStore';
import type { DesktopWindow } from '../Store/WindowStore';
import { useUiStore } from '../Store/UiStore';
import { getApp } from '../Apps/Registry';
import { IframeContent } from './IframeContent';
import { SetupState } from '../Components/SetupState';
import { Spinner } from '../Components/Spinner';
import { useIsPhone } from '../Hooks/UseMediaQuery';
import styles from './WindowContent.module.css';

/** Routes a window to its content: a shortcut iframe or a built-in app. */
export function WindowContent({ win }: { win: DesktopWindow }) {
  const interacting = useUiStore((s) => s.interacting);
  const shortcut = useDesktopStore((s) => (win.shortcutId ? s.shortcuts.find((x) => x.id === win.shortcutId) : undefined));
  const integrations = useDesktopStore((s) => s.integrations);
  const phone = useIsPhone();

  let body;
  if (win.kind === 'shortcut') {
    body = shortcut ? <IframeContent shortcut={shortcut} /> : <div className={styles.center}>This shortcut no longer exists.</div>;
  } else {
    const app = win.appId ? getApp(win.appId) : undefined;
    if (!app) {
      body = <div className={styles.center}>Unknown app.</div>;
    } else if (app.requires && !integrations[app.requires]) {
      body = <SetupState integration={app.requires} appName={app.name} />;
    } else {
      const Component = app.component;
      body = (
        <Suspense
          fallback={
            <div className={styles.center}>
              <Spinner size={24} />
            </div>
          }
        >
          <Component windowId={win.id} params={win.params} phone={phone} />
        </Suspense>
      );
    }
  }

  return (
    <>
      {body}
      {interacting && <div className={styles.overlay} aria-hidden="true" />}
    </>
  );
}
