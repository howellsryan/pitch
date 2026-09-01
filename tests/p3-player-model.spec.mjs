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
  await page.waitForTimeout(120);
}

async function openFirstPlayerDetail(page) {
  await go(page, 'squad');
  const rosterButton = page.getByRole('button', { name:/\d+ players/ });
  await expect(rosterButton).toBeVisible();
  await rosterButton.click();
  const roster = page.locator('.roster-sheet');
  await expect(roster).toBeVisible();
  await roster.locator('.swap-row').first().click();
  const detail = page.locator('.player-sheet');
  await expect(detail).toBeVisible();
  // Geometry/screenshots should represent the settled bottom-sheet state, not
  // the first animation frame or an inherited scroll position from the roster.
  await page.waitForTimeout(300);
  await detail.evaluate((element) => { element.scrollTop = 0; });
  return detail;
}

async function assertP3Detail(page, detail) {
  await expect(detail).toContainText('Current');
  await expect(detail).toContainText('Baseline');
  await expect(detail).toContainText('Potential');
  await expect(detail).toContainText('Form');
  await expect(detail).toContainText('Morale');
  await expect(detail).toContainText('Sharpness');
  await expect(detail).toContainText('Fitness');
  await expect(detail.getByRole('region', { name:'Position and traits' })).toBeVisible();
  await expect(detail.getByRole('region', { name:'Playing time role' })).toBeVisible();
  await expect(detail.getByRole('region', { name:'Tactical role' })).toBeVisible();

  const roleButtons = detail.locator('.squad-role-options button');
  await expect(roleButtons).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    const box = await roleButtons.nth(index).boundingBox();
    expect(box?.height ?? 0, `playing-time role ${index + 1} touch target`).toBeGreaterThanOrEqual(44);
  }

  const geometry = await page.evaluate(() => {
    const detail = document.querySelector('.player-sheet');
    const squad = document.querySelector('#screen-squad');
    return {
      viewport:window.innerWidth,
      documentWidth:document.documentElement.scrollWidth,
      squadWidth:squad?.scrollWidth ?? 0,
      detailClientWidth:detail?.clientWidth ?? 0,
      detailScrollWidth:detail?.scrollWidth ?? 0,
      detailTop:detail?.getBoundingClientRect().top ?? 0,
      detailBottom:detail?.getBoundingClientRect().bottom ?? 0,
      viewportHeight:window.innerHeight,
    };
  });
  expect(geometry.documentWidth, 'P3 player detail causes document overflow').toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.squadWidth, 'P3 Squad causes horizontal overflow').toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.detailScrollWidth, 'P3 player detail has horizontal overflow').toBeLessThanOrEqual(geometry.detailClientWidth + 1);
  expect(geometry.detailTop, 'P3 player detail starts above viewport').toBeGreaterThanOrEqual(-1);
  expect(geometry.detailBottom, 'P3 player detail extends below browser chrome').toBeLessThanOrEqual(geometry.viewportHeight + 1);
}

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !isNetworkNoise(m.text())) errors.push(m.text());
  });
});

test('P3 player detail is decision-ready at 390x844', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await startArsenalCareer(page);
  const detail = await openFirstPlayerDetail(page);
  await assertP3Detail(page, detail);
  await page.screenshot({ path:'test-results/p3-player-detail-390x844.png' });
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('P3 player detail remains readable at 1280x800', async ({ page }) => {
  await page.setViewportSize({ width:1280, height:800 });
  await startArsenalCareer(page);
  const detail = await openFirstPlayerDetail(page);
  await assertP3Detail(page, detail);
  await page.screenshot({ path:'test-results/p3-player-detail-1280x800.png' });
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});