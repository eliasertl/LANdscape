import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { Desktop, Info, PaintBrush, SquaresFour, Swap, type Icon } from '@phosphor-icons/react';

export interface SettingsSectionDefinition {
  id: string;
  label: string;
  icon: Icon;
  component: LazyExoticComponent<ComponentType>;
}

/**
 * Sections of the Settings app, in sidebar order. Adding a section is one
 * entry here plus its component file.
 */
export const SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
  { id: 'appearance', label: 'Appearance', icon: PaintBrush, component: lazy(() => import('./AppearanceSection')) },
  { id: 'desktop', label: 'Desktop', icon: Desktop, component: lazy(() => import('./DesktopSection')) },
  { id: 'apps', label: 'Apps', icon: SquaresFour, component: lazy(() => import('./AppsSection')) },
  { id: 'proxy', label: 'Proxy', icon: Swap, component: lazy(() => import('./ProxySection')) },
  { id: 'about', label: 'About', icon: Info, component: lazy(() => import('./AboutSection')) },
];
