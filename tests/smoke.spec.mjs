/**
 * Phase 2 smoke test.
 *
 * The Vite build succeeding proves the module graph resolves; it does not
 * prove it is *complete*. A missing import only shows up as a ReferenceError
 * when the code path runs, so this drives the real game: new save, pick a
 * club, land on Home. It also asserts the club accent actually reaches the
 * document, which is the visible half of this phase.
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

test('boots to the new-game screen with no runtime errors', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#ng')).toBeVisible();
  await expect(page.locator('.team-card').first()).toBeVisible({ timeout: 15000 });
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('starts a career and themes the app in the club colour', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.team-card').first()).toBeVisible({ timeout: 15000 });

  // Arsenal — primaryColor #EF0107 in src/data/plTeams.js.
  const arsenal = page.locator('.team-card', { hasText: 'Arsenal' }).first();
  await arsenal.click();
  await page.locator('#btn-start').click();

  await expect(page.locator('#app')).toBeVisible({ timeout: 30000 });

  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--acc').trim());
  const club = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-club').trim());

  // Not the old green brand colour, and recognisably Arsenal red.
  expect(accent.toLowerCase()).not.toBe('#12a864');
  expect(club.toLowerCase()).toMatch(/^#e[ef]0/);
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});
