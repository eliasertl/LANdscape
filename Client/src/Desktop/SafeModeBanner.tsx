import { Lifebuoy } from '@phosphor-icons/react';
import { isSafeMode, leaveSafeMode } from '../Platform/SafeMode';
import { Button } from '../Components/Button';
import styles from './SafeModeBanner.module.css';

/** Shown on the desktop and phone shell while safe mode is on. */
export function SafeModeBanner() {
  if (!isSafeMode()) return null;
  return (
    <div className={`${styles.banner} material`} role="status" data-safe-mode-banner>
      <Lifebuoy weight="fill" className={styles.icon} />
      <span className="text-callout">
        <strong>Safe mode.</strong> Catalog apps and customizations are off.
      </span>
      <Button size="small" variant="primary" onClick={leaveSafeMode}>
        Leave safe mode
      </Button>
    </div>
  );
}
