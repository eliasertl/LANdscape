import { MagnifyingGlass } from '@phosphor-icons/react';
import { useUiStore } from '../Store/UiStore';
import { TaskbarApps } from './TaskbarApps';
import { TaskbarClock } from './TaskbarClock';
import styles from './Taskbar.module.css';

/** Floating frosted-glass bar along the bottom edge. */
export function Taskbar() {
  const startMenuOpen = useUiStore((s) => s.startMenuOpen);
  const toggleStartMenu = useUiStore((s) => s.toggleStartMenu);
  return (
    <div className={styles.host}>
      <div className={`${styles.bar} material`} role="toolbar" aria-label="Taskbar">
        <button
          type="button"
          className={`${styles.search} ${startMenuOpen ? styles.searchActive : ''}`}
          aria-label="Search and launch"
          aria-expanded={startMenuOpen}
          title="Search (Ctrl+Space)"
          data-taskbar-search
          onClick={toggleStartMenu}
        >
          <MagnifyingGlass weight="bold" />
        </button>
        <div className={styles.divider} />
        <TaskbarApps />
        <div className={styles.divider} />
        <TaskbarClock />
      </div>
    </div>
  );
}
