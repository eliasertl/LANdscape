import styles from './Spinner.module.css';

export function Spinner({ size = 16, label = 'Loading' }: { size?: number; label?: string }) {
  return (
    <span className={styles.spinner} style={{ width: size, height: size }} role="status" aria-label={label}>
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className={styles.blade} style={{ transform: `rotate(${i * 45}deg) translateY(-${size * 0.34}px)`, animationDelay: `${(i * 100) / 8 - 100}ms` }} />
      ))}
    </span>
  );
}
