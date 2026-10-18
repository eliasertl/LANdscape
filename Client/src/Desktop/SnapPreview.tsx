import { useUiStore } from '../Store/UiStore';
import styles from './SnapPreview.module.css';

/** Faint outline of the grid cell a dragged icon or widget will land in. */
export function SnapPreview() {
  const preview = useUiStore((s) => s.snapPreview);
  if (!preview) return null;
  return (
    <div
      className={styles.preview}
      style={{ transform: `translate(${preview.x}px, ${preview.y}px)`, width: preview.width, height: preview.height }}
      aria-hidden="true"
    />
  );
}
