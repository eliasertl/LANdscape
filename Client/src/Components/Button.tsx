import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './Button.module.css';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'plain';
export type ButtonSize = 'regular' | 'large' | 'small';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'regular', icon, loading = false, block = false, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const classes = [styles.button, styles[variant], styles[size], block ? styles.block : '', className ?? ''].join(' ');
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={14} /> : icon ? <span className={styles.icon}>{icon}</span> : null}
      {children !== undefined && <span className={styles.label}>{children}</span>}
    </button>
  );
});
