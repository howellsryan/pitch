import { test, expect } from '@playwright/test';

const MiB = 1024 * 1024;

async function startArsenalCareer(page) {
  await page.goto('/');
  await expect(page.locator('.club-card').first()).toBeVisible({ timeout: 20000 });
  await page.locator('.club-card', { hasText: 'Arsenal' }).first().click();
  await page.getByRole('button', { name: /Start with Arsenal/ }).click();
  await expect(page.locator('#app')).toBeVisible({ timeout: 30000 });
}

test('P1 living world stays inside a throttled mobile browser budget', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate:4 });

  const careerStartedAt = Date.now();
  await startArsenalCareer(page);
  const careerLoadMs = Date.now() - careerStartedAt;

  await page.evaluate(() => window.navigateTo('match'));
  await expect(page.locator('#screen-match')).toHaveClass(/active/, { timeout:15000 });
  await expect(page.getByRole('button', { name:/Sim Instantly/ })).toBeVisible({ timeout:15000 });

  const gameweekStartedAt = Date.now();
  await page.getByRole('button', { name:/Sim Instantly/ }).click();
  await expect(page.locator('.ft-status')).toHaveText('FULL TIME', { timeout:20000 });
  const gameweekMs = Date.now() - gameweekStartedAt;

  const storageUsage = await page.evaluate(async () => {
    const estimate = await navigator.storage?.estimate?.();
    return Number(estimate?.usage ?? 0);
  });

  console.log(`P1_PERF career_load_ms=${careerLoadMs} gameweek_ms=${gameweekMs} storage_mib=${(storageUsage / MiB).toFixed(2)} cpu_throttle=4 viewport=390x844`);

  // These are regression ceilings, not performance targets. They deliberately
  // leave headroom for shared CI runners while still catching accidental
  // Broadcast-per-background-match work or unbounded current-season storage.
  expect(careerLoadMs, 'fresh 186-club career load under 4× CPU throttle').toBeLessThan(20_000);
  expect(gameweekMs, 'one full living-world week under 4× CPU throttle').toBeLessThan(12_000);
  expect(storageUsage, 'fresh career + one world week browser storage').toBeLessThan(50 * MiB);
});
