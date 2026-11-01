import { MagnifyingGlass } from '@phosphor-icons/react';
import { useUiStore } from '../Store/UiStore';
import { TaskbarApps } from './TaskbarApps';
import { TaskbarClock } from './TaskbarClock';
import { ErrorBoundary } from '../Components/ErrorBoundary';
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
        <ErrorBoundary label="Taskbar apps" compact>
          <TaskbarApps />
        </ErrorBoundary>
        <div className={styles.divider} />
        <ErrorBoundary label="Taskbar clock" compact>
          <TaskbarClock />
        </ErrorBoundary>
      </div>
    </div>
  );
}
