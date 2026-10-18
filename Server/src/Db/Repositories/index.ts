import type { Database } from '../Database';
import { SessionsRepository } from './SessionsRepository';
import { SettingsRepository } from './SettingsRepository';
import { ShortcutsRepository } from './ShortcutsRepository';
import { WidgetsRepository } from './WidgetsRepository';
import { WindowMemoryRepository } from './WindowMemoryRepository';

export interface Repositories {
  sessions: SessionsRepository;
  shortcuts: ShortcutsRepository;
  widgets: WidgetsRepository;
  windowMemory: WindowMemoryRepository;
  settings: SettingsRepository;
}

export function createRepositories(db: Database): Repositories {
  return {
    sessions: new SessionsRepository(db),
    shortcuts: new ShortcutsRepository(db),
    widgets: new WidgetsRepository(db),
    windowMemory: new WindowMemoryRepository(db),
    settings: new SettingsRepository(db),
  };
}

/** First-run defaults: an empty desktop with clock, CPU and RAM widgets. */
export function seedDefaults(repos: Repositories): void {
  if (repos.settings.getFlag('seeded')) return;
  if (repos.widgets.count() === 0) {
    repos.widgets.create('clock', 24, 24);
    repos.widgets.create('cpu', 24, 200);
    repos.widgets.create('ram', 24, 376);
  }
  repos.settings.setFlag('seeded', true);
}

export { SessionsRepository, SettingsRepository, ShortcutsRepository, WidgetsRepository, WindowMemoryRepository };
