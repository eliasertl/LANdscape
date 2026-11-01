import { topLeftAnchor } from '@landscape/shared';
import type { Database } from '../Database';
import { FoldersRepository } from './FoldersRepository';
import { NotificationsRepository } from './NotificationsRepository';
import { MonitorTargetsRepository } from './MonitorTargetsRepository';
import { SessionsRepository } from './SessionsRepository';
import { SettingsRepository } from './SettingsRepository';
import { ShortcutsRepository } from './ShortcutsRepository';
import { WidgetsRepository } from './WidgetsRepository';
import { WindowMemoryRepository } from './WindowMemoryRepository';

export interface Repositories {
  sessions: SessionsRepository;
  shortcuts: ShortcutsRepository;
  widgets: WidgetsRepository;
  folders: FoldersRepository;
  notifications: NotificationsRepository;
  monitorTargets: MonitorTargetsRepository;
  windowMemory: WindowMemoryRepository;
  settings: SettingsRepository;
}

export function createRepositories(db: Database): Repositories {
  return {
    sessions: new SessionsRepository(db),
    shortcuts: new ShortcutsRepository(db),
    widgets: new WidgetsRepository(db),
    folders: new FoldersRepository(db),
    notifications: new NotificationsRepository(db),
    monitorTargets: new MonitorTargetsRepository(db),
    windowMemory: new WindowMemoryRepository(db),
    settings: new SettingsRepository(db),
  };
}

/** First-run defaults: an empty desktop with clock, CPU and RAM widgets. */
export function seedDefaults(repos: Repositories): void {
  if (repos.settings.getFlag('seeded')) return;
  if (repos.widgets.count() === 0) {
    // Stacked in the first icon columns: clock (2×1), CPU (3×2), RAM (2×1).
    repos.widgets.create('clock', topLeftAnchor(0, 0), 'm', { intervalMs: 1000 });
    repos.widgets.create('cpu', topLeftAnchor(0, 1), 'm', { intervalMs: 2000 });
    repos.widgets.create('ram', topLeftAnchor(0, 3), 'm', { intervalMs: 5000 });
  }
  repos.settings.setFlag('seeded', true);
}

export { FoldersRepository, MonitorTargetsRepository, NotificationsRepository, SessionsRepository, SettingsRepository, ShortcutsRepository, WidgetsRepository, WindowMemoryRepository };
