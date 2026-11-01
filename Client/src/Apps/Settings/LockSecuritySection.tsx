import { useEffect, useState } from 'react';
import { ArrowsClockwise, DeviceMobile, Laptop, LockKey, SignOut } from '@phosphor-icons/react';
import type { SessionSummary } from '@landscape/shared';
import { api, errorMessage } from '../../Api/Http';
import { useDesktopStore } from '../../Store/DesktopStore';
import { useSessionStore } from '../../Store/SessionStore';
import { useUiStore } from '../../Store/UiStore';
import { Segmented, Select } from '../../Components/Select';
import { Toggle } from '../../Components/Toggle';
import { Button } from '../../Components/Button';
import { TextField } from '../../Components/TextField';
import { Spinner } from '../../Components/Spinner';
import { toast } from '../../Components/Toast';
import { SettingRow } from './SettingRow';
import styles from './SettingsApp.module.css';

const IDLE_OPTIONS = [0, 1, 5, 10, 15, 30, 60, 120, 240];
const LIFETIME_OPTIONS = [1, 7, 14, 30, 90, 180, 365];

export default function LockSecuritySection() {
  const lock = useDesktopStore((s) => s.settings?.lock);
  const security = useDesktopStore((s) => s.settings?.security);
  const updateSettings = useDesktopStore((s) => s.updateSettings);
  const lockNow = useSessionStore((s) => s.lock);
  const requestConfirm = useUiStore((s) => s.requestConfirm);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [message, setMessage] = useState(lock?.message ?? '');

  const patch = (value: Parameters<typeof updateSettings>[0]['lock']) => {
    void updateSettings({ lock: value }).catch((error: unknown) => toast.error(errorMessage(error)));
  };
  const load = async () => {
    try {
      setSessions(await api.get<SessionSummary[]>('/api/auth/sessions'));
    } catch (error) {
      toast.error(errorMessage(error));
      setSessions([]);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const revoke = async (session: SessionSummary) => {
    try {
      await api.delete(`/api/auth/sessions/${session.key}`);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const revokeOthers = () =>
    requestConfirm({
      title: 'Log out all other devices?',
      message: 'Every other browser has to log in again. This browser stays logged in.',
      confirmLabel: 'Log out others',
      danger: true,
      onConfirm: async () => {
        const result = await api.delete<{ revoked: number }>('/api/auth/sessions');
        toast.success(`${result.revoked} session${result.revoked === 1 ? '' : 's'} logged out.`);
        await load();
      },
    });

  if (!lock || !security) return null;
  const format = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Lock</h3>
        <p className="text-callout text-secondary">
          Locking happens on the server: while locked, the API refuses every call until you enter the password again, so a locked tab is as safe as a logged-out one. Activity in any
          tab counts.
        </p>
        <div className={styles.group}>
          <SettingRow label="Lock after" detail="Minutes without activity across all tabs.">
            <Select
              aria-label="Lock after"
              value={String(lock.idleMinutes)}
              onChange={(value) => patch({ idleMinutes: Number(value) })}
              options={[...new Set([...IDLE_OPTIONS, lock.idleMinutes])].sort((a, b) => a - b).map((m) => ({ value: String(m), label: m === 0 ? 'Never' : m < 60 ? `${m} min` : `${m / 60} h` }))}
            />
          </SettingRow>
          <SettingRow label="Lock now" detail="Ctrl+Alt+L by default (Keyboard Shortcuts).">
            <Button icon={<LockKey />} onClick={() => void lockNow()} data-lock-now>
              Lock
            </Button>
          </SettingRow>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Lock screen</h3>
        <div className={styles.group}>
          <SettingRow label="Clock">
            <Segmented
              ariaLabel="Lock-screen clock"
              value={lock.clock}
              onChange={(clock) => patch({ clock })}
              options={[
                { value: 'none', label: 'None' },
                { value: 'digital', label: 'Digital' },
                { value: 'large', label: 'Large' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Show date">
            <Toggle checked={lock.showDate} onChange={(showDate) => patch({ showDate })} />
          </SettingRow>
          <SettingRow label="Message" detail="Shown above the login card, for example whose server this is.">
            <TextField aria-label="Lock-screen message" value={message} placeholder="Welcome home" maxLength={120} onChange={(e) => setMessage(e.target.value)} onBlur={() => message !== lock.message && patch({ message })} />
          </SettingRow>
          <SettingRow label="Wallpaper blur" detail={`${lock.blur} px`}>
            <input type="range" aria-label="Lock-screen blur" min={0} max={60} step={2} value={lock.blur} onChange={(e) => patch({ blur: Number(e.target.value) })} className={styles.slider} />
          </SettingRow>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Security</h3>
        <div className={styles.group}>
          <SettingRow label="Session lifetime" detail="How long a login lasts without use. Applies to new logins.">
            <Select
              aria-label="Session lifetime"
              value={String(security.sessionDays)}
              onChange={(value) => void updateSettings({ security: { sessionDays: Number(value) } }).catch((error: unknown) => toast.error(errorMessage(error)))}
              options={[...new Set([...LIFETIME_OPTIONS, security.sessionDays])].sort((a, b) => a - b).map((d) => ({ value: String(d), label: d === 1 ? '1 day' : `${d} days` }))}
            />
          </SettingRow>
        </div>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>
            Sessions {sessions && <span className={styles.sectionCount}>{sessions.length} active</span>}
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button size="small" icon={<ArrowsClockwise />} onClick={() => void load()}>
              Refresh
            </Button>
            <Button size="small" variant="destructive" icon={<SignOut />} onClick={revokeOthers} disabled={!sessions || sessions.length < 2}>
              Log out others
            </Button>
          </div>
        </div>
        {sessions === null ? (
          <Spinner size={16} />
        ) : (
          <div className={styles.group}>
            {sessions.map((session) => (
              <div key={session.key} className={styles.row} data-session-row={session.current ? 'current' : 'other'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span style={{ fontSize: 22, color: 'var(--color-secondary-label)' }}>{/iOS|Android/.test(session.device) ? <DeviceMobile /> : <Laptop />}</span>
                  <div className={styles.rowText}>
                    <span className={styles.rowLabel}>
                      {session.device}
                      {session.current && <span className={styles.deviceTag}>This browser</span>}
                      {session.locked && !session.current && <span className={styles.rowHint}> · locked</span>}
                    </span>
                    <span className={styles.rowDetail} title={session.userAgent}>
                      Last seen {format.format(new Date(session.lastSeenAt))} · signed in {format.format(new Date(session.createdAt))}
                    </span>
                  </div>
                </div>
                {!session.current && (
                  <Button size="small" variant="plain" onClick={() => void revoke(session)} aria-label={`Log out ${session.device}`}>
                    Log out
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
