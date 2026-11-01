import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Lifebuoy, LockKey, SignOut, UserCircle } from '@phosphor-icons/react';
import { ApiRequestError } from '../Api/Http';
import { useSessionStore } from '../Store/SessionStore';
import { Button } from '../Components/Button';
import { TextField } from '../Components/TextField';
import { useSpringValue, useSpringStyle } from '../Design/UseSpring';
import { SPRING } from '../Design/Spring';
import { enterSafeMode, isSafeMode, leaveSafeMode } from '../Platform/SafeMode';
import styles from './LockScreen.module.css';

/**
 * Login (no session) or unlock (a locked session: password only). The look
 * comes from Settings → Lock & Security and is public, so it also applies
 * before login.
 */
export function LockScreen() {
  const login = useSessionStore((s) => s.login);
  const unlock = useSessionStore((s) => s.unlock);
  const logout = useSessionStore((s) => s.logout);
  const hasSession = useSessionStore((s) => s.hasSession);
  const storedUsername = useSessionStore((s) => s.username);
  const wallpaper = useSessionStore((s) => s.lockScreenWallpaper);
  const look = useSessionStore((s) => s.lockScreen);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const scale = useSpringValue(0.96, SPRING.bounce, 0.001);
  const opacity = useSpringValue(0, SPRING.standard, 0.005);
  const shake = useSpringValue(0, { response: 0.22, dampingFraction: 0.35 }, 0.1);
  useSpringStyle(cardRef, [scale, opacity, shake], ([s, o, x]) => ({
    transform: `translateX(${x ?? 0}px) scale(${s ?? 1})`,
    opacity: String(o ?? 1),
  }));

  useEffect(() => {
    void scale.set(1);
    void opacity.set(1);
    (hasSession ? passwordRef : usernameRef).current?.focus();
  }, [scale, opacity, hasSession]);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);

  const locked = remaining > 0;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || locked) return;
    setBusy(true);
    setError(null);
    try {
      if (hasSession) await unlock(password);
      else await login(username.trim(), password);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'locked_out') {
        const seconds = Number((err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 900);
        setRemaining(seconds);
        setError(null);
      } else if (err instanceof ApiRequestError && err.status === 401 && err.code === 'invalid_credentials') {
        const left = (err.details as { attemptsRemaining?: number } | undefined)?.attemptsRemaining;
        const what = hasSession ? 'Wrong password.' : 'Wrong username or password.';
        setError(left !== undefined && left <= 2 ? `${what} ${left} attempt${left === 1 ? '' : 's'} left before a 15-minute lockout.` : what);
      } else if (err instanceof ApiRequestError && err.status === 401) {
        // The locked session expired meanwhile: fall back to a full login.
        useSessionStore.getState().lockedByServer(false);
        setError('The session expired. Please log in again.');
      } else {
        setError(err instanceof Error ? err.message : 'Login failed.');
      }
      setPassword('');
      shake.jump(0);
      // Kick the spring with velocity for a short horizontal shake.
      void shake.set(0);
      void shake.set(-10).then(() => shake.set(0));
      window.setTimeout(() => passwordRef.current?.focus(), 50);
    } finally {
      setBusy(false);
    }
  };

  const blur = look?.blur ?? 28;

  return (
    <div className={styles.screen} data-lock-mode={hasSession ? 'unlock' : 'login'}>
      <div className={styles.wallpaper} style={{ ...(wallpaper ? { backgroundImage: `url("${wallpaper}")` } : {}), filter: `blur(${blur}px) saturate(1.2)` }} aria-hidden="true" />
      <div className={styles.scrim} aria-hidden="true" />
      {look && look.clock !== 'none' && <LockClock large={look.clock === 'large'} showDate={look.showDate} />}
      {look?.message && <p className={`${styles.message} text-callout`}>{look.message}</p>}
      <div ref={cardRef} className={`${styles.card} material squircle`}>
        <div className={styles.avatar} aria-hidden="true">
          <UserCircle weight="fill" size={64} />
        </div>
        <h1 className={`${styles.title} text-title2 emphasized`}>{hasSession ? (storedUsername ?? 'LANdscape') : 'LANdscape'}</h1>
        <p className={`${styles.subtitle} text-callout text-secondary`}>{hasSession ? 'Locked — enter your password to continue' : 'Sign in to your desktop'}</p>
        <form className={styles.form} onSubmit={(e) => void onSubmit(e)} noValidate>
          {!hasSession && (
            <TextField
              ref={usernameRef}
              size="large"
              name="username"
              autoComplete="username"
              placeholder="Username"
              aria-label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy || locked}
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
          <TextField
            ref={passwordRef}
            size="large"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy || locked}
            trailing={<LockKey />}
          />
          {locked ? (
            <div className={styles.locked} role="alert">
              <strong>Too many failed attempts.</strong>
              <span>
                Try again in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}.
              </span>
            </div>
          ) : error ? (
            <div className={styles.error} role="alert">
              {error}
            </div>
          ) : null}
          <Button type="submit" variant="primary" size="large" block loading={busy} disabled={locked || (!hasSession && !username) || !password} icon={<ArrowRight weight="bold" />}>
            {hasSession ? 'Unlock' : 'Log in'}
          </Button>
          {hasSession && (
            <Button type="button" variant="plain" size="small" icon={<SignOut />} onClick={() => void logout()} disabled={busy}>
              Log out instead
            </Button>
          )}
        </form>
      </div>
      <button type="button" className={styles.safeLink} onClick={isSafeMode() ? leaveSafeMode : enterSafeMode} data-safe-mode-link>
        <Lifebuoy weight="bold" aria-hidden="true" />
        {isSafeMode() ? 'Safe mode is on — start normally' : 'Start in safe mode'}
      </button>
    </div>
  );
}

function LockClock({ large, showDate }: { large: boolean; showDate: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(now);
  const date = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  return (
    <div className={`${styles.clock} ${large ? styles.clockLarge : ''}`} aria-hidden="true" data-lock-clock>
      <span className={`${styles.clockTime} text-tabular`}>{time}</span>
      {showDate && <span className={styles.clockDate}>{date}</span>}
    </div>
  );
}
