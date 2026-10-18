import { memo, useEffect, useRef, useState } from 'react';
import { WINDOW_MIN_SIZE } from '@landscape/shared';
import { useWindowStore, type DesktopWindow } from '../Store/WindowStore';
import { useUiStore } from '../Store/UiStore';
import { SPRING, reducedMotion } from '../Design/Spring';
import { useSpringStyle, useSpringValue } from '../Design/UseSpring';
import { usePointerDrag } from '../Hooks/UsePointerDrag';
import { TitleBar } from './TitleBar';
import { ResizeHandles } from './ResizeHandles';
import { WindowContent } from './WindowContent';
import { clampRect, resizeRect, workArea, type Rect } from './WindowGeometry';
import { getApp } from '../Apps/Registry';
import styles from './Window.module.css';

interface WindowProps {
  win: DesktopWindow;
  focused: boolean;
}

function taskbarTarget(appKey: string): { x: number; y: number } | null {
  const element = document.querySelector<HTMLElement>(`[data-taskbar-app="${CSS.escape(appKey)}"]`) ?? document.querySelector<HTMLElement>('[data-taskbar-search]');
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export const Window = memo(function Window({ win, focused }: WindowProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const focus = useWindowStore((s) => s.focus);
  const setRect = useWindowStore((s) => s.setRect);
  const remove = useWindowStore((s) => s.remove);
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize);
  const setInteracting = useUiStore((s) => s.setInteracting);
  const [hidden, setHidden] = useState(false);
  const [resizing, setResizing] = useState(false);
  const minSize = (win.appId && getApp(win.appId)?.minSize) || WINDOW_MIN_SIZE;

  const scale = useSpringValue(0.92, SPRING.window, 0.001);
  const opacity = useSpringValue(0, SPRING.window, 0.005);
  const tx = useSpringValue(0, SPRING.standard, 0.5);
  const ty = useSpringValue(0, SPRING.standard, 0.5);
  useSpringStyle(frameRef, [scale, opacity, tx, ty], ([s, o, x, y]) => ({
    transform: `translate(${x ?? 0}px, ${y ?? 0}px) scale(${s ?? 1})`,
    opacity: String(o ?? 1),
  }));

  // Opening animation.
  useEffect(() => {
    void scale.set(1);
    void opacity.set(1);
  }, [scale, opacity]);

  // Closing animation, then removal.
  useEffect(() => {
    if (!win.closing) return;
    let cancelled = false;
    void Promise.all([scale.set(0.94), opacity.set(0)]).then(() => {
      if (!cancelled) remove(win.id);
    });
    return () => {
      cancelled = true;
    };
  }, [win.closing, win.id, scale, opacity, remove]);

  // Minimize / restore animation toward the taskbar entry.
  const minimizedRef = useRef(win.minimized);
  useEffect(() => {
    if (minimizedRef.current === win.minimized) return;
    minimizedRef.current = win.minimized;
    const frame = frameRef.current;
    if (!frame) return;
    const target = taskbarTarget(win.appKey);
    const center = { x: win.rect.x + win.rect.width / 2, y: win.rect.y + win.rect.height / 2 };
    const dx = target ? target.x - center.x : 0;
    const dy = target ? target.y - center.y : window.innerHeight;
    if (win.minimized) {
      if (reducedMotion()) {
        setHidden(true);
        return;
      }
      let cancelled = false;
      void Promise.all([tx.set(dx, SPRING.standard), ty.set(dy, SPRING.standard), scale.set(0.06, SPRING.standard), opacity.set(0, SPRING.standard)]).then(() => {
        if (!cancelled) setHidden(true);
      });
      return () => {
        cancelled = true;
      };
    }
    setHidden(false);
    if (reducedMotion()) {
      tx.jump(0);
      ty.jump(0);
      scale.jump(1);
      opacity.jump(1);
      return;
    }
    tx.jump(dx);
    ty.jump(dy);
    scale.jump(0.06);
    opacity.jump(0);
    void tx.set(0, SPRING.bounce);
    void ty.set(0, SPRING.bounce);
    void scale.set(1, SPRING.bounce);
    void opacity.set(1, SPRING.standard);
    return undefined;
  }, [win.minimized, win.appKey, win.rect, tx, ty, scale, opacity]);

  // Drag by the title bar.
  const startRectRef = useRef<Rect | null>(null);
  const onTitlePointerDown = usePointerDrag({
    disabled: win.maximized,
    onStart: () => {
      startRectRef.current = win.rect;
      setInteracting(true);
    },
    onMove: ({ dx, dy }) => {
      const start = startRectRef.current;
      if (!start) return;
      setRect(win.id, clampRect({ ...start, x: start.x + dx, y: start.y + dy }, workArea(), minSize));
    },
    onEnd: (_info, dragged) => {
      setInteracting(false);
      if (dragged) setRect(win.id, useWindowStore.getState().windows.find((w) => w.id === win.id)?.rect ?? win.rect, true);
    },
  });

  const onResizeStart = (edge: string, dx: number, dy: number, phase: 'start' | 'move' | 'end') => {
    if (phase === 'start') {
      startRectRef.current = win.rect;
      setInteracting(true);
      setResizing(true);
      return;
    }
    const start = startRectRef.current;
    if (!start) return;
    const next = resizeRect(start, edge, dx, dy, minSize, workArea());
    setRect(win.id, next, phase === 'end');
    if (phase === 'end') {
      setInteracting(false);
      setResizing(false);
    }
  };

  const className = [
    styles.window,
    focused ? styles.focused : '',
    win.maximized ? styles.maximized : '',
    hidden ? styles.hidden : '',
    resizing ? styles.resizing : '',
  ].join(' ');

  return (
    <div
      ref={frameRef}
      className={className}
      style={{ left: win.rect.x, top: win.rect.y, width: win.rect.width, height: win.rect.height, zIndex: win.z }}
      role="dialog"
      aria-label={win.title}
      data-window-id={win.id}
      onPointerDownCapture={() => {
        if (!focused) focus(win.id);
      }}
    >
      <TitleBar win={win} focused={focused} onPointerDown={onTitlePointerDown} onDoubleClick={() => toggleMaximize(win.id)} />
      <div className={styles.content}>
        <WindowContent win={win} />
      </div>
      {!win.maximized && <ResizeHandles onResize={onResizeStart} />}
    </div>
  );
});
