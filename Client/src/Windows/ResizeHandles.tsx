import { usePointerDrag } from '../Hooks/UsePointerDrag';
import styles from './ResizeHandles.module.css';

const EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;

interface ResizeHandlesProps {
  onResize: (edge: string, dx: number, dy: number, phase: 'start' | 'move' | 'end') => void;
}

function Handle({ edge, onResize }: { edge: string; onResize: ResizeHandlesProps['onResize'] }) {
  const onPointerDown = usePointerDrag({
    threshold: 0,
    onStart: () => onResize(edge, 0, 0, 'start'),
    onMove: ({ dx, dy }) => onResize(edge, dx, dy, 'move'),
    onEnd: ({ dx, dy }, dragged) => {
      if (dragged) onResize(edge, dx, dy, 'end');
    },
  });
  return <div className={`${styles.handle} ${styles[edge]}`} onPointerDown={onPointerDown} aria-hidden="true" />;
}

/** Eight invisible resize handles around the window frame. */
export function ResizeHandles({ onResize }: ResizeHandlesProps) {
  return (
    <>
      {EDGES.map((edge) => (
        <Handle key={edge} edge={edge} onResize={onResize} />
      ))}
    </>
  );
}
