import type { ComponentType, LazyExoticComponent } from 'react';
import type { Icon } from '@phosphor-icons/react';
import type { AppId } from '@landscape/shared';
import type { EntrySource } from '../Platform/Registry';

export interface AppWindowProps {
  windowId: string;
  params: Record<string, unknown>;
  /** The window is shown full-screen (phone layout). */
  phone: boolean;
}

export interface AppDefinition {
  id: AppId;
  source?: EntrySource;
  name: string;
  description: string;
  icon: Icon;
  /** Catalog apps: their own icon image instead of a Phosphor icon on a tile. */
  iconUrl?: string | null;
  /** Tile color used for the launcher icon (CSS color). */
  color: string;
  component: LazyExoticComponent<ComponentType<AppWindowProps>>;
  defaultSize: { width: number; height: number };
  minSize?: { width: number; height: number };
  /** Integration the app depends on; shown as a setup screen when missing. */
  requires: 'ssh' | 'docker' | null;
  /** Only one window at a time (focus the existing one). */
  single: boolean;
}
