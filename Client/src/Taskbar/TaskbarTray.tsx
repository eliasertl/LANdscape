import { Suspense } from 'react';
import type { Settings } from '@landscape/shared';
import { registries } from '../Platform/Registries';
import { useRegistry } from '../Platform/Registry';
import { ErrorBoundary } from '../Components/ErrorBoundary';
import styles from './TaskbarTray.module.css';

interface TaskbarTrayProps {
  settings: Settings['taskbar'];
  vertical: boolean;
}

/** Tray items from the registry (built-ins and app contributions), minus the ones hidden in Settings → Taskbar. */
export function TaskbarTray({ settings, vertical }: TaskbarTrayProps) {
  const items = useRegistry(registries.trayItems).filter((item) => !settings.trayHidden.includes(item.id));
  if (items.length === 0) return null;
  return (
    <div className={`${styles.tray} ${vertical ? styles.vertical : ''}`} role="group" aria-label="Tray">
      {items.map((item) => {
        const Component = item.component;
        return (
          <ErrorBoundary key={item.id} label={item.title} compact>
            <span className={styles.item} data-tray-item={item.id} title={item.title}>
              <Suspense fallback={null}>
                <Component vertical={vertical} />
              </Suspense>
            </span>
          </ErrorBoundary>
        );
      })}
    </div>
  );
}
