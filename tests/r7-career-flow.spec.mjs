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

test('R7 secondary club areas are exposed through global mobile navigation', async ({ page }) => {
  await startArsenalCareer(page);

  const nav = page.locator('.broadcast-nav');
  const openNavigation = nav.getByRole('button', { name: 'Open navigation' });
  await expect(nav).toBeVisible();
  await openNavigation.click();

  const destinations = nav.locator('#nav-destinations');
  for (const label of ['Home', 'Squad', 'Play', 'Market', 'Table', 'Academy', 'Trophies', 'Settings']) {
    await expect(destinations.getByRole('button', { name: label, exact: true })).toBeVisible();
  }

  await destinations.getByRole('button', { name: 'Academy', exact: true }).click();
  await expect(page.locator('#screen-academy')).toHaveClass(/active/, { timeout: 15000 });

  await openNavigation.click();
  await nav.locator('#nav-destinations').getByRole('button', { name: 'Trophies', exact: true }).click();
  await expect(page.locator('#screen-trophies')).toHaveClass(/active/, { timeout: 15000 });

  await openNavigation.click();
  await nav.locator('#nav-destinations').getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#screen-settings')).toHaveClass(/active/, { timeout: 15000 });

  await go(page, 'inbox');
  await expect(page.locator('#screen-inbox .inbox-tabs')).toBeVisible();
});
