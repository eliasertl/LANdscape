import { describe, expect, it } from 'vitest';
import { SHORTCUT_ACTIONS, comboFromEvent, effectiveBindings, findConflicts, formatCombo, isReservedCombo, matchShortcut, parseCombo } from '@landscape/shared';

const key = (k: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('keyboard shortcuts', () => {
  it('parses and formats combos in a canonical form', () => {
    expect(parseCombo('ctrl + alt + arrowleft')).toEqual({ ctrl: true, alt: true, shift: false, meta: false, key: 'arrowleft' });
    expect(formatCombo(parseCombo('alt+ctrl+a')!)).toBe('Ctrl+Alt+A');
    expect(formatCombo(parseCombo('ctrl+space')!)).toBe('Ctrl+Space');
    expect(parseCombo('Ctrl+Alt')).toBeNull();
    expect(parseCombo('Ctrl+A+B')).toBeNull();
    expect(parseCombo('')).toBeNull();
  });

  it('builds combos from key events and ignores lone modifiers', () => {
    expect(comboFromEvent(key('Control', { ctrlKey: true }))).toBeNull();
    expect(comboFromEvent(key('Shift', { shiftKey: true }))).toBeNull();
    expect(formatCombo(comboFromEvent(key('l', { ctrlKey: true, altKey: true }))!)).toBe('Ctrl+Alt+L');
    expect(formatCombo(comboFromEvent(key(' ', { ctrlKey: true }))!)).toBe('Ctrl+Space');
  });

  it('matches events against the effective bindings, defaults included', () => {
    const bindings = effectiveBindings({});
    expect(matchShortcut(bindings, key(' ', { ctrlKey: true }))).toBe('launcher.open');
    expect(matchShortcut(bindings, key('ArrowLeft', { ctrlKey: true, altKey: true }))).toBe('window.snapLeft');
    expect(matchShortcut(bindings, key('ArrowLeft', { ctrlKey: true }))).toBeNull();
    expect(matchShortcut(bindings, key('x'))).toBeNull();
  });

  it('applies overrides: a new combo or "" to unbind, and resets by sending the default', () => {
    const bindings = effectiveBindings({ 'launcher.open': 'Ctrl+Alt+Space', 'window.close': '' });
    expect(bindings['launcher.open']).toBe('Ctrl+Alt+Space');
    expect(bindings['window.close']).toBeNull();
    expect(matchShortcut(bindings, key(' ', { ctrlKey: true }))).toBeNull();
    expect(matchShortcut(bindings, key(' ', { ctrlKey: true, altKey: true }))).toBe('launcher.open');
    expect(effectiveBindings({ 'window.close': 'Ctrl+Alt+W' })['window.close']).toBe('Ctrl+Alt+W');
  });

  it('finds conflicts between actions bound to the same combo', () => {
    expect(findConflicts(effectiveBindings({}))).toEqual({});
    const clash = findConflicts(effectiveBindings({ 'window.close': 'ctrl+alt+m' }));
    expect(clash['window.close']).toEqual(['window.minimize']);
    expect(clash['window.minimize']).toEqual(['window.close']);
  });

  it('flags combos the browser reserves', () => {
    expect(isReservedCombo(parseCombo('Meta+L')!)).toMatch(/reserved/);
    expect(isReservedCombo(parseCombo('Ctrl+W')!)).toMatch(/reserved/);
    expect(isReservedCombo(parseCombo('A')!)).toMatch(/typing/);
    expect(isReservedCombo(parseCombo('Ctrl+Alt+W')!)).toBeNull();
    expect(isReservedCombo(parseCombo('Ctrl+Shift+W')!)).toBeNull();
  });

  it('ships defaults that do not collide and avoid the Windows key', () => {
    expect(findConflicts(effectiveBindings({}))).toEqual({});
    for (const action of SHORTCUT_ACTIONS) {
      if (!action.defaultCombo) continue;
      const combo = parseCombo(action.defaultCombo);
      expect(combo).not.toBeNull();
      expect(combo?.meta).toBe(false);
      expect(isReservedCombo(combo!)).toBeNull();
    }
  });
});
