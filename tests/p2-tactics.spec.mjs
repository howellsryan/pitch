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

async function noHorizontalOverflow(page, selector) {
  return page.locator(selector).evaluate((el) => ({
    width:window.innerWidth,
    doc:document.documentElement.scrollWidth,
    surface:el.scrollWidth,
  }));
}

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !isNetworkNoise(m.text())) errors.push(m.text());
  });
});

test('P2 mobile tactics, opposition insight and watched result form one authoritative journey', async ({ page }) => {
  await startArsenalCareer(page);

  const home = page.locator('#screen-home');
  await expect(home.getByRole('button', { name:/Academy/i })).toHaveCount(0);
  await expect(home.getByRole('button', { name:/Trophies/i })).toHaveCount(0);
  await expect(home.getByRole('button', { name:/Settings/i })).toHaveCount(0);

  await go(page, 'squad');
  await expect(page.getByRole('button', { name:/Team plan/i })).toBeVisible();
  await expect(page.getByLabel('Manager DNA')).toContainText('Forming');

  await page.getByRole('button', { name:/Team plan/i }).click();
  const instructionSheet = page.locator('.instructions-sheet');
  await expect(instructionSheet).toBeVisible();
  await instructionSheet.getByRole('group', { name:'Build-up' }).getByRole('button', { name:'Direct' }).click();
  await instructionSheet.getByRole('group', { name:'Pressing' }).getByRole('button', { name:'Aggressive' }).click();
  await expect(instructionSheet.getByRole('group', { name:'Build-up' }).getByRole('button', { name:'Direct' })).toHaveClass(/active/);
  await expect(instructionSheet.getByRole('group', { name:'Pressing' }).getByRole('button', { name:'Aggressive' })).toHaveClass(/active/);
  await page.screenshot({ path:'test-results/p2-squad-tactics-390x844.png' });
  await instructionSheet.getByRole('button', { name:'Close' }).click();
  await expect(page.getByRole('button', { name:/Team plan/i })).toContainText(/Direct|Aggressive|\+\d/);

  const squadGeometry = await noHorizontalOverflow(page, '#screen-squad');
  expect(squadGeometry.doc, 'P2 Squad causes document overflow').toBeLessThanOrEqual(squadGeometry.width + 1);
  expect(squadGeometry.surface, 'P2 Squad causes horizontal overflow').toBeLessThanOrEqual(squadGeometry.width + 1);

  await go(page, 'match');
  await expect(page.locator('[data-testid="opposition-insight"]')).toBeVisible({ timeout:15000 });
  const insight = page.locator('[data-testid="opposition-insight"]');
  await expect(insight).toContainText('Likely Approach');
  await expect(insight).toContainText('Threat');
  await expect(insight).toContainText('Opportunity');
  await expect(insight.locator('.tn-insight-head strong')).not.toHaveText('');
  await page.screenshot({ path:'test-results/p2-team-news-390x844.png' });

  const matchGeometry = await noHorizontalOverflow(page, '#screen-match');
  expect(matchGeometry.doc, 'P2 Team News causes document overflow').toBeLessThanOrEqual(matchGeometry.width + 1);
  expect(matchGeometry.surface, 'P2 Team News causes horizontal overflow').toBeLessThanOrEqual(matchGeometry.width + 1);

  await page.getByRole('button', { name:/Kick Off/ }).click();
  await expect(page.locator('.kickoff-beat')).toBeVisible({ timeout:15000 });
  await expect(page.locator('.live-controls')).toBeVisible({ timeout:15000 });
  await page.getByRole('button', { name:/Skip/ }).click();
  await expect(page.locator('.ft-status')).toHaveText('FULL TIME', { timeout:30000 });
  await page.getByRole('button', { name:/Continue/ }).click();
  await expect(page.locator('.after-wrap')).toBeVisible({ timeout:30000 });
  await page.getByRole('button', { name:/Continue/ }).click();
  await expect(page.locator('#screen-home')).toHaveClass(/active/, { timeout:15000 });

  await go(page, 'squad');
  const dna = page.getByLabel('Manager DNA');
  await expect(dna).not.toContainText('Forming');
  await expect(dna).toContainText(/poss\./i);

  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});
