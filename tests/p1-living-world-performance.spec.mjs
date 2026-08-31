import { test, expect } from '@playwright/test';

const MiB = 1024 * 1024;

async function startArsenalCareer(page) {
  await page.goto('/');
  await expect(page.locator('.club-card').first()).toBeVisible({ timeout: 20000 });
  await page.locator('.club-card', { hasText: 'Arsenal' }).first().click();
  await page.getByRole('button', { name: /Start with Arsenal/ }).click();
  await expect(page.locator('#app')).toBeVisible({ timeout: 30000 });
}

async function waitForFullTimeOrCloseoutError(page, timeout = 60000) {
  const fullTime = page.locator('.ft-status');
  const errorToast = page.locator('.toast-error').last();
  const winner = await Promise.race([
    fullTime.waitFor({ state:'visible', timeout }).then(() => 'fulltime'),
    errorToast.waitFor({ state:'visible', timeout }).then(() => 'error'),
  ]);
  if (winner === 'error') {
    throw new Error(`World-week closeout failed: ${await errorToast.innerText()}`);
  }
  await expect(fullTime).toHaveText('FULL TIME');
}

function cpuProfileSummary(profile, limit = 25) {
  const nodes = new Map((profile?.nodes ?? []).map(node => [node.id, node]));
  const totals = new Map();
  const samples = profile?.samples ?? [];
  const deltas = profile?.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i++) {
    const node = nodes.get(samples[i]);
    if (!node) continue;
    const frame = node.callFrame ?? {};
    const fn = frame.functionName || '(anonymous)';
    const url = frame.url || '(internal)';
    const line = Number(frame.lineNumber ?? -1) + 1;
    const key = `${fn} @ ${url}:${line}`;
    totals.set(key, (totals.get(key) ?? 0) + Number(deltas[i] ?? 0) / 1000);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, ms]) => `${ms.toFixed(1)}ms ${label}`);
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

  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval:1000 });
  await cdp.send('Profiler.start');

  const gameweekStartedAt = Date.now();
  let profile;
  try {
    await page.getByRole('button', { name:/Sim Instantly/ }).click();
    // The wait is deliberately longer than the regression ceiling so a slow
    // closeout reports its actual elapsed time instead of hiding it behind a
    // locator timeout. The pass/fail contract below remains the original <25s.
    await waitForFullTimeOrCloseoutError(page);
  } finally {
    profile = (await cdp.send('Profiler.stop')).profile;
    await cdp.send('Profiler.disable');
  }
  const gameweekMs = Date.now() - gameweekStartedAt;

  const storageUsage = await page.evaluate(async () => {
    const estimate = await globalThis.navigator.storage?.estimate?.();
    return Number(estimate?.usage ?? 0);
  });

  console.log(`P1_PERF career_load_ms=${careerLoadMs} gameweek_ms=${gameweekMs} storage_mib=${(storageUsage / MiB).toFixed(2)} cpu_throttle=4 viewport=390x844`);
  console.log(`P1_CPU_TOP\n${cpuProfileSummary(profile).join('\n')}`);

  // These are regression ceilings, not UX targets. Repeated post-P1 measurements
  // on shared GitHub runners put a full authoritative world week at roughly
  // 14–20s under an artificial 4× CPU throttle after eliminating redundant
  // full-world cup/league player writes. The 25s ceiling leaves ~25% headroom
  // above the slowest observed baseline while still catching a return to
  // Broadcast-grade background work or unbounded persistence. Storage remains
  // deliberately capped far above the ~3 MiB observed fresh-career footprint.
  expect(careerLoadMs, 'fresh 186-club career load under 4× CPU throttle').toBeLessThan(20_000);
  expect(gameweekMs, 'one full living-world week under 4× CPU throttle').toBeLessThan(25_000);
  expect(storageUsage, 'fresh career + one world week browser storage').toBeLessThan(50 * MiB);
});