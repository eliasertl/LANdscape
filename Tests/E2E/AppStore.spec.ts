import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const USERNAME = 'admin';
const PASSWORD = 'landscape-test';
const TEMPLATE_ZIP = path.resolve('Catalog', 'dist', 'template-1.0.0.zip');

async function login(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('Username').fill(USERNAME);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('[data-taskbar-search]')).toBeVisible();
}

async function openApp(page: Page, name: string) {
  await page.locator('[data-taskbar-search]').click();
  await page.getByRole('searchbox', { name: 'Search apps and shortcuts' }).fill(name);
  await page.keyboard.press('Enter');
}

test.describe('app platform', () => {
  test.skip(({ isMobile, viewport }) => Boolean(isMobile) || (viewport?.width ?? 1000) < 768, 'desktop layout only');

  test('installs the template app from a zip, runs it sandboxed through the SDK, and uninstalls it', async ({ page }) => {
    await login(page);
    await openApp(page, 'app store');
    const store = page.getByRole('dialog', { name: 'App Store' });
    await expect(store).toBeVisible();
    await store.locator('[data-store-tab="install"]').click();
    await store.locator('[data-bundle-file]').setInputFiles({ name: 'template-1.0.0.zip', mimeType: 'application/zip', buffer: readFileSync(TEMPLATE_ZIP) });
    const approval = page.getByRole('dialog', { name: /Install Template 1.0.0/ });
    await expect(approval).toBeVisible();
    await expect(approval.locator('[data-permission="storage"]')).toBeVisible();
    await approval.locator('[data-approve-install]').click();
    await expect(approval).toHaveCount(0);
    await store.locator('[data-store-tab="installed"]').click();
    await expect(store.locator('[data-installed-app="template"]')).toBeVisible();

    // The app shows up in the launcher and opens as a sandboxed frame; its window talks to LANdscape through the SDK.
    await openApp(page, 'template');
    const win = page.getByRole('dialog', { name: 'Template' });
    await expect(win).toBeVisible();
    const iframe = win.locator('iframe[data-app-frame="template"]');
    await expect(iframe).toHaveAttribute('sandbox', /allow-scripts/);
    await expect(iframe).not.toHaveAttribute('sandbox', /allow-same-origin/);
    const frame = win.frameLocator('iframe[data-app-frame="template"]');
    await expect(frame.locator('#context')).toContainText('surface "window"');
    await frame.locator('#count').click();
    await frame.locator('#count').click();
    await expect(frame.locator('#count')).toHaveText('Clicked 2 times');
    // The value went through the broker into the per-app storage.
    const origin = new URL(page.url()).origin;
    const stored = await page.request.get('/api/apps/template/storage/count', { headers: { origin } });
    expect(await stored.json()).toEqual({ value: 2 });
    // A notification from inside the frame reaches the desktop.
    await frame.locator('#notify').click();
    await expect(page.getByRole('status').filter({ hasText: 'Hello from the template' })).toBeVisible();
    // The frame has no network: its document was built server-side with everything inlined.
    const srcdoc = await page.request.get(`/apps/frame/template/window/main?nonce=${'b'.repeat(32)}`, { headers: { origin } });
    expect(srcdoc.headers()['content-security-policy']).toContain("connect-src 'none'");
    await win.getByRole('button', { name: 'Close window' }).click();

    // The widget from the manifest can be added and renders the stored counter.
    await page.mouse.click(1300, 760, { button: 'right' }); // free desktop below the App Store window
    await page.getByRole('menuitem', { name: 'Add Widget' }).hover();
    await page.getByRole('menuitem', { name: 'Template counter' }).click();
    const widget = page.getByRole('group', { name: 'Template counter widget' });
    await expect(widget).toBeVisible();
    await expect(widget.frameLocator('iframe').locator('#value')).toHaveText('2');

    // The app's action is in the command palette and runs in the background page.
    await openApp(page, 'say hello'); // Enter launches the action; it asks for its parameter
    await page.locator('[data-action-params="template.greet"]').getByLabel('Name').fill('Server');
    await page.locator('[data-action-params="template.greet"]').getByRole('button', { name: 'Run' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Hello, Server!' })).toBeVisible({ timeout: 10_000 });

    // A permission can be revoked; the SDK call then fails inside the app.
    await openApp(page, 'app store');
    await store.locator('[data-store-tab="installed"]').click();
    const card = store.locator('[data-installed-app="template"]');
    await card.locator('label').filter({ hasText: 'storage' }).locator('input[role="switch"]').evaluate((el) => (el as HTMLInputElement).click());
    await expect.poll(async () => ((await (await page.request.get('/api/apps', { headers: { origin } })).json()) as { apps: { granted: string[] }[] }).apps[0]?.granted).not.toContain('storage');
    expect((await page.request.get('/api/apps/template/storage/count', { headers: { origin } })).status()).toBe(403);

    // Uninstall removes the widget, the files and the launcher entry.
    await card.locator('[data-uninstall-app="template"]').click();
    await page.getByRole('button', { name: 'Uninstall' }).last().click();
    await expect(store.locator('[data-installed-app="template"]')).toHaveCount(0);
    await expect(widget).toHaveCount(0);
    expect((await page.request.get('/api/apps/template/storage/count', { headers: { origin } })).status()).toBe(404);
    await store.getByRole('button', { name: 'Close window' }).click();
    await openApp(page, 'template');
    await expect(page.locator('[data-entry="app:template"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('shows the bundled catalog when the live one is unreachable', async ({ page }) => {
    await login(page);
    await openApp(page, 'app store');
    const store = page.getByRole('dialog', { name: 'App Store' });
    await expect(store.locator('[data-catalog-app="template"]')).toBeVisible();
    // Bundled catalog = the server could not reach GitHub (the E2E server has no live URL override either way).
    await store.locator('[data-catalog-app="template"]').click();
    await expect(store.locator('[data-catalog-detail]')).toContainText('Template');
    await expect(store.locator('[data-catalog-detail] [data-install-app]')).toBeVisible();
    // The zip ships with the bundled index, so the install works without GitHub.
    await store.locator('[data-catalog-detail] [data-install-app]').click();
    const approval = page.getByRole('dialog', { name: /Install Template 1.0.0/ });
    await approval.locator('[data-approve-install]').click();
    await expect(approval).toHaveCount(0);
    await expect(store.locator('[data-catalog-detail]')).toContainText('Installed');
    await store.locator('[data-store-tab="installed"]').click();
    await store.locator('[data-uninstall-app="template"]').click();
    await page.getByRole('button', { name: 'Uninstall' }).last().click();
    await expect(store.locator('[data-installed-app="template"]')).toHaveCount(0);
  });
});
