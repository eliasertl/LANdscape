import type { ReactNode } from 'react';
import { DeviceMobileCamera } from '@phosphor-icons/react';
import styles from './SettingsApp.module.css';

interface SettingRowProps {
  label: ReactNode;
  detail?: ReactNode;
  hint?: ReactNode;
  /** Stored in this browser only (Store/DeviceStore.ts); shows the "This device" tag. */
  device?: boolean;
  children?: ReactNode;
}

/** One labelled row inside a settings group, with the control on the right. */
export function SettingRow({ label, detail, hint, device, children }: SettingRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>
          {label}
          {device && <DeviceTag />}
        </span>
        {detail && <span className={styles.rowDetail}>{detail}</span>}
        {hint && <span className={styles.rowHint}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function DeviceTag() {
  return (
    <span className={styles.deviceTag} title="Saved in this browser only. Other devices keep their own value.">
      <DeviceMobileCamera weight="bold" aria-hidden="true" />
      This device
    </span>
  );
}
