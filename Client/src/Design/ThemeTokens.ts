/** The design tokens apps may read (theme:read), as currently resolved on <html>. */
const TOKEN_NAMES = [
  '--color-background',
  '--color-secondary-background',
  '--color-tertiary-background',
  '--color-elevated-background',
  '--color-label',
  '--color-secondary-label',
  '--color-tertiary-label',
  '--color-quaternary-label',
  '--color-separator',
  '--color-control-fill',
  '--color-accent',
  '--color-on-accent',
  '--color-destructive',
  '--color-selection',
  '--color-focus-ring',
  '--material-card',
  '--material-widget',
  '--radius',
  '--radius-group',
  '--spacing',
  '--control-height',
  '--font-ui',
  '--font-mono',
  '--system-red',
  '--system-orange',
  '--system-yellow',
  '--system-green',
  '--system-blue',
  '--system-purple',
  '--system-gray',
];

export function currentThemeTokens(): { theme: 'light' | 'dark'; tokens: Record<string, string> } {
  const root = document.documentElement;
  const computed = getComputedStyle(root);
  const tokens: Record<string, string> = {};
  for (const name of TOKEN_NAMES) {
    const value = computed.getPropertyValue(name).trim();
    if (value) tokens[name] = value;
  }
  return { theme: root.dataset.theme === 'dark' ? 'dark' : 'light', tokens };
}
