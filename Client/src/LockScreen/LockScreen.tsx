import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, LockKey, UserCircle } from '@phosphor-icons/react';
import { ApiRequestError } from '../Api/Http';
import { useSessionStore } from '../Store/SessionStore';
import { Button } from '../Components/Button';
import { TextField } from '../Components/TextField';
import { useSpringValue, useSpringStyle } from '../Design/UseSpring';
import { SPRING } from '../Design/Spring';
import styles from './LockScreen.module.css';

export function LockScreen() {
  const login = useSessionStore((s) => s.login);
  const wallpaper = useSessionStore((s) => s.lockScreenWallpaper);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

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
    usernameRef.current?.focus();
  }, [scale, opacity]);

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
      await login(username.trim(), password);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'locked_out') {
        const seconds = Number((err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 900);
        setRemaining(seconds);
        setError(null);
      } else if (err instanceof ApiRequestError && err.status === 401) {
        const left = (err.details as { attemptsRemaining?: number } | undefined)?.attemptsRemaining;
        setError(left !== undefined && left <= 2 ? `Wrong username or password. ${left} attempt${left === 1 ? '' : 's'} left before a 15-minute lockout.` : 'Wrong username or password.');
      } else {
        setError(err instanceof Error ? err.message : 'Login failed.');
      }
      setPassword('');
      shake.jump(0);
      // Kick the spring with velocity for a short horizontal shake.
      void shake.set(0);
      void shake.set(-10).then(() => shake.set(0));
      window.setTimeout(() => usernameRef.current?.form?.querySelector<HTMLInputElement>('input[type=password]')?.focus(), 50);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.wallpaper} style={wallpaper ? { backgroundImage: `url("${wallpaper}")` } : undefined} aria-hidden="true" />
      <div className={styles.scrim} aria-hidden="true" />
      <div ref={cardRef} className={`${styles.card} material squircle`}>
        <div className={styles.avatar} aria-hidden="true">
          <UserCircle weight="fill" size={64} />
        </div>
        <h1 className={`${styles.title} text-title2 emphasized`}>LANdscape</h1>
        <p className={`${styles.subtitle} text-callout text-secondary`}>Sign in to your desktop</p>
        <form className={styles.form} onSubmit={(e) => void onSubmit(e)} noValidate>
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
          <TextField
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
          <Button type="submit" variant="primary" size="large" block loading={busy} disabled={locked || !username || !password} icon={<ArrowRight weight="bold" />}>
            Log in
          </Button>
        </form>
      </div>
    </div>
  );
}
