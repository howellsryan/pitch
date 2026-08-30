import { test, expect } from '@playwright/test';

const errors = [];
const isNetworkNoise = (text) =>
  /Failed to load resource/i.test(text) || /ERR_(CONNECTION|NAME|INTERNET)/i.test(text);

async function startArsenalCareer(page) {
  await page.goto('/');
  await expect(page.locator('.club-card').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.club-card', { hasText: 'Arsenal' }).first().click();
  await page.getByRole('button', { name: /Start with Arsenal/ }).click();
  await expect(page.locator('#app')).toBeVisible({ timeout: 30000 });
}

async function navigateMobile(page, label) {
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: label, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !isNetworkNoise(m.text())) errors.push(m.text());
  });
});

test('R6 market stays windowed while using the dense flat treatment', async ({ page }) => {
  await startArsenalCareer(page);
  await navigateMobile(page, 'Market');

  await expect(page.locator('#screen-transfers')).toHaveClass(/active/);
  await expect(page.locator('.tr-count')).toContainText('player', { timeout: 15000 });
  await expect(page.locator('.buy-row').first()).toBeVisible();

  const before = await page.locator('.buy-row').first().innerText();
  const metrics = await page.locator('.buy-scroll').evaluate((el) => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    overflowY: getComputedStyle(el).overflowY,
    renderedRows: el.querySelectorAll('.buy-row').length,
  }));

  expect(metrics.clientHeight).toBeGreaterThan(100);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight * 2);
  expect(metrics.overflowY).toBe('auto');
  // The list contains thousands of players; only the viewport window should
  // exist in the DOM. This is the R6 regression guard for the old flex-chain bug.
  expect(metrics.renderedRows).toBeLessThan(40);

  await page.locator('.buy-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight * 0.55; });
  await page.waitForTimeout(100);
  const after = await page.locator('.buy-row').first().innerText();
  expect(after).not.toBe(before);

  const marketStyle = await page.locator('.buy-row').first().evaluate((el) => ({
    radius: getComputedStyle(el).borderRadius,
    borderBottom: getComputedStyle(el).borderBottomWidth,
    nationalityFontSize: getComputedStyle(el.querySelector('.pl-flag')).fontSize,
  }));
  expect(marketStyle.radius).toBe('0px');
  expect(marketStyle.borderBottom).toBe('1px');
  expect(parseFloat(marketStyle.nationalityFontSize)).toBeLessThanOrEqual(9);
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('R6 table is dense, flat and keeps the user row identifiable', async ({ page }) => {
  await startArsenalCareer(page);
  await navigateMobile(page, 'Table');

  await expect(page.locator('#screen-competitions')).toHaveClass(/active/);
  await expect(page.locator('.league-row').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.league-row')).toHaveCount(20);
  await expect(page.locator('.league-row.is-user')).toHaveCount(1);
  await expect(page.locator('.league-row .league-crest img')).toHaveCount(20);
  expect(await page.locator('.league-row .league-crest img').first().getAttribute('src')).toMatch(/^data:image\/svg\+xml/);

  const cardStyle = await page.locator('.league-table-card').evaluate((el) => ({
    radius: getComputedStyle(el).borderRadius,
    background: getComputedStyle(el).backgroundColor,
  }));
  expect(cardStyle.radius).toBe('0px');

  const rowStyle = await page.locator('.league-row').first().evaluate((el) => ({
    minHeight: parseFloat(getComputedStyle(el).minHeight),
    borderBottom: getComputedStyle(el).borderBottomWidth,
  }));
  expect(rowStyle.minHeight).toBeGreaterThanOrEqual(39);
  expect(rowStyle.borderBottom).toBe('1px');
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});
