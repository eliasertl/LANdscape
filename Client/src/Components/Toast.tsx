import { useEffect } from 'react';
import { create } from 'zustand';
import { CheckCircle, Info, WarningCircle, X } from '@phosphor-icons/react';
import styles from './Toast.module.css';

export type ToastKind = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }));
    window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  info: (message: string) => useToastStore.getState().push('info', message),
  success: (message: string) => useToastStore.getState().push('success', message),
  error: (message: string) => useToastStore.getState().push('error', message),
};

const ICONS = { info: Info, success: CheckCircle, error: WarningCircle };

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => undefined, []);
  if (toasts.length === 0) return null;
  return (
    <div className={styles.host} aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div key={t.id} className={`${styles.toast} ${styles[t.kind]} material`} role="status">
            <Icon weight="fill" className={styles.icon} />
            <span className={styles.message}>{t.message}</span>
            <button type="button" className={styles.close} onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X weight="bold" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
