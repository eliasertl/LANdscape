import { expect, test, type Page } from '@playwright/test';

const USERNAME = 'admin';
const PASSWORD = 'landscape-test';

async function login(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('Username').fill(USERNAME);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('[data-taskbar-search]')).toBeVisible();
}

async function openLauncher(page: Page, query: string) {
  const search = page.getByRole('searchbox', { name: 'Search apps and shortcuts' });
  if (!(await search.isVisible())) await page.locator('[data-taskbar-search]').click();
  await search.fill(query);
}

test.describe('notifications, health dots and actions', () => {
  test.skip(({ isMobile, viewport }) => Boolean(isMobile) || (viewport?.width ?? 1000) < 768, 'desktop layout only');

  test('shows a test notification as a toast, in the bell badge and in the center, and marks it read', async ({ page, browser }) => {
    await login(page);
    // Earlier specs may have left monitor notifications behind.
    await page.request.delete('/api/notifications', { headers: { origin: new URL(page.url()).origin } });
    // A second browser receives the same notification over /ws/events.
    const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const second = await other.newPage();
    await login(second);

    await openLauncher(page, 'sett');
    await page.keyboard.press('Enter');
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('button', { name: 'Notifications' }).click();
    await expect(settings.getByText(/In-app toasts|Native notifications need HTTPS|blocked for this site/)).toBeVisible();
    await settings.locator('[data-send-test-notification]').click();
    await expect(page.getByRole('status').filter({ hasText: 'Test notification' })).toBeVisible();
    await expect(page.locator('[data-notification-bell]')).toContainText('1');
    await expect(second.locator('[data-notification-bell]')).toContainText('1', { timeout: 5000 });

    await page.locator('[data-notification-bell]').click();
    const center = page.locator('[data-notification-center]');
    await expect(center).toBeVisible();
    const item = center.locator('[data-notification]').first();
    await expect(item).toHaveAttribute('data-read', 'false');
    await item.click();
    await expect(item).toHaveAttribute('data-read', 'true');
    await expect(page.locator('[data-notification-bell]')).not.toContainText('1');
    await expect(second.locator('[data-notification-bell]')).not.toContainText('1', { timeout: 5000 });
    await center.getByRole('button', { name: 'Clear' }).click();
    await expect(center.getByText('No notifications.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(center).toHaveCount(0);
    await other.close();
  });

  test('shows a health dot on shortcuts and lists them under Service health', async ({ page }) => {
    await login(page);
    const origin = new URL(page.url()).origin;
    const headers = { origin };
    const up = await page.request.post('/api/shortcuts', { data: { name: 'Healthy', url: `${origin}/healthz`, iconMode: 'upload' }, headers });
    const down = await page.request.post('/api/shortcuts', { data: { name: 'Dead', url: 'http://127.0.0.1:9/', iconMode: 'upload' }, headers });
    expect(up.status()).toBe(201);
    const upId = ((await up.json()) as { id: string }).id;
    const downId = ((await down.json()) as { id: string }).id;
    await page.request.post('/api/monitor/check', { headers });
    await page.reload();
    await expect(page.locator(`[data-shortcut-id="${upId}"] [data-health]`)).toHaveAttribute('data-health', 'up');
    await expect(page.locator(`[data-shortcut-id="${downId}"] [data-health]`)).toHaveAttribute('data-health', 'down');
    await expect(page.locator('[data-service-health]')).toHaveAttribute('data-service-health', 'down');

    await openLauncher(page, 'sett');
    await page.keyboard.press('Enter');
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('button', { name: 'Notifications' }).click();
    await expect(settings.locator(`[data-monitor-row="shortcut:${downId}"]`)).toContainText('Down');
    await expect(settings.locator(`[data-monitor-row="shortcut:${upId}"]`)).toContainText('Up');
    // Switching the check off removes the dot and the row.
    await page.request.patch(`/api/shortcuts/${downId}`, { data: { healthCheck: false }, headers });
    await expect(settings.locator(`[data-monitor-row="shortcut:${downId}"]`)).toHaveCount(0);
    for (const id of [upId, downId]) await page.request.delete(`/api/shortcuts/${id}`, { headers });
  });

  test('runs actions from the command palette, with inline parameters', async ({ page }) => {
    await login(page);
    await openLauncher(page, '>');
    await expect(page.locator('[data-entry="action:theme.toggle"]')).toBeVisible();
    await openLauncher(page, 'toggle light');
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).not.toBe(before);
    await page.keyboard.press('Control+Space');
    await page.getByRole('searchbox', { name: 'Search apps and shortcuts' }).fill('toggle light');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(before);

    // An action with a parameter asks for it inline.
    await openLauncher(page, 'open path');
    await page.locator('[data-entry="action:files.open"]').click();
    const params = page.locator('[data-action-params="files.open"]');
    await expect(params).toBeVisible();
    await params.getByLabel('Path').fill('/tmp');
    await params.getByRole('button', { name: 'Run' }).click();
    await expect(page.getByRole('dialog', { name: 'Files' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Files' }).getByRole('button', { name: 'Close window' }).click();

    // The notification center shortcut.
    await page.keyboard.press('Control+Alt+N');
    await expect(page.locator('[data-notification-center]')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
