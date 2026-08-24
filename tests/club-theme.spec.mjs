/**
 * Visual proof of the club accent, across clubs whose data colours stress the
 * theming layer differently: a bright red that barely moves, a near-black that
 * would vanish against the ground, a mid blue, and a green light enough to
 * flip the on-accent text to dark.
 *
 * Colours are read from src/data at run time rather than hard-coded — the
 * generated data is regenerated from CSV, and a stale literal here would test
 * a colour the game no longer uses.
 */
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { resolveAccent } from '../src/lib/theme.mjs';

const DATA = join(process.cwd(), 'src/data');

function clubColour(name) {
  for (const f of readdirSync(DATA).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(join(DATA, f), 'utf8');
    const re = new RegExp(`name:'${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}'[^\\n]*?primaryColor:'([^']+)'`);
    const m = re.exec(src);
    if (m) return m[1];
  }
  return null;
}

const CLUBS = ['Arsenal', 'Newcastle United', 'Everton', 'Norwich City'];

mkdirSync('screenshots', { recursive: true });

for (const name of CLUBS) {
  test(`accent follows ${name}`, async ({ page }) => {
    const raw = clubColour(name);
    expect(raw, `${name} not found in src/data`).toBeTruthy();
    const expected = resolveAccent(raw);

    await page.goto('/');
    await expect(page.locator('.team-card').first()).toBeVisible({ timeout: 15000 });

    const card = page.locator('.team-card', { hasText: name }).first();
    if (!(await card.count())) test.skip(true, `${name} not selectable`);
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await page.locator('#btn-start').click();
    await expect(page.locator('#app')).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(600);

    const { accent, onClub } = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        accent: s.getPropertyValue('--color-club').trim(),
        onClub: s.getPropertyValue('--color-on-club').trim(),
      };
    });

    console.log(`  ${name.padEnd(20)} data ${raw} -> ${accent}  text ${onClub}  (${expected.reason})`);
    expect(accent.toUpperCase()).toBe(expected.hex.toUpperCase());
    expect(onClub.toUpperCase()).toBe(expected.on.toUpperCase());

    await page.screenshot({ path: `screenshots/${name.toLowerCase().replace(/\s+/g, '-')}.png` });
  });
}
