import { useUiStore } from '../Store/UiStore';
import styles from './SnapOverlay.module.css';

/** Translucent preview of the half, quarter or full area a dragged window will snap to. */
export function SnapOverlay() {
  const rect = useUiStore((s) => s.windowSnapPreview);
  if (!rect) return null;
  return <div className={styles.overlay} style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} aria-hidden="true" data-snap-preview />;
}
