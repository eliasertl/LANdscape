import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CaretRight, Check } from '@phosphor-icons/react';
import { SPRING } from '../Design/Spring';
import { useSpringStyle, useSpringValue } from '../Design/UseSpring';
import styles from './Menu.module.css';

export type MenuItem =
  | {
      type?: 'item';
      id?: string;
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      checked?: boolean;
      onSelect?: () => void;
    }
  | { type: 'separator' }
  | { type: 'submenu'; id?: string; label: string; icon?: ReactNode; disabled?: boolean; items: MenuItem[] }
  | { type: 'header'; label: string };

export interface MenuPosition {
  x: number;
  y: number;
}

interface MenuProps {
  items: MenuItem[];
  position: MenuPosition;
  onClose: () => void;
  /** Anchor rect for submenus: opens to the right of it. */
  anchor?: DOMRect;
  level?: number;
  minWidth?: number;
  ariaLabel?: string;
}

const MARGIN = 8;

function isSelectable(item: MenuItem): item is Extract<MenuItem, { label: string }> & { type?: 'item' | 'submenu' } {
  return (item.type === undefined || item.type === 'item' || item.type === 'submenu') && !item.disabled;
}

/**
 * Context/popup menu with roving keyboard focus, submenus, viewport clamping
 * and a spring pop-in. Rendered in a portal above everything else.
 */
export function Menu({ items, position, onClose, anchor, level = 0, minWidth = 200, ariaLabel }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<MenuPosition>(position);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [openSubmenu, setOpenSubmenu] = useState<{ index: number; rect: DOMRect } | null>(null);
  const scale = useSpringValue(0.96, SPRING.quick, 0.001);
  const opacity = useSpringValue(0, SPRING.quick, 0.005);
  useSpringStyle(ref, [scale, opacity], ([s, o]) => ({ transform: `scale(${s ?? 1})`, opacity: String(o ?? 1) }));

  useEffect(() => {
    void scale.set(1);
    void opacity.set(1);
  }, [scale, opacity]);

  // Clamp into the viewport after measuring.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    let x = position.x;
    let y = position.y;
    if (anchor) {
      x = anchor.right - 4;
      y = anchor.top - 6;
      if (x + rect.width > window.innerWidth - MARGIN) x = anchor.left - rect.width + 4;
    }
    if (x + rect.width > window.innerWidth - MARGIN) x = Math.max(MARGIN, window.innerWidth - rect.width - MARGIN);
    if (y + rect.height > window.innerHeight - MARGIN) y = Math.max(MARGIN, window.innerHeight - rect.height - MARGIN);
    setPlaced({ x, y });
    element.style.transformOrigin = `${x < position.x ? 'right' : 'left'} ${y < position.y ? 'bottom' : 'top'}`;
  }, [position, anchor]);

  // Close on outside pointer / Escape / resize (top level only).
  useEffect(() => {
    if (level > 0) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && document.querySelector('[data-menu-root]')?.contains(target)) return;
      if (target && [...document.querySelectorAll('[data-menu-root]')].some((m) => m.contains(target))) return;
      onClose();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    const onBlur = () => onClose();
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onBlur);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onBlur);
      window.removeEventListener('blur', onBlur);
    };
  }, [onClose, level]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  const selectableIndexes = items.map((item, i) => (isSelectable(item) ? i : -1)).filter((i) => i >= 0);

  const activate = useCallback(
    (index: number, viaKeyboard: boolean) => {
      const item = items[index];
      if (!item || !isSelectable(item)) return;
      if (item.type === 'submenu') {
        const button = ref.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
        if (button) setOpenSubmenu({ index, rect: button.getBoundingClientRect() });
        if (viaKeyboard) setActiveIndex(index);
        return;
      }
      item.onSelect?.();
      onClose();
    },
    [items, onClose],
  );

  const onKeyDown = (event: KeyboardEvent) => {
    if (selectableIndexes.length === 0) return;
    const current = selectableIndexes.indexOf(activeIndex);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(selectableIndexes[(current + 1) % selectableIndexes.length] ?? -1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(selectableIndexes[(current - 1 + selectableIndexes.length) % selectableIndexes.length] ?? -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(selectableIndexes[0] ?? -1);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(selectableIndexes[selectableIndexes.length - 1] ?? -1);
    } else if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') {
      const item = items[activeIndex];
      if (event.key === 'ArrowRight' && item?.type !== 'submenu') return;
      event.preventDefault();
      activate(activeIndex, true);
    } else if (event.key === 'ArrowLeft' && level > 0) {
      event.preventDefault();
      onClose();
    }
  };

  const menu = (
    <div
      ref={ref}
      className={`${styles.menu} material`}
      style={{ left: placed.x, top: placed.y, minWidth, zIndex: 10000 + level }}
      role="menu"
      aria-label={ariaLabel}
      tabIndex={-1}
      data-menu-root
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, index) => {
        if (item.type === 'separator') return <div key={index} className={styles.separator} role="separator" />;
        if (item.type === 'header')
          return (
            <div key={index} className={styles.header}>
              {item.label}
            </div>
          );
        const active = index === activeIndex || openSubmenu?.index === index;
        const submenu = item.type === 'submenu';
        return (
          <button
            key={item.id ?? index}
            type="button"
            role={submenu ? 'menuitem' : item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
            aria-haspopup={submenu || undefined}
            aria-expanded={submenu ? openSubmenu?.index === index : undefined}
            aria-checked={!submenu && item.checked !== undefined ? item.checked : undefined}
            aria-disabled={item.disabled || undefined}
            data-index={index}
            className={[styles.item, active ? styles.active : '', item.disabled ? styles.disabled : '', !submenu && item.danger ? styles.danger : ''].join(' ')}
            onPointerEnter={(e) => {
              if (item.disabled) return;
              setActiveIndex(index);
              if (submenu) setOpenSubmenu({ index, rect: e.currentTarget.getBoundingClientRect() });
              else setOpenSubmenu(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!item.disabled) activate(index, false);
            }}
            tabIndex={-1}
          >
            <span className={styles.check}>{!submenu && item.checked ? <Check weight="bold" /> : null}</span>
            {item.icon && <span className={styles.icon}>{item.icon}</span>}
            <span className={styles.label}>{item.label}</span>
            {!submenu && item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
            {submenu && (
              <span className={styles.caret}>
                <CaretRight weight="bold" />
              </span>
            )}
          </button>
        );
      })}
      {openSubmenu && items[openSubmenu.index]?.type === 'submenu' && (
        <Menu
          items={(items[openSubmenu.index] as Extract<MenuItem, { type: 'submenu' }>).items}
          position={{ x: openSubmenu.rect.right, y: openSubmenu.rect.top }}
          anchor={openSubmenu.rect}
          level={level + 1}
          onClose={onClose}
          minWidth={180}
        />
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
