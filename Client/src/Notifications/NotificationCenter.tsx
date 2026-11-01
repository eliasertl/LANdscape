import { useEffect, useRef } from 'react';
import { BellSlash, CheckCircle, Info, Trash, WarningCircle, XCircle } from '@phosphor-icons/react';
import type { Notification } from '@landscape/shared';
import { useNotificationStore } from '../Store/NotificationStore';
import { useDesktopStore } from '../Store/DesktopStore';
import { Button } from '../Components/Button';
import { Toggle } from '../Components/Toggle';
import { useSpringStyle, useSpringValue } from '../Design/UseSpring';
import { SPRING } from '../Design/Spring';
import { toast } from '../Components/Toast';
import { errorMessage } from '../Api/Http';
import styles from './NotificationCenter.module.css';

const ICONS = { info: Info, warning: WarningCircle, error: XCircle };

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
}

/** The panel behind the tray bell: history with read state, clear, and do-not-disturb. */
export function NotificationCenter() {
  const open = useNotificationStore((s) => s.open);
  const setOpen = useNotificationStore((s) => s.setOpen);
  if (!open) return null;
  return <Panel onClose={() => setOpen(false)} />;
}

function Panel({ onClose }: { onClose: () => void }) {
  const notifications = useNotificationStore((s) => s.notifications);
  const unread = useNotificationStore((s) => s.unread);
  const markRead = useNotificationStore((s) => s.markRead);
  const clear = useNotificationStore((s) => s.clear);
  const dnd = useDesktopStore((s) => s.settings?.notifications.dnd ?? false);
  const updateSettings = useDesktopStore((s) => s.updateSettings);
  const ref = useRef<HTMLDivElement>(null);
  const scale = useSpringValue(0.96, SPRING.quick, 0.001);
  const opacity = useSpringValue(0, SPRING.quick, 0.005);
  useSpringStyle(ref, [scale, opacity], ([s, o]) => ({ transform: `scale(${s ?? 1})`, opacity: String(o ?? 1) }));

  useEffect(() => {
    void scale.set(1);
    void opacity.set(1);
  }, [scale, opacity]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (ref.current?.contains(target as Node)) return;
      if (target?.closest?.('[data-tray-item="notifications"]')) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className={styles.host}>
      <div ref={ref} className={`${styles.panel} material`} role="dialog" aria-label="Notifications" data-notification-center>
        <div className={styles.header}>
          <span className="text-headline">Notifications{unread > 0 && <span className={styles.count}>{unread}</span>}</span>
          <div className={styles.headerActions}>
            <Button size="small" variant="plain" icon={<CheckCircle />} disabled={unread === 0} onClick={() => void markRead('all')}>
              Mark all read
            </Button>
            <Button size="small" variant="plain" icon={<Trash />} disabled={notifications.length === 0} onClick={() => void clear()}>
              Clear
            </Button>
          </div>
        </div>
        <div className={`${styles.list} scroll`}>
          {notifications.length === 0 ? (
            <div className={styles.empty}>
              <BellSlash />
              <span>No notifications.</span>
            </div>
          ) : (
            notifications.map((n) => <Item key={n.id} notification={n} onRead={() => void markRead([n.id])} />)
          )}
        </div>
        <div className={styles.footer}>
          <span className={styles.footerText}>
            <BellSlash /> Do not disturb
            <span className="text-footnote text-secondary">History keeps filling; nothing pops up.</span>
          </span>
          <Toggle checked={dnd} onChange={(value) => void updateSettings({ notifications: { dnd: value } }).catch((error: unknown) => toast.error(errorMessage(error)))} />
        </div>
      </div>
    </div>
  );
}

function Item({ notification, onRead }: { notification: Notification; onRead: () => void }) {
  const Icon = ICONS[notification.level];
  return (
    <button type="button" className={`${styles.item} ${notification.readAt ? '' : styles.unread}`} onClick={onRead} data-notification={notification.id} data-read={notification.readAt ? 'true' : 'false'}>
      <Icon weight="fill" className={`${styles.itemIcon} ${styles[notification.level]}`} />
      <span className={styles.itemText}>
        <span className={styles.itemTitle}>{notification.title}</span>
        {notification.body && <span className={styles.itemBody}>{notification.body}</span>}
        <span className={styles.itemMeta}>
          {notification.source.replace(/^app:/, '')} · {relative(notification.createdAt)}
        </span>
      </span>
      {!notification.readAt && <span className={styles.dot} aria-label="Unread" />}
    </button>
  );
}
