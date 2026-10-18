import { useState } from 'react';
import { Info, PaintBrush, SquaresFour, type Icon } from '@phosphor-icons/react';
import type { AppWindowProps } from '../Types';
import { AppearanceSection } from './AppearanceSection';
import { AppsSection } from './AppsSection';
import { AboutSection } from './AboutSection';
import styles from './SettingsApp.module.css';

type Section = 'appearance' | 'apps' | 'about';

const SECTIONS: { id: Section; label: string; icon: Icon }[] = [
  { id: 'appearance', label: 'Appearance', icon: PaintBrush },
  { id: 'apps', label: 'Apps', icon: SquaresFour },
  { id: 'about', label: 'About', icon: Info },
];

export default function SettingsApp({ params, phone }: AppWindowProps) {
  const initial = (typeof params.section === 'string' ? params.section : 'appearance') as Section;
  const [section, setSection] = useState<Section>(SECTIONS.some((s) => s.id === initial) ? initial : 'appearance');

  return (
    <div className={`${styles.app} ${phone ? styles.phone : ''}`}>
      <nav className={styles.sidebar} aria-label="Settings sections">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.id} type="button" className={`${styles.navItem} ${section === s.id ? styles.navActive : ''}`} onClick={() => setSection(s.id)} aria-current={section === s.id ? 'page' : undefined}>
              <Icon weight={section === s.id ? 'fill' : 'regular'} />
              <span>{s.label}</span>
            </button>
          );
        })}
      </nav>
      <div className={`${styles.content} scroll`}>
        {section === 'appearance' && <AppearanceSection />}
        {section === 'apps' && <AppsSection />}
        {section === 'about' && <AboutSection />}
      </div>
    </div>
  );
}
