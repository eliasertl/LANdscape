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

async function openSettings(page: Page) {
  await page.locator('[data-taskbar-search]').click();
  await page.getByRole('searchbox', { name: 'Search apps and shortcuts' }).fill('sett');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('taskbar, windows and keyboard', () => {
  test.skip(({ isMobile, viewport }) => Boolean(isMobile) || (viewport?.width ?? 1000) < 768, 'desktop layout only');

  test.afterEach(async ({ page }) => {
    // Skipped tests (phone project) never logged in; nothing to restore.
    if (!page.url().startsWith('http')) return;
    await patchSettings(page, {
      taskbar: { style: 'floating', position: 'bottom', autoHide: false, size: 'm', showTitles: false, pinned: [] },
      windows: { buttons: 'mac', animation: 'normal', openMaximized: false, cascade: true },
      keyboard: { bindings: { 'window.snapLeft': 'Ctrl+Alt+ArrowLeft' } },
    });
  });

  test('every taskbar style and position renders, auto-hide reveals at the edge, and maximize respects the bar', async ({ page }) => {
    await login(page);
    const host = page.locator('[data-taskbar=""]');
    const bar = host.getByRole('toolbar', { name: 'Taskbar' });
    for (const style of ['win10', 'win11', 'dock', 'floating']) {
      await patchSettings(page, { taskbar: { style } });
      await page.reload();
      await expect(page.locator('[data-taskbar-search]')).toBeVisible();
      await expect(host).toHaveAttribute('data-taskbar-style', style);
      const box = (await bar.boundingBox())!;
      if (style === 'win10' || style === 'win11') expect(box.width).toBeGreaterThan(1400);
      else expect(box.width).toBeLessThan(1400);
    }

    // Top docked bar: a maximized window starts below it.
    await patchSettings(page, { taskbar: { style: 'win11', position: 'top', size: 'l' } });
    await page.reload();
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();
    await expect(host).toHaveAttribute('data-taskbar-position', 'top');
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: 'Maximize window' }).click();
    const maximized = (await settings.boundingBox())!;
    expect(Math.round(maximized.y)).toBe(68);
    expect(Math.round(maximized.height)).toBe(900 - 68);
    await settings.getByRole('button', { name: 'Restore window' }).click();

    // Left bar: the desktop grid and the start menu move right of it.
    await patchSettings(page, { taskbar: { style: 'floating', position: 'left', size: 'm' } });
    await page.reload();
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();
    const clock = (await page.getByRole('group', { name: 'Clock widget' }).boundingBox())!;
    expect(clock.x).toBeGreaterThan(72);

    // Auto-hide: the bar is off screen until the pointer reaches the edge.
    await patchSettings(page, { taskbar: { position: 'bottom', autoHide: true } });
    await page.reload();
    await page.mouse.move(700, 400);
    await expect.poll(async () => (await host.boundingBox())!.y).toBeGreaterThan(900 - 5);
    await page.mouse.move(700, 899);
    await expect.poll(async () => (await host.boundingBox())!.y, { timeout: 3000 }).toBeLessThan(900 - 40);
  });

  test('pins an app, shows its running state, and the clock follows the format settings', async ({ page }) => {
    await login(page);
    const settings = await openSettings(page);
    const item = page.locator('[data-taskbar-app="app:settings"]');
    await expect(item).toHaveAttribute('data-running', 'true');
    await item.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Pin to taskbar' }).click();
    await expect(item).toHaveAttribute('data-pinned', 'true');
    await settings.getByRole('button', { name: 'Close window' }).click();
    await expect(item).toHaveAttribute('data-running', 'false');
    await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
    await item.click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await expect(item).toHaveAttribute('data-running', 'true');

    await patchSettings(page, { taskbar: { clock: { seconds: true, hours: '24', showDate: false } } });
    await page.reload();
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();
    await expect.poll(() => page.locator('[data-taskbar-clock]').innerText()).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  test('windows snap to halves by drag with a preview, by keyboard, and switch to Windows-style buttons', async ({ page }) => {
    await login(page);
    const settings = await openSettings(page);
    const bar = settings.locator('[data-title-buttons]');
    const box = (await bar.boundingBox())!;
    // Drag the title bar to the left edge: a preview appears, releasing snaps to the left half.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(3, 400, { steps: 15 });
    await expect(page.locator('[data-snap-preview]')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('[data-snap-preview]')).toHaveCount(0);
    let rect = (await settings.boundingBox())!;
    expect(Math.round(rect.x)).toBe(0);
    expect(Math.round(rect.width)).toBe(720);

    // Keyboard: Ctrl+Alt+Right snaps to the right half, Ctrl+Alt+Up maximizes, Ctrl+Alt+Down restores.
    await page.keyboard.press('Control+Alt+ArrowRight');
    rect = (await settings.boundingBox())!;
    expect(Math.round(rect.x)).toBe(720);
    await page.keyboard.press('Control+Alt+ArrowUp');
    await expect(settings.getByRole('button', { name: 'Restore window' })).toBeVisible();
    await page.keyboard.press('Control+Alt+ArrowDown');
    await expect(settings.getByRole('button', { name: 'Maximize window' })).toBeVisible();

    // Windows-style buttons: the close button sits on the right.
    await settings.getByRole('button', { name: 'Windows' }).click();
    await settings.getByRole('radio', { name: 'Windows', exact: true }).click();
    await expect(bar).toHaveAttribute('data-title-buttons', 'windows');
    const close = (await settings.getByRole('button', { name: 'Close window' }).boundingBox())!;
    const barBox = (await bar.boundingBox())!;
    expect(close.x).toBeGreaterThan(barBox.x + barBox.width - 60);
  });

  test('rebinds a shortcut with conflict detection and resets it', async ({ page }) => {
    await login(page);
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: 'Keyboard Shortcuts' }).click();
    const row = settings.locator('[data-shortcut-row="window.snapLeft"]');
    await row.getByRole('button', { name: /Click to change/ }).click();
    await expect(row).toContainText('Press keys');
    await page.keyboard.press('Control+Alt+K');
    await expect(row).toContainText('Ctrl + Alt + K');
    // The new binding works right away.
    await page.keyboard.press('Control+Alt+K');
    const rect = (await settings.boundingBox())!;
    expect(Math.round(rect.width)).toBe(720);
    // A combo another action uses is flagged on both rows.
    await row.getByRole('button', { name: /Click to change/ }).click();
    await page.keyboard.press('Control+Alt+M');
    await expect(row).toContainText('Also used by Minimize window');
    await expect(settings.locator('[data-shortcut-row="window.minimize"]')).toContainText('Also used by Snap window to the left half');
    await row.getByRole('button', { name: 'Reset Snap window to the left half' }).click();
    await expect(row).not.toContainText('Also used by');
    await expect(row).toContainText('Ctrl + Alt + ←');
  });
});
