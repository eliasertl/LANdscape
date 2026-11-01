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

async function patchSettings(page: Page, body: unknown) {
  const response = await page.request.patch('/api/settings', { data: body, headers: { origin: new URL(page.url()).origin } });
  expect(response.status()).toBe(200);
}

test.describe('lock, sessions, startup and cursor', () => {
  test.skip(({ isMobile, viewport }) => Boolean(isMobile) || (viewport?.width ?? 1000) < 768, 'desktop layout only');

  test.afterEach(async ({ page }) => {
    if (!page.url().startsWith('http')) return;
    await patchSettings(page, { startup: { when: 'never' }, cursor: { set: 'system' }, lock: { idleMinutes: 0, message: '', clock: 'digital' } }).catch(() => undefined);
  });

  test('locks server-side with the shortcut, refuses the API, and unlocks with the password', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Control+Alt+L');
    const screen = page.locator('[data-lock-mode="unlock"]');
    await expect(screen).toBeVisible();
    await expect(screen).toContainText('Locked');
    // The API really refuses while locked.
    const refused = await page.request.get('/api/desktop');
    expect(refused.status()).toBe(423);
    await page.getByPlaceholder('Password').fill('wrong');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('alert')).toContainText('Wrong password');
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();
    expect((await page.request.get('/api/desktop')).status()).toBe(200);
  });

  test('shows the lock-screen clock and message, lists sessions and logs the others out', async ({ page, browser }) => {
    await login(page);
    await patchSettings(page, { lock: { clock: 'large', showDate: true, message: 'Welcome home' } });
    const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const second = await other.newPage();
    await login(second);

    await page.locator('[data-taskbar-search]').click();
    await page.getByRole('searchbox', { name: 'Search apps and shortcuts' }).fill('sett');
    await page.keyboard.press('Enter');
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('button', { name: 'Lock & Security' }).click();
    await expect(settings.locator('[data-session-row="current"]')).toHaveCount(1);
    // Earlier specs leave their sessions behind; at least the second browser's must be there.
    expect(await settings.locator('[data-session-row="other"]').count()).toBeGreaterThanOrEqual(1);
    await settings.getByRole('button', { name: 'Log out others' }).click();
    await page.getByRole('button', { name: 'Log out others' }).last().click();
    await expect(settings.locator('[data-session-row="other"]')).toHaveCount(0);
    // The other browser is out: its next call fails and it lands on the login screen.
    await second.reload();
    await expect(second.locator('[data-lock-mode="login"]')).toBeVisible();
    await expect(second.locator('[data-lock-clock]')).toContainText(/\d/);
    await expect(second.getByText('Welcome home')).toBeVisible();
    await other.close();

    await settings.locator('[data-lock-now]').click();
    await expect(page.locator('[data-lock-mode="unlock"]')).toBeVisible();
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();
  });

  test('plays the startup animation after login and on page load, skippable by click', async ({ page }) => {
    await login(page);
    await patchSettings(page, { startup: { when: 'both', preset: 'boot-log', durationMs: 4000, text: 'Hello server' } });
    // On page load: the animation shows before the lock screen / desktop.
    await page.reload();
    const overlay = page.locator('[data-startup-animation="boot-log"]');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Hello server');
    await page.mouse.click(700, 450);
    await expect(overlay).toHaveCount(0);
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();
    // After login: lock, unlock, and it plays again.
    await page.keyboard.press('Control+Alt+L');
    await expect(page.locator('[data-lock-mode="unlock"]')).toBeVisible();
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(overlay).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
    // Preview from Settings with another preset.
    await patchSettings(page, { startup: { preset: 'progress', durationMs: 1500 } });
    await page.reload();
    await page.mouse.click(700, 450);
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();
    await page.locator('[data-taskbar-search]').click();
    await page.getByRole('searchbox', { name: 'Search apps and shortcuts' }).fill('sett');
    await page.keyboard.press('Enter');
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('button', { name: 'Startup' }).click();
    await settings.locator('[data-startup-preview]').click();
    await expect(page.locator('[data-startup-animation="progress"]')).toBeVisible();
    await expect(page.locator('[data-startup-animation="progress"]')).toHaveCount(0, { timeout: 6000 });
  });

  test('applies a built-in cursor set as CSS and sizes it per device', async ({ page }) => {
    await login(page);
    await patchSettings(page, { cursor: { set: 'contrast' } });
    await page.reload();
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();
    const css = () => page.evaluate(() => document.getElementById('landscape-cursor')?.textContent ?? '');
    await expect.poll(css).toContain('cursor: url("data:image/svg+xml');
    expect(await css()).toContain('width%3D%2232%22');
    await page.evaluate(() => (window as unknown as { landscapeDebug: { stores: { device: { getState(): { update(p: unknown): void } } } } }).landscapeDebug.stores.device.getState().update({ cursorScale: 2 }));
    await expect.poll(css).toContain('width%3D%2264%22');
    await page.evaluate(() => (window as unknown as { landscapeDebug: { stores: { device: { getState(): { update(p: unknown): void } } } } }).landscapeDebug.stores.device.getState().update({ cursorScale: 1 }));
    await patchSettings(page, { cursor: { set: 'system' } });
    await page.reload();
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();
    await expect.poll(css).toBe('');
  });
});
