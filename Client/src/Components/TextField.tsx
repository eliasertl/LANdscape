import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import styles from './TextField.module.css';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  size?: 'regular' | 'large';
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, leading, trailing, size = 'regular', className, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={[styles.field, className ?? ''].join(' ')}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className={[styles.control, styles[size], error ? styles.invalid : ''].join(' ')}>
        {leading && <span className={styles.adornment}>{leading}</span>}
        <input ref={ref} id={inputId} className={styles.input} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
        {trailing && <span className={styles.adornment}>{trailing}</span>}
      </div>
      {error ? (
        <div id={`${inputId}-error`} className={styles.error} role="alert">
          {error}
        </div>
      ) : hint ? (
        <div id={`${inputId}-hint`} className={styles.hint}>
          {hint}
        </div>
      ) : null}
    </div>
  );
});
