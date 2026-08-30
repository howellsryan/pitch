/**
 * Phase 2 smoke test.
 *
 * The Vite build succeeding proves the module graph resolves; it does not
 * prove it is *complete*. A missing import only shows up as a ReferenceError
 * when the code path runs, so this drives the real game: new save, pick a
 * club, land on Home. It also asserts the club accent actually reaches the
 * document, which is the visible half of that phase.
 *
 * R1 (docs/plan/07-redesign.md) replaced the #ng team grid with
 * src/lib/ui/EntryScreen.svelte, so the selectors here follow the component's
 * own markup. The sheet test is deliberate: Sheet.svelte shipped in R0 with
 * nothing mounting it, so this is the first thing that exercises it for real.
 */
import { test, expect } from '@playwright/test';

const errors = [];

// shell.html pulls webfonts from Google Fonts; this sandbox has no outbound
// network, so those failures are environmental, not the app's.
const isNetworkNoise = (text) =>
  /Failed to load resource/i.test(text) || /ERR_(CONNECTION|NAME|INTERNET)/i.test(text);

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !isNetworkNoise(m.text())) errors.push(m.text());
  });
});

test('boots to the entry screen with no runtime errors', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#ng')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'PITCH', level: 1 })).toBeVisible();
  await expect(page.locator('.club-card').first()).toBeVisible({ timeout: 15000 });
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('offers every club, filterable and searchable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.club-card').first()).toBeVisible({ timeout: 15000 });

  // R1's premise: all 186 clubs are playable, not a curated subset.
  await expect(page.locator('.club-card')).toHaveCount(186);

  await page.getByRole('button', { name: /^Premier League/ }).click();
  await expect(page.locator('.club-card')).toHaveCount(20);

  // Diacritic-insensitive search: "atletico" must find Atlético.
  await page.getByRole('button', { name: /^All/ }).click();
  await page.getByLabel('Search clubs by name').fill('atletico');
  await expect(page.locator('.club-card')).toHaveCount(1);
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('the club sheet opens, dismisses on Escape and restores focus', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.club-card').first()).toBeVisible({ timeout: 15000 });

  const card = page.locator('.club-card', { hasText: 'Arsenal' }).first();
  await card.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Start with Arsenal/ })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  // Sheet restores focus to whatever opened it, which is the card itself.
  await expect(card).toBeFocused();
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('starts a career and themes the app in the club colour', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.club-card').first()).toBeVisible({ timeout: 15000 });

  // Two taps, which is R1's success criterion: pick the club, start.
  // Arsenal — primaryColor #EF0107 in src/data/plTeams.js.
  await page.locator('.club-card', { hasText: 'Arsenal' }).first().click();
  await page.getByRole('button', { name: /Start with Arsenal/ }).click();

  await expect(page.locator('#app')).toBeVisible({ timeout: 30000 });

  // Focus must follow the player into the shell. The club sheet restores focus
  // to the card that opened it, and enterGame() has just hidden that card, so
  // without an explicit move a keyboard or screen-reader user lands on <body>.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id), { timeout: 5000 })
    .toBe('app');

  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--acc').trim());
  const club = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-club').trim());

  // Not the old green brand colour, and recognisably Arsenal red.
  expect(accent.toLowerCase()).not.toBe('#12a864');
  expect(club.toLowerCase()).toMatch(/^#e[ef]0/);
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});
