import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { AppWindow, Bell, Cursor, Desktop, Info, Keyboard, LockKey, PaintBrush, Rocket, SquareHalfBottom, SquaresFour, Swap, type Icon } from '@phosphor-icons/react';

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
  { id: 'taskbar', label: 'Taskbar', icon: SquareHalfBottom, component: lazy(() => import('./TaskbarSection')) },
  { id: 'windows', label: 'Windows', icon: AppWindow, component: lazy(() => import('./WindowsSection')) },
  { id: 'startup', label: 'Startup', icon: Rocket, component: lazy(() => import('./StartupSection')) },
  { id: 'cursor', label: 'Cursor', icon: Cursor, component: lazy(() => import('./CursorSection')) },
  { id: 'notifications', label: 'Notifications', icon: Bell, component: lazy(() => import('./NotificationsSection')) },
  { id: 'lock', label: 'Lock & Security', icon: LockKey, component: lazy(() => import('./LockSecuritySection')) },
  { id: 'keyboard', label: 'Keyboard Shortcuts', icon: Keyboard, component: lazy(() => import('./KeyboardSection')) },
  { id: 'apps', label: 'Apps', icon: SquaresFour, component: lazy(() => import('./AppsSection')) },
  { id: 'proxy', label: 'Proxy', icon: Swap, component: lazy(() => import('./ProxySection')) },
  { id: 'about', label: 'About', icon: Info, component: lazy(() => import('./AboutSection')) },
];
