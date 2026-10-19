import { expect, test, type Page } from '@playwright/test';
import { startFixtureService, type FixtureService } from '../Server/ProxyFixture';

const USERNAME = 'admin';
const PASSWORD = 'landscape-test';

// A local service that sends X-Frame-Options: DENY and frame-ancestors 'none'.
let service: FixtureService;
test.beforeAll(async () => {
  service = await startFixtureService('Fixture');
});
test.afterAll(async () => {
  await service.close();
});

async function login(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('Username').fill(USERNAME);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** Creates a shortcut through the API with the page's session (same-origin, like the client). */
async function createShortcut(page: Page, name: string) {
  const baseURL = new URL(page.url()).origin;
  const response = await page.request.post('/api/shortcuts', {
    headers: { origin: baseURL },
    data: { name, url: `${service.origin}/`, iconMode: 'upload', iconFile: null },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; proxyPort: number | null };
}

test.describe('embed proxy on the desktop', () => {
  test.skip(({ isMobile, viewport }) => Boolean(isMobile) || (viewport?.width ?? 1000) < 768, 'desktop layout only');

  test('renders a site that forbids framing through its proxy port, with a badge the setting controls', async ({ page }) => {
    await login(page);
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();

    // Add the shortcut through the dialog: the check reports the block and promises the proxy.
    await page.mouse.click(700, 450, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Add new Shortcut' }).click();
    await page.locator('input[name=url]').fill(`${service.origin}/`);
    await page.locator('input[name=url]').blur();
    await expect(page.getByText('Blocks embedding — will open through the LANdscape proxy')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-proxy-note]')).toContainText('Gets a proxy port when saved');
    await page.locator('input[name=name]').fill('Blocked fixture');
    await page.getByRole('button', { name: 'Add Shortcut' }).click();
    const icon = page.locator('[data-shortcut-id]').filter({ hasText: 'Blocked fixture' });
    await expect(icon).toBeVisible({ timeout: 30_000 });

    await icon.dblclick();
    // Pin the window by id: Settings opens on top of it later.
    const winId = await page.locator('[data-window-id]').last().getAttribute('data-window-id');
    const win = page.locator(`[data-window-id="${winId}"]`);
    const frame = win.locator('iframe');
    await expect(frame).toHaveAttribute('data-frame-kind', 'proxy');
    const src = new URL((await frame.getAttribute('src')) ?? '');
    expect(src.hostname).toBe('127.0.0.1');
    expect(src.port).not.toBe(new URL(page.url()).port);
    await expect(win.frameLocator('iframe').locator('#fixture')).toHaveText('Fixture content');
    const badge = win.locator('[data-proxy-badge]');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', `Embedded via LANdscape proxy (:${src.port})`);

    // Settings → Proxy lists the port and turns the badge off and on for open windows.
    await page.locator('[data-taskbar-search]').click();
    await page.getByRole('searchbox', { name: 'Search apps and shortcuts' }).fill('sett');
    await page.keyboard.press('Enter');
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('button', { name: 'Proxy' }).click();
    await expect(settings.locator(`[data-proxy-port="${src.port}"]`)).toContainText('Blocked fixture');
    await expect(settings.locator(`[data-proxy-port="${src.port}"]`)).toContainText('Listening');
    const toggle = settings.locator('label').filter({ has: page.getByRole('switch') }).first();
    await toggle.click();
    await expect(badge).toHaveCount(0);
    await toggle.click();
    await expect(badge).toBeVisible();
    await settings.getByRole('button', { name: 'Close window' }).click();

    // Switching the shortcut to Direct changes the open window right away.
    await icon.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Edit…' }).click();
    await page.getByRole('radio', { name: 'Direct' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(frame).toHaveAttribute('data-frame-kind', 'direct');
    await expect(badge).toHaveCount(0);
  });
});

test.describe('embed proxy on the phone', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1000) >= 768, 'phone layout only');

  test('opens the proxied site full screen with the port in the header', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('searchbox')).toBeVisible();
    const created = await createShortcut(page, 'Phone fixture');
    expect(created.proxyPort).not.toBeNull();
    await page.reload();
    await page.locator(`[data-launcher-entry="shortcut:${created.id}"]`).click();
    const win = page.getByRole('dialog', { name: 'Phone fixture' });
    await expect(win.locator('iframe')).toHaveAttribute('data-frame-kind', 'proxy');
    await expect(page.frameLocator('[data-window-id] iframe').last().locator('#fixture')).toHaveText('Fixture content');
    await expect(win.locator('[data-proxy-badge]')).toContainText(`:${created.proxyPort}`);
  });
});
