import { cellToPx } from '@landscape/shared';
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
    // Stacked in the first grid columns: clock (2 rows), CPU (3 rows), RAM (2 rows).
    const at = (row: number) => cellToPx(0, row);
    repos.widgets.create('clock', at(0).x, at(0).y);
    repos.widgets.create('cpu', at(2).x, at(2).y);
    repos.widgets.create('ram', at(5).x, at(5).y);
  }
  repos.settings.setFlag('seeded', true);
}

export { SessionsRepository, SettingsRepository, ShortcutsRepository, WidgetsRepository, WindowMemoryRepository };
