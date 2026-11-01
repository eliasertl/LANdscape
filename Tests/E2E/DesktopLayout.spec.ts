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

async function createShortcut(page: Page, name: string): Promise<string> {
  const response = await page.request.post('/api/shortcuts', { data: { name, url: 'http://127.0.0.1:9/', iconMode: 'upload' }, headers: { origin: new URL(page.url()).origin } });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** Removes what a test created so later specs find an empty desktop around the usual click points. */
async function cleanup(page: Page, shortcutIds: string[], widgetSizeReset?: string) {
  const headers = { origin: new URL(page.url()).origin };
  for (const id of shortcutIds) await page.request.delete(`/api/shortcuts/${id}`, { headers });
  if (widgetSizeReset) await page.request.patch(`/api/widgets/${widgetSizeReset}`, { data: { size: 'm' }, headers });
}

async function drag(page: Page, selector: string, dx: number, dy: number) {
  const box = (await page.locator(selector).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + 30 + dy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

test.describe('anchored desktop layout', () => {
  test.skip(({ isMobile, viewport }) => Boolean(isMobile) || (viewport?.width ?? 1000) < 768, 'desktop layout only');

  test('an icon dropped at the right edge stays at the right edge on an ultra-wide screen, centered items stay centered', async ({ page }) => {
    await login(page);
    const edgeId = await createShortcut(page, 'Edge');
    const midId = await createShortcut(page, 'Middle');
    await page.reload();
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();

    // Drag "Edge" to the bottom-right corner and "Middle" to the center of the 1440 × 900 screen.
    const edge = page.locator(`[data-shortcut-id="${edgeId}"]`);
    const mid = page.locator(`[data-shortcut-id="${midId}"]`);
    let box = (await edge.boundingBox())!;
    await drag(page, `[data-shortcut-id="${edgeId}"]`, 1440 - box.x - box.width - 10, 900 - 72 - box.y - box.height - 10);
    box = (await mid.boundingBox())!;
    await drag(page, `[data-shortcut-id="${midId}"]`, 720 - box.x - box.width / 2, 414 - box.y - box.height / 2);
    const edgeAt1440 = (await edge.boundingBox())!;
    const midAt1440 = (await mid.boundingBox())!;
    expect(edgeAt1440.x + edgeAt1440.width).toBeGreaterThan(1440 - 100);
    expect(Math.abs(midAt1440.x + midAt1440.width / 2 - 720)).toBeLessThan(60);
    await page.waitForTimeout(600); // positions flush

    // The same layout on an ultra-wide monitor.
    await page.setViewportSize({ width: 3440, height: 1440 });
    await page.reload();
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();
    const edgeAt3440 = (await edge.boundingBox())!;
    const midAt3440 = (await mid.boundingBox())!;
    expect(edgeAt3440.x + edgeAt3440.width).toBeGreaterThan(3440 - 100);
    expect(edgeAt3440.y + edgeAt3440.height).toBeGreaterThan(1440 - 72 - 100);
    expect(Math.abs(midAt3440.x + midAt3440.width / 2 - 1720)).toBeLessThan(100);
    // Items that were left as they are keep their top-left cell.
    const clock = (await page.getByRole('group', { name: 'Clock widget' }).boundingBox())!;
    expect(clock.x).toBeLessThan(40);
    await cleanup(page, [edgeId, midId]);
  });

  test('folders hold shortcuts, widgets resize, and desktop settings change the grid', async ({ page }) => {
    await login(page);
    const id = await createShortcut(page, 'Inside');
    await page.reload();
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();

    // New folder from the desktop menu.
    await page.mouse.click(900, 300, { button: 'right' });
    await page.getByRole('menuitem', { name: 'New Folder…' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Media');
    await page.getByRole('button', { name: 'Create' }).click();
    const folder = page.locator('[data-folder-id]');
    await expect(folder).toBeVisible();

    // Drop the shortcut onto the folder: it leaves the desktop and shows up in the popover.
    const target = (await folder.boundingBox())!;
    const icon = page.locator(`[data-shortcut-id="${id}"]`);
    const from = (await icon.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + 30);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect(icon).toHaveCount(0);
    await folder.dblclick();
    const popover = page.locator('[data-folder-popover]');
    await expect(popover.locator(`[data-folder-item="${id}"]`)).toBeVisible();
    await page.keyboard.press('Escape');

    // Rename, then delete: the shortcut comes back onto the desktop.
    await folder.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Videos');
    await page.getByRole('button', { name: 'Rename' }).click();
    await expect(folder).toContainText('Videos');
    await folder.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete folder' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(folder).toHaveCount(0);
    await expect(icon).toBeVisible();

    // Widget size picker.
    const clock = page.getByRole('group', { name: 'Clock widget' });
    const before = (await clock.boundingBox())!;
    await clock.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Size' }).hover();
    await page.getByRole('menuitemcheckbox', { name: /Large/ }).click();
    await expect(clock).toHaveAttribute('data-widget-size', 'l');
    const after = (await clock.boundingBox())!;
    expect(after.width).toBeGreaterThan(before.width);
    expect(after.height).toBeGreaterThan(before.height);

    // Settings → Desktop: large icons widen the grid cell; hiding icons removes shortcuts but keeps widgets.
    await page.locator('[data-taskbar-search]').click();
    await page.getByRole('searchbox', { name: 'Search apps and shortcuts' }).fill('sett');
    await page.keyboard.press('Enter');
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('button', { name: 'Desktop' }).click();
    await settings.getByRole('radio', { name: 'Large' }).click();
    await expect.poll(async () => (await icon.boundingBox())!.width).toBe(112);
    await settings.getByRole('radio', { name: 'Medium' }).click();
    await settings.locator('label').filter({ has: page.getByRole('switch') }).first().click();
    await expect(icon).toHaveCount(0);
    await expect(clock).toBeVisible();
    await settings.locator('label').filter({ has: page.getByRole('switch') }).first().click();
    await expect(icon).toBeVisible();
    await expect(settings.locator('[data-reanchor]')).toBeVisible();
    await cleanup(page, [id], (await clock.getAttribute('data-widget-id')) ?? undefined);
  });

  test('accent color changes the tokens with a contrast-checked text color', async ({ page }) => {
    await login(page);
    await page.locator('[data-taskbar-search]').click();
    await page.getByRole('searchbox', { name: 'Search apps and shortcuts' }).fill('sett');
    await page.keyboard.press('Enter');
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('radio', { name: 'yellow' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--color-accent'))).toBe('#ffcc00');
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--color-on-accent'))).toBe('#000000');
    await settings.getByRole('radio', { name: 'blue' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--color-accent'))).toBe('');
  });
});
