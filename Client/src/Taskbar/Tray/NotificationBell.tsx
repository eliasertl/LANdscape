import { Bell, BellSlash } from '@phosphor-icons/react';
import { useNotificationStore } from '../../Store/NotificationStore';
import { useDesktopStore } from '../../Store/DesktopStore';
import styles from '../TaskbarTray.module.css';

/** Tray bell with the unread count; click opens the notification center. */
export function NotificationBell() {
  const unread = useNotificationStore((s) => s.unread);
  const open = useNotificationStore((s) => s.open);
  const toggle = useNotificationStore((s) => s.toggle);
  const dnd = useDesktopStore((s) => s.settings?.notifications.dnd ?? false);
  return (
    <button type="button" className={`${styles.button} ${open ? styles.buttonActive : ''}`} aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`} aria-expanded={open} onClick={toggle} data-notification-bell>
      {dnd ? <BellSlash /> : <Bell weight={unread > 0 ? 'fill' : 'regular'} />}
      {unread > 0 && <span className={styles.badge}>{unread > 99 ? '99+' : unread}</span>}
    </button>
  );
}
