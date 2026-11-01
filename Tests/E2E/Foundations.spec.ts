import { expect, test, type Page } from '@playwright/test';

const USERNAME = 'admin';
const PASSWORD = 'landscape-test';

async function login(page: Page, path = '/') {
  await page.goto(path);
  await page.getByPlaceholder('Username').fill(USERNAME);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('[data-taskbar-search]')).toBeVisible();
}

/** Minimal view of window.landscapeDebug (Client/src/Platform/DebugHandle.ts) for page.evaluate. */
interface Debug {
  registries: Record<string, { register(entry: unknown): () => void; get(id: string): Record<string, unknown> | undefined }>;
  stores: Record<string, { getState(): Record<string, (...args: unknown[]) => unknown> }>;
}

test.describe('foundations', () => {
  test.skip(({ isMobile, viewport }) => Boolean(isMobile) || (viewport?.width ?? 1000) < 768, 'desktop layout only');

  test('a crashing widget or app only breaks itself', async ({ page }) => {
    await login(page);
    await page.evaluate(async () => {
      const debug = (window as unknown as { landscapeDebug: Debug }).landscapeDebug;
      const icon = debug.registries.apps?.get('settings')?.icon;
      const boom = () => {
        throw new Error('Deliberate test failure');
      };
      debug.registries.widgets?.register({ id: 'crash-test', name: 'Crash test', description: '', icon, component: boom, metric: null, size: { cols: 2, rows: 1 }, defaultIntervalMs: 5000 });
      debug.registries.apps?.register({ id: 'crash-test', name: 'Crash test', description: '', icon, color: '#f00', component: boom, defaultSize: { width: 500, height: 300 }, requires: null, single: true });
      await debug.stores.desktop?.getState().addWidget?.('crash-test', 600, 240, { intervalMs: 5000 });
      debug.stores.windows?.getState().open?.({ kind: 'app', appId: 'crash-test', title: 'Crash test' });
    });
    const widgetCard = page.locator('[data-error-boundary="Crash test widget"]');
    await expect(widgetCard).toContainText('Crash test widget stopped working');
    await expect(widgetCard).toContainText('Deliberate test failure');
    const windowCard = page.locator('[data-error-boundary="Crash test window"]');
    await expect(windowCard).toBeVisible();
    await expect(windowCard.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(windowCard.getByRole('button', { name: 'Copy details' })).toBeVisible();

    // The rest of the desktop keeps working: other widgets render and apps still open.
    await expect(page.getByRole('group', { name: 'Clock widget' })).toBeVisible();
    await page.locator('[data-taskbar-search]').click();
    await page.getByRole('searchbox', { name: 'Search apps and shortcuts' }).fill('sett');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();

    // Clean up the stored widget for the other tests.
    await page.evaluate(async () => {
      const debug = (window as unknown as { landscapeDebug: Debug }).landscapeDebug;
      const state = debug.stores.desktop?.getState() as unknown as { widgets: { id: string; type: string }[]; removeWidget(id: string): Promise<void> };
      for (const w of state.widgets.filter((x) => x.type === 'crash-test')) await state.removeWidget(w.id);
    });
  });

  test('safe mode starts from the lock screen, shows a banner and leaves with one click', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-safe-mode-link]').click();
    await expect(page).toHaveURL(/safe=1/);
    await expect(page.locator('[data-safe-mode-link]')).toContainText('Safe mode is on');
    await page.getByPlaceholder('Username').fill(USERNAME);
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    const banner = page.locator('[data-safe-mode-banner]');
    await expect(banner).toContainText('Safe mode.');
    // Survives a reload without the parameter (kept for this tab).
    await page.goto('/');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Leave safe mode' }).click();
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();
    await expect(banner).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has('safe')).toBe(false);
  });

  test('UI scale is a per-device setting', async ({ page, browser }) => {
    await login(page);
    await page.locator('[data-taskbar-search]').click();
    await page.getByRole('searchbox', { name: 'Search apps and shortcuts' }).fill('sett');
    await page.keyboard.press('Enter');
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings.getByText('This device').first()).toBeVisible();
    await settings.getByRole('combobox', { name: 'UI scale' }).selectOption('1.25');
    await expect.poll(() => page.evaluate(() => document.documentElement.style.zoom)).toBe('1.25');
    // Windows still fit the (now smaller) layout viewport.
    const box = await settings.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1440 + 1);
    await page.reload();
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe('1.25');

    // A second browser (its own localStorage) keeps the default.
    const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const second = await other.newPage();
    await login(second);
    expect(await second.evaluate(() => document.documentElement.style.zoom)).toBe('');
    await other.close();

    // Safe mode ignores the scale.
    await page.goto('/?safe=1');
    await expect(page.locator('[data-safe-mode-banner]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe('');
    await page.locator('[data-safe-mode-banner]').getByRole('button', { name: 'Leave safe mode' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.zoom)).toBe('1.25');
    await page.evaluate(() => localStorage.clear());
  });
});
