import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { StartupAnimationProps } from '../Platform/Registries';
import styles from './StartupAnimation.module.css';

/** Preset params are untyped (apps contribute presets too); only strings are used as text. */
function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Built-in presets. Each ends by calling onDone after `durationMs`; the host enforces a ceiling. */

function useDone(onDone: () => void, ms: number) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, ms);
    return () => window.clearTimeout(timer);
  }, [onDone, ms]);
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 1. The logo (or wordmark) fades and settles, then fades out. */
export function LogoFadePreset({ params, onDone }: StartupAnimationProps) {
  const duration = number(params.durationMs, 2200);
  useDone(onDone, duration);
  const logo = params.logoUrl as string | null;
  const style = { '--startup-duration': `${duration}ms` } as CSSProperties;
  return (
    <div className={`${styles.center} ${styles.fadeIn}`} style={style}>
      {logo ? params.logoIsVideo ? <video className={styles.logo} src={logo} autoPlay muted playsInline /> : <img className={styles.logo} src={logo} alt="" /> : <span className={styles.wordmark}>{str(params.text)}</span>}
    </div>
  );
}

const BOOT_LINES = [
  'LANdscape boot sequence',
  'Loading design tokens ............ ok',
  'Mounting /host/proc (read-only) ... ok',
  'Starting metrics hub .............. ok',
  'Opening SSH pool .................. ok',
  'Checking embed proxy ports ........ idle',
  'Restoring window memory ........... ok',
  'Placing widgets on the grid ....... ok',
  'Welcome.',
];

/** 2. Terminal-style boot log typed line by line. */
export function BootLogPreset({ params, onDone }: StartupAnimationProps) {
  const duration = number(params.durationMs, 2200);
  const speed = number(params.speed, 1);
  const [count, setCount] = useState(0);
  useDone(onDone, duration);
  useEffect(() => {
    const step = Math.max(40, duration / (BOOT_LINES.length + 1) / speed);
    const timer = window.setInterval(() => setCount((c) => Math.min(BOOT_LINES.length, c + 1)), step);
    return () => window.clearInterval(timer);
  }, [duration, speed]);
  const lines = [...BOOT_LINES.slice(0, count)];
  if (params.text) lines[0] = str(params.text);
  return (
    <pre className={styles.log}>
      {lines.join('\n')}
      <span className={styles.cursorBlink}>▌</span>
    </pre>
  );
}

/** 3. Particles burst from the center and settle into a soft field, revealing the wallpaper tint. */
export function ParticlesPreset({ params, onDone }: StartupAnimationProps) {
  const duration = number(params.durationMs, 2200);
  const speed = number(params.speed, 1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useDone(onDone, duration);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    const color = str(params.foreground, '#ffffff');
    const particles = Array.from({ length: 160 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const velocity = (0.35 + Math.random() * 0.9) * speed;
      return { angle, velocity, size: 1 + Math.random() * 2.5, drift: Math.random() * Math.PI * 2 };
    });
    const start = performance.now();
    let frame = 0;
    const draw = (time: number) => {
      const t = Math.min(1, (time - start) / duration);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const spread = Math.min(canvas.width, canvas.height) * 0.45;
      for (const p of particles) {
        const eased = 1 - (1 - t) ** 3;
        const distance = eased * spread * p.velocity;
        const x = cx + Math.cos(p.angle) * distance + Math.sin(time / 600 + p.drift) * 6 * dpr;
        const y = cy + Math.sin(p.angle) * distance + Math.cos(time / 700 + p.drift) * 6 * dpr;
        context.globalAlpha = Math.max(0, 1 - t * 1.1) * 0.9;
        context.fillStyle = color;
        context.beginPath();
        context.arc(x, y, p.size * dpr, 0, Math.PI * 2);
        context.fill();
      }
      if (t < 1) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [duration, speed, params.foreground]);
  return (
    <>
      <canvas ref={canvasRef} className={styles.canvas} />
      <span className={styles.wordmark} style={{ position: 'relative', opacity: 0.9 }}>
        {str(params.text)}
      </span>
    </>
  );
}

/** 4. The wallpaper zooms in from a blur; the text sits on top. */
export function ZoomPreset({ params, onDone }: StartupAnimationProps) {
  const duration = number(params.durationMs, 2200);
  useDone(onDone, duration);
  const style = { '--startup-duration': `${duration}ms` } as CSSProperties;
  const wallpaper = document.querySelector<HTMLImageElement>('[data-wallpaper-layer]')?.src ?? null;
  return (
    <>
      <div className={styles.zoomWallpaper} style={{ ...style, backgroundImage: wallpaper ? `url("${wallpaper}")` : undefined }} />
      <span className={styles.wordmark} style={{ position: 'relative', textShadow: '0 2px 24px rgba(0,0,0,0.5)' }}>
        {str(params.text)}
      </span>
    </>
  );
}

/** 5. A minimal progress line under the wordmark. */
export function ProgressPreset({ params, onDone }: StartupAnimationProps) {
  const duration = number(params.durationMs, 2200);
  useDone(onDone, duration);
  const style = { '--startup-duration': `${duration}ms` } as CSSProperties;
  return (
    <div className={styles.center} style={style}>
      <span className={styles.wordmark}>{str(params.text)}</span>
      <div className={styles.progressTrack}>
        <div className={styles.progressFill} />
      </div>
    </div>
  );
}
