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

async function go(page, id) {
  await page.evaluate((screen) => window.navigateTo(screen), id);
  await expect(page.locator(`#screen-${id}`)).toHaveClass(/active/, { timeout: 15000 });
  await page.waitForTimeout(120);
}

async function auditActiveScreen(page, id) {
  const result = await page.evaluate((screenId) => {
    const root = document.querySelector(`#screen-${screenId}`);
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const isVisible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const nameFor = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70);
    const rectFor = (el) => {
      const r = el.getBoundingClientRect();
      return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
    };
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

    const controls = [...root.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')].filter(isVisible);
    const unnamed = controls.filter((el) => {
      if (el.tagName === 'INPUT') {
        const id = el.id;
        if (id && [...document.querySelectorAll('label')].some((label) => label.htmlFor === id)) return false;
        if (el.getAttribute('placeholder') || el.getAttribute('aria-label')) return false;
      }
      return !nameFor(el);
    }).map((el) => ({ tag:el.tagName, cls:el.className, rect:rectFor(el) }));

    const tiny = controls.map((el) => ({ name:nameFor(el), tag:el.tagName, cls:String(el.className || ''), rect:rectFor(el) }))
      .filter((item) => item.rect.width < 32 || item.rect.height < 32);

    const nav = document.querySelector('.broadcast-nav');
    const navRect = nav && isVisible(nav) ? rectFor(nav) : null;
    const navOverlaps = navRect ? controls
      .filter((el) => !nav.contains(el))
      .map((el) => ({ name:nameFor(el), cls:String(el.className || ''), rect:rectFor(el) }))
      .filter((item) => overlaps(navRect, item.rect)) : [];

    const clippedRight = [...root.querySelectorAll('*')].filter(isVisible).map((el) => ({ el, rect:rectFor(el) }))
      .filter(({ rect }) => rect.right > viewport.width + 1 && rect.left < viewport.width)
      .filter(({ el }) => {
        let p = el.parentElement;
        while (p && p !== root) {
          const s = getComputedStyle(p);
          if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && p.scrollWidth > p.clientWidth) return false;
          p = p.parentElement;
        }
        return true;
      })
      .slice(0, 12)
      .map(({ el, rect }) => ({ tag:el.tagName, cls:String(el.className || ''), name:nameFor(el), rect }));

    return {
      screenId,
      viewport,
      rootScrollWidth: root.scrollWidth,
      rootClientWidth: root.clientWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      unnamed,
      tiny,
      navOverlaps,
      clippedRight,
    };
  }, id);
  console.log(`AUDIT ${id} ${JSON.stringify(result)}`);
  return result;
}

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !isNetworkNoise(m.text())) errors.push(m.text());
  });
});

test('mobile browser UX audit across the playable app', async ({ page }) => {
  await startArsenalCareer(page);

  const screens = ['home', 'squad', 'transfers', 'competitions', 'academy', 'trophies', 'settings'];
  const audits = [];
  for (const id of screens) {
    await go(page, id);
    audits.push(await auditActiveScreen(page, id));
  }

  await go(page, 'match');
  await expect(page.locator('#screen-match')).toContainText(/Team News|Kick Off|Sim Instantly/i, { timeout: 15000 });
  audits.push(await auditActiveScreen(page, 'match'));

  for (const audit of audits) {
    expect(audit.docScrollWidth, `${audit.screenId}: document horizontal overflow`).toBeLessThanOrEqual(audit.viewport.width + 1);
    expect(audit.unnamed, `${audit.screenId}: visible controls without an accessible name`).toEqual([]);
    expect(audit.clippedRight, `${audit.screenId}: content clipped off the right edge outside an intentional scroller`).toEqual([]);
    expect(audit.navOverlaps, `${audit.screenId}: floating navigation overlaps another interactive control`).toEqual([]);
  }

  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});
