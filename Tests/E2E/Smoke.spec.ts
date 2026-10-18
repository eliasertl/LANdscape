import { expect, test, type Page } from '@playwright/test';

const USERNAME = 'admin';
const PASSWORD = 'landscape-test';

async function login(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('Username').fill(USERNAME);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** Waits until window open/restore springs have settled (transform back to identity). */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLElement>('[data-window-id]')].every((el) => /scale\(1\)$/.test(el.style.transform) && el.style.opacity === '1'),
  );
}

test.describe('desktop', () => {
  test.skip(({ isMobile, viewport }) => Boolean(isMobile) || (viewport?.width ?? 1000) < 768, 'desktop layout only');

  test('rejects wrong credentials and accepts the right ones', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Username').fill(USERNAME);
    await page.getByPlaceholder('Password').fill('wrong');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toContainText('Wrong username or password');
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();
  });

  test('creates a shortcut, opens windows, drags, minimizes, maximizes and persists', async ({ page }) => {
    await login(page);
    await expect(page.locator('[data-taskbar-search]')).toBeVisible();

    // Add a shortcut via the desktop context menu (example.com allows framing).
    await page.mouse.click(700, 450, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Add new Shortcut' }).click();
    await page.locator('input[name=url]').fill('https://example.com');
    await page.locator('input[name=name]').fill('Example');
    await page.getByRole('button', { name: 'Add Shortcut' }).click();
    const icon = page.locator('[data-shortcut-id]').filter({ hasText: 'Example' });
    await expect(icon).toBeVisible({ timeout: 30_000 });

    // Two windows from the same shortcut.
    await icon.dblclick();
    await expect(page.locator('[data-window-id]')).toHaveCount(1);
    await icon.dblclick();
    await expect(page.locator('[data-window-id]')).toHaveCount(2);
    await expect(page.locator('[data-taskbar-app]')).toHaveCount(1);
    await expect(page.locator('[data-taskbar-app]')).toContainText('2');

    // Drag the top window.
    const win = page.locator('[data-window-id]').last();
    await settled(page);
    const before = await win.boundingBox();
    if (!before) throw new Error('no window box');
    await page.mouse.move(before.x + before.width / 2, before.y + 18);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 150, before.y + 18 + 60, { steps: 10 });
    await page.mouse.up();
    const after = await win.boundingBox();
    expect(Math.round(after!.x - before.x)).toBe(150);
    expect(Math.round(after!.y - before.y)).toBe(60);

    // Minimize, restore via the taskbar group menu, maximize, restore.
    await win.getByRole('button', { name: 'Minimize window' }).click();
    await expect(win).toBeHidden({ timeout: 5_000 });
    await page.locator('[data-taskbar-app]').click({ button: 'right' });
    await page.getByRole('menuitemcheckbox', { name: /minimized/ }).click();
    await expect(win).toBeVisible();
    // Clicking the group button minimizes the focused window (one per click); once all are minimized it restores one.
    await page.locator('[data-taskbar-app]').click();
    await expect(win).toBeHidden({ timeout: 5_000 });
    await page.locator('[data-taskbar-app]').click();
    await expect(page.locator('[data-window-id]:visible')).toHaveCount(0);
    await page.locator('[data-taskbar-app]').click();
    await expect(page.locator('[data-window-id]:visible')).toHaveCount(1);
    await page.locator('[data-taskbar-app]').click({ button: 'right' });
    await page.getByRole('menuitemcheckbox', { name: /minimized/ }).click();
    await expect(win).toBeVisible();
    await settled(page);

    // Maximize and restore the window that is now on top (the one restored last).
    const top = page.locator('[data-window-id]').first();
    const topBefore = await top.boundingBox();
    await top.getByRole('button', { name: 'Maximize window' }).click();
    const maximized = await top.boundingBox();
    expect(maximized!.width).toBeGreaterThan(topBefore!.width + 100);
    await top.getByRole('button', { name: 'Restore window' }).click();
    const restored = await top.boundingBox();
    expect(Math.round(restored!.width)).toBe(Math.round(topBefore!.width));

    // Drag the icon and reload: position persists.
    const iconBox = await icon.boundingBox();
    await page.mouse.move(iconBox!.x + 40, iconBox!.y + 30);
    await page.mouse.down();
    await page.mouse.move(iconBox!.x + 40 + 200, iconBox!.y + 30 + 100, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    const moved = await icon.boundingBox();
    await page.reload();
    await expect(icon).toBeVisible();
    const afterReload = await icon.boundingBox();
    expect(Math.round(afterReload!.x)).toBe(Math.round(moved!.x));
    expect(Math.round(afterReload!.y)).toBe(Math.round(moved!.y));

    // Window memory: reopening uses the geometry of the window touched last (the restored one).
    await icon.dblclick();
    await settled(page);
    const reopened = await page.locator('[data-window-id]').last().boundingBox();
    expect(Math.round(reopened!.x)).toBe(Math.round(restored!.x));
    expect(Math.round(reopened!.width)).toBe(Math.round(restored!.width));
  });

  test('start menu filters and opens apps with the keyboard', async ({ page }) => {
    await login(page);
    await page.locator('[data-taskbar-search]').click();
    const search = page.getByRole('searchbox', { name: 'Search apps and shortcuts' });
    await expect(search).toBeFocused();
    await search.fill('sett');
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'About' })).toBeVisible();
  });
});

test.describe('phone', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1000) >= 768, 'phone layout only');

  test('logs in and shows the launcher', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('searchbox')).toBeVisible();
  });
});
