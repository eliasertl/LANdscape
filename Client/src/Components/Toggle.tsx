import { useId, type ReactNode } from 'react';
import styles from './Toggle.module.css';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

/** macOS-style switch. */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  const id = useId();
  return (
    <label className={styles.row} htmlFor={id}>
      {(label || description) && (
        <span className={styles.text}>
          {label && <span className={styles.label}>{label}</span>}
          {description && <span className={styles.description}>{description}</span>}
        </span>
      )}
      <span className={styles.switch}>
        <input id={id} type="checkbox" role="switch" className={styles.input} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className={styles.track} aria-hidden="true">
          <span className={styles.knob} />
        </span>
      </span>
    </label>
  );
}
