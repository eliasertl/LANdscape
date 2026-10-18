import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { CaretUpDown } from '@phosphor-icons/react';
import styles from './Select.module.css';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: ReactNode;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
}

/** Native select styled as a macOS pop-up button (keyboard and screen-reader friendly). */
export function Select({ label, options, onChange, id, className, ...rest }: SelectProps) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <div className={[styles.field, className ?? ''].join(' ')}>
      {label && (
        <label className={styles.label} htmlFor={selectId}>
          {label}
        </label>
      )}
      <span className={styles.control}>
        <select id={selectId} className={styles.select} onChange={(e) => onChange(e.target.value)} {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <span className={styles.caret} aria-hidden="true">
          <CaretUpDown weight="bold" />
        </span>
      </span>
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}

/** Segmented control (radio group) for a few mutually exclusive choices. */
export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={[styles.segment, o.value === value ? styles.segmentActive : ''].join(' ')}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <span className={styles.segmentIcon}>{o.icon}</span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}
