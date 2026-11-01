import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings } from '@landscape/shared';
import { registries, type StartupAnimationProps } from '../Platform/Registries';
import { useRegistryEntry } from '../Platform/Registry';
import { reducedMotion } from '../Design/Spring';
import { isSafeMode } from '../Platform/SafeMode';
import { useDeviceStore } from '../Store/DeviceStore';
import { ErrorBoundary } from '../Components/ErrorBoundary';
import { playStartupSound } from './Sound';
import styles from './StartupAnimation.module.css';

/** Preset params are untyped (apps contribute presets too); only strings are used as text. */
function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export type StartupSettings = Settings['startup'];

interface StartupAnimationProps2 {
  settings: StartupSettings;
  /** Page load happens before any user gesture, so sound may be blocked; after login it is allowed. */
  userGesture: boolean;
  onDone: () => void;
  /** Preview from Settings: ignores the per-device sound switch and safe mode. */
  preview?: boolean;
}

/** The parameters every preset receives (Platform/Registries → StartupAnimationProps.params). */
export function presetParams(settings: StartupSettings): Record<string, unknown> {
  return {
    durationMs: settings.durationMs,
    speed: settings.speed,
    background: settings.background,
    foreground: settings.foreground,
    text: settings.text,
    logoUrl: settings.logoFile ? `/startup/${settings.logoFile}` : null,
    logoIsVideo: settings.logoFile ? /\.(webm|mp4)$/i.test(settings.logoFile) : false,
  };
}

/**
 * Full-screen overlay that plays the chosen preset (a built-in or one an app
 * contributed) and gets out of the way. Reduced motion turns every preset
 * into a short fade; safe mode skips it entirely.
 */
export function StartupAnimation({ settings, userGesture, onDone, preview }: StartupAnimationProps2) {
  const definition = useRegistryEntry(registries.startupAnimations, settings.preset);
  const soundOn = useDeviceStore((s) => s.settings.startupSound);
  const [done, setDone] = useState(false);
  const finishedRef = useRef(false);
  const reduced = reducedMotion();

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setDone(true);
    window.setTimeout(onDone, 220);
  }, [onDone]);

  useEffect(() => {
    if (!preview && isSafeMode()) {
      finish();
      return;
    }
    if (settings.sound.kind !== 'none' && (soundOn || preview)) {
      void playStartupSound(settings.sound, userGesture);
    }
    // A hard ceiling so a stuck preset never blocks the desktop.
    const ceiling = window.setTimeout(finish, (reduced ? 600 : settings.durationMs) + 4000);
    return () => window.clearTimeout(ceiling);
  }, [finish, preview, settings.sound, soundOn, userGesture, reduced, settings.durationMs]);

  useEffect(() => {
    if (!settings.skippable) return;
    const skip = () => finish();
    window.addEventListener('pointerdown', skip, true);
    window.addEventListener('keydown', skip, true);
    return () => {
      window.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', skip, true);
    };
  }, [settings.skippable, finish]);

  const Preset = definition?.component ?? FadePreset;
  const params = presetParams(settings);

  return (
    <div className={`${styles.overlay} ${done ? styles.leaving : ''}`} style={{ background: settings.background, color: settings.foreground }} data-startup-animation={settings.preset} aria-hidden="true">
      <ErrorBoundary label="Startup animation" frame={() => <FadePreset params={params} onDone={finish} reducedMotion={reduced} />}>
        {reduced ? <FadePreset params={params} onDone={finish} reducedMotion /> : <Preset params={params} onDone={finish} reducedMotion={reduced} />}
      </ErrorBoundary>
      {settings.skippable && !done && <span className={`${styles.hint} text-footnote`}>Click or press a key to skip</span>}
    </div>
  );
}

/** The reduced-motion form of every preset: the text (or logo) fades in, then out. */
function FadePreset({ params, onDone }: StartupAnimationProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 600);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  const logo = params.logoUrl as string | null;
  return <div className={styles.center}>{logo ? <img className={styles.logo} src={logo} alt="" /> : <span className={styles.wordmark}>{str(params.text)}</span>}</div>;
}
