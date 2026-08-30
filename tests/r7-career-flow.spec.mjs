import { test, expect } from '@playwright/test';

async function startCareer(page, clubName) {
  await expect(page.locator('.club-card').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.club-card', { hasText: clubName }).first().click();
  await page.getByRole('button', { name: new RegExp(`Start with ${clubName}`) }).click();
  await expect(page.locator('#app')).toBeVisible({ timeout: 30000 });
}

async function startArsenalCareer(page) {
  await page.goto('/');
  await startCareer(page, 'Arsenal');
}

async function go(page, id) {
  await page.evaluate((screen) => window.navigateTo(screen), id);
  await expect(page.locator(`#screen-${id}`)).toHaveClass(/active/, { timeout: 15000 });
}

async function openCareerMenu(page) {
  await go(page, 'settings');
  await page.getByRole('button', { name: 'Menu' }).click();
  const menu = page.getByRole('region', { name: 'Career menu' });
  await expect(menu).toBeVisible();
  return menu;
}

test('P0 mobile career menu creates, switches and deletes isolated save slots', async ({ page }) => {
  await startArsenalCareer(page);

  let menu = await openCareerMenu(page);
  let arsenalCard = menu.locator('.career-card', { hasText: 'Arsenal' });
  await expect(arsenalCard).toContainText('The Manager');
  await expect(arsenalCard).toContainText('2025/26');
  await expect(arsenalCard).toContainText('1st');
  await expect(arsenalCard).toContainText(/Last played/);
  await expect(arsenalCard.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect(arsenalCard.getByRole('button', { name: 'Export' })).toBeVisible();
  await expect(arsenalCard.getByRole('button', { name: 'Delete' })).toBeVisible();

  // Opening New Career must not create/activate a blank slot. The player can
  // back out and the original career is still immediately available.
  await menu.getByRole('button', { name: /New career/ }).click();
  await expect(page.getByRole('button', { name: /Back to saved careers/ })).toBeVisible();
  await page.getByRole('button', { name: /Back to saved careers/ }).click();
  menu = page.getByRole('region', { name: 'Career menu' });
  await expect(menu.locator('.career-card')).toHaveCount(1);
  await expect(menu.locator('.career-card')).toContainText('Arsenal');

  // Commit a second career. It must be stored beside Arsenal, not over it.
  await menu.getByRole('button', { name: /New career/ }).click();
  await startCareer(page, 'Chelsea');
  menu = await openCareerMenu(page);
  await expect(menu.locator('.career-card')).toHaveCount(2);
  await expect(menu).toContainText('Arsenal');
  await expect(menu).toContainText('Chelsea');
  await expect(menu).toContainText('2 careers');
  await expect(menu.locator('.career-card.active')).toContainText('Chelsea');

  // Switching slots reloads the selected career and leaves the other intact.
  arsenalCard = menu.locator('.career-card', { hasText: 'Arsenal' });
  await arsenalCard.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#app')).toBeVisible({ timeout: 30000 });
  menu = await openCareerMenu(page);
  await expect(menu.locator('.career-card')).toHaveCount(2);
  await expect(menu.locator('.career-card.active')).toContainText('Arsenal');

  // Delete only Chelsea. Arsenal must remain selectable and active.
  const chelseaCard = menu.locator('.career-card', { hasText: 'Chelsea' });
  await chelseaCard.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Delete career?')).toBeVisible();
  await page.getByRole('button', { name: 'Delete this career' }).click();
  await expect(menu.locator('.career-card')).toHaveCount(1);
  await expect(menu.locator('.career-card')).toContainText('Arsenal');
});

test('P0 deleting the legacy career cannot strand another surviving slot', async ({ page }) => {
  // This intentionally performs three full career creations/reloads and two
  // slot deletions. The default 60s budget is appropriate for normal smoke
  // tests but not for this persistence regression on CI hardware.
  test.setTimeout(120_000);

  await startArsenalCareer(page);

  let menu = await openCareerMenu(page);
  await menu.getByRole('button', { name: /New career/ }).click();
  await startCareer(page, 'Chelsea');

  menu = await openCareerMenu(page);
  await menu.getByRole('button', { name: /New career/ }).click();
  await startCareer(page, 'Liverpool');

  menu = await openCareerMenu(page);
  await expect(menu.locator('.career-card')).toHaveCount(3);
  await expect(menu.locator('.career-card.active')).toContainText('Liverpool');

  // Arsenal owns the original legacy database. Delete it while another slot
  // is active, then delete that active slot. Chelsea must become the fallback
  // instead of booting an empty re-created legacy DB.
  await menu.locator('.career-card', { hasText: 'Arsenal' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete this career' }).click();
  await expect(menu.locator('.career-card')).toHaveCount(2);
  await expect(menu).not.toContainText('Arsenal');

  await menu.locator('.career-card', { hasText: 'Liverpool' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete this career' }).click();

  await expect(page.locator('#app')).toBeVisible({ timeout: 30000 });
  menu = await openCareerMenu(page);
  await expect(menu.locator('.career-card')).toHaveCount(1);
  await expect(menu.locator('.career-card.active')).toContainText('Chelsea');
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
