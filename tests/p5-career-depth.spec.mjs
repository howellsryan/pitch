import { test, expect } from '@playwright/test';

const errors = [];
const isNetworkNoise = (text) =>
  /Failed to load resource/i.test(text) || /ERR_(CONNECTION|NAME|INTERNET)/i.test(text);

async function startArsenalCareer(page) {
  await page.goto('/');
  await expect(page.locator('.club-card').first()).toBeVisible({ timeout:15000 });
  await page.locator('.club-card', { hasText:'Arsenal' }).first().click();
  await page.getByRole('button', { name:/Start with Arsenal/ }).click();
  await expect(page.locator('#app')).toBeVisible({ timeout:30000 });
}

async function go(page, id) {
  await page.evaluate((screen) => window.navigateTo(screen), id);
  await expect(page.locator(`#screen-${id}`)).toHaveClass(/active/, { timeout:15000 });
  await page.waitForTimeout(150);
}

async function assertNoHorizontalOverflow(page, selector, label) {
  const geometry = await page.locator(selector).evaluate((element) => ({
    clientWidth:element.clientWidth,
    scrollWidth:element.scrollWidth,
    left:element.getBoundingClientRect().left,
    right:element.getBoundingClientRect().right,
    viewport:window.innerWidth,
    documentWidth:document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth, `${label} has horizontal overflow`).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.left, `${label} starts outside viewport`).toBeGreaterThanOrEqual(-1);
  expect(geometry.right, `${label} extends outside viewport`).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.documentWidth, `${label} causes document overflow`).toBeLessThanOrEqual(geometry.viewport + 1);
}

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !isNetworkNoise(message.text())) errors.push(message.text());
  });
});

test('P5 development, planning and scouting are usable at 390x844', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await startArsenalCareer(page);

  await go(page, 'squad');
  await page.getByRole('button', { name:/\d+ players/ }).click();
  const roster = page.locator('.roster-sheet');
  await expect(roster).toBeVisible();
  await roster.locator('.swap-row').first().click();

  const playerSheet = page.locator('.player-sheet');
  await expect(playerSheet).toBeVisible();
  const development = playerSheet.locator('.development-panel');
  await development.scrollIntoViewIfNeeded();
  await expect(development).toContainText('Development plan');
  await expect(development).toContainText('Recommended');
  const finishing = development.getByRole('button', { name:/Finishing/ });
  await finishing.click();
  await expect(finishing).toHaveClass(/active/);
  await assertNoHorizontalOverflow(page, '.player-sheet', 'P5 development player sheet');
  await page.screenshot({ path:'test-results/p5-development-390x844.png' });

  await playerSheet.locator('.sheet-close').click();
  await page.getByRole('button', { name:'Plan', exact:true }).click();
  const planning = page.locator('.planning-sheet');
  await expect(planning).toBeVisible();
  await expect(planning).toContainText('Squad planning');
  await expect(planning).toContainText('Coaching staff');
  await expect(planning).toContainText('Now → 3 seasons');
  await assertNoHorizontalOverflow(page, '.planning-sheet', 'P5 squad planning sheet');
  await page.screenshot({ path:'test-results/p5-planning-390x844.png' });
  await planning.locator('.sheet-close').click();

  await go(page, 'transfers');
  const scoutingLauncher = page.getByRole('button', { name:'Open scouting assignments and reports' });
  await expect(scoutingLauncher).toBeVisible();
  const launcherBox = await scoutingLauncher.boundingBox();
  expect(launcherBox?.height ?? 0, 'Scouting launcher touch target').toBeGreaterThanOrEqual(44);
  await scoutingLauncher.click();
  const drawer = page.locator('.scouting-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('Scouting network');
  await drawer.getByRole('button', { name:'Add assignment' }).click();
  await expect(drawer).toContainText('ST search');
  await assertNoHorizontalOverflow(page, '.scouting-drawer', 'P5 scouting drawer');
  await page.screenshot({ path:'test-results/p5-scouting-390x844.png' });

  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('P5 squad planner remains decision-ready at 1280x800', async ({ page }) => {
  await page.setViewportSize({ width:1280, height:800 });
  await startArsenalCareer(page);
  await go(page, 'squad');
  await page.getByRole('button', { name:'Plan', exact:true }).click();
  const planning = page.locator('.planning-sheet');
  await expect(planning).toBeVisible();
  await expect(planning.locator('.planner-grid')).toBeVisible();
  await expect(planning).toContainText('Four departments');
  await assertNoHorizontalOverflow(page, '.planning-sheet', 'P5 wide squad planning sheet');
  await page.screenshot({ path:'test-results/p5-planning-1280x800.png' });
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});