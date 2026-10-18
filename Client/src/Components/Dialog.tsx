import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { SPRING } from '../Design/Spring';
import { useSpringStyle, useSpringValue } from '../Design/UseSpring';
import { Button } from './Button';
import styles from './Dialog.module.css';

export interface DialogProps {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: number;
  /** Prevent closing via Escape/backdrop (e.g. while saving). */
  locked?: boolean;
  closeButton?: boolean;
  initialFocus?: string;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Modal sheet with focus trap, spring entrance and keyboard dismissal. */
export function Dialog({ title, children, footer, onClose, width = 440, locked = false, closeButton = true, initialFocus }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const scale = useSpringValue(0.94, SPRING.bounce, 0.001);
  const opacity = useSpringValue(0, SPRING.quick, 0.005);
  useSpringStyle(ref, [scale, opacity], ([s, o]) => ({ transform: `scale(${s ?? 1})`, opacity: String(o ?? 1) }));
  useSpringStyle(backdropRef, [opacity], ([o]) => ({ opacity: String(o ?? 1) }));

  useEffect(() => {
    void scale.set(1);
    void opacity.set(1);
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    const target = (initialFocus && element?.querySelector<HTMLElement>(initialFocus)) || element?.querySelector<HTMLElement>(FOCUSABLE);
    window.setTimeout(() => (target ?? element)?.focus({ preventScroll: true }), 20);
    return () => previous?.focus?.({ preventScroll: true });
  }, [scale, opacity, initialFocus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !locked) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === 'Tab' && ref.current) {
        const focusable = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose, locked]);

  return createPortal(
    <div className={styles.layer}>
      <div ref={backdropRef} className={styles.backdrop} onPointerDown={() => !locked && onClose()} />
      <div ref={ref} className={`${styles.dialog} material squircle`} role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ width: `min(${width}px, calc(100vw - 32px))` }} tabIndex={-1}>
        <div className={styles.header}>
          <h2 id={titleId} className="text-title3 emphasized">
            {title}
          </h2>
          {closeButton && (
            <Button variant="plain" size="small" aria-label="Close" onClick={onClose} disabled={locked} icon={<X weight="bold" />} className={styles.close} />
          )}
        </div>
        <div className={`${styles.body} scroll`}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      width={380}
      locked={busy}
      closeButton={false}
      initialFocus="[data-confirm]"
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'destructive' : 'primary'} onClick={onConfirm} loading={busy} data-confirm>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-body">{message}</p>
    </Dialog>
  );
}
