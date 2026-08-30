import { test, expect } from '@playwright/test';

async function startArsenalCareer(page) {
  await page.goto('/');
  await expect(page.locator('.club-card').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.club-card', { hasText: 'Arsenal' }).first().click();
  await page.getByRole('button', { name: /Start with Arsenal/ }).click();
  await expect(page.locator('#app')).toBeVisible({ timeout: 30000 });
}

async function go(page, id) {
  await page.evaluate((screen) => window.navigateTo(screen), id);
  await expect(page.locator(`#screen-${id}`)).toHaveClass(/active/, { timeout: 15000 });
}

test('Settings can return to title and Continue resumes the same career', async ({ page }) => {
  await startArsenalCareer(page);
  await go(page, 'settings');

  await page.getByRole('button', { name: 'Menu' }).click();
  const menu = page.getByRole('region', { name: 'Career menu' });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Arsenal');
  await expect(menu.getByRole('button', { name: 'Continue career' })).toBeVisible();

  await menu.getByRole('button', { name: 'Continue career' }).click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#screen-home')).toHaveClass(/active/, { timeout: 15000 });

  await go(page, 'settings');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('Start a new career?')).toBeVisible();
  await expect(page.getByText(/Export a .*\.pitch.* backup first/i)).toBeVisible();
  await page.getByRole('button', { name: 'Keep Career' }).click();
  await expect(page.locator('#screen-settings')).toHaveClass(/active/);
});

test('R7 secondary screens keep dense mobile geometry including Team News', async ({ page }) => {
  await startArsenalCareer(page);

  for (const id of ['academy', 'trophies', 'settings', 'inbox']) {
    await go(page, id);
    const geometry = await page.evaluate((screenId) => {
      const root = document.getElementById(`screen-${screenId}`);
      const nav = document.querySelector('.broadcast-nav');
      const controls = [...root.querySelectorAll('button, input, textarea, select')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
        })
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        });
      const navRect = nav?.getBoundingClientRect();
      const overlapsNav = navRect ? controls.some((r) => r.left < navRect.right && r.right > navRect.left && r.top < navRect.bottom && r.bottom > navRect.top) : false;
      return {
        docWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        overlapsNav,
      };
    }, id);

    expect(geometry.docWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.overlapsNav).toBe(false);
  }

  await expect(page.locator('#screen-inbox .inbox-tabs')).toBeVisible();
});
