import { Suspense, useState } from 'react';
import type { AppWindowProps } from '../Types';
import { ErrorBoundary } from '../../Components/ErrorBoundary';
import { Spinner } from '../../Components/Spinner';
import { SETTINGS_SECTIONS } from './Sections';
import styles from './SettingsApp.module.css';

export default function SettingsApp({ params, phone }: AppWindowProps) {
  const first = SETTINGS_SECTIONS[0]?.id ?? '';
  const initial = typeof params.section === 'string' && SETTINGS_SECTIONS.some((s) => s.id === params.section) ? params.section : first;
  const [section, setSection] = useState<string>(initial);
  const current = SETTINGS_SECTIONS.find((s) => s.id === section) ?? SETTINGS_SECTIONS[0];
  const Section = current?.component;

  return (
    <div className={`${styles.app} ${phone ? styles.phone : ''}`}>
      <nav className={styles.sidebar} aria-label="Settings sections">
        {SETTINGS_SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = s.id === current?.id;
          return (
            <button key={s.id} type="button" className={`${styles.navItem} ${active ? styles.navActive : ''}`} onClick={() => setSection(s.id)} aria-current={active ? 'page' : undefined} data-settings-section={s.id}>
              <Icon weight={active ? 'fill' : 'regular'} />
              <span>{s.label}</span>
            </button>
          );
        })}
      </nav>
      <div className={`${styles.content} scroll`}>
        {Section && (
          <ErrorBoundary key={current.id} label={`${current.label} settings`}>
            <Suspense fallback={<Spinner size={18} />}>
              <Section />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
