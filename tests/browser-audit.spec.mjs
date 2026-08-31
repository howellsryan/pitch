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
    const rectFor = (el) => {
      const r = el.getBoundingClientRect();
      return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
    };
    const isVisible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || rect.width <= 0 || rect.height <= 0) return false;

      let left = Math.max(0, rect.left);
      let right = Math.min(viewport.width, rect.right);
      let top = Math.max(0, rect.top);
      let bottom = Math.min(viewport.height, rect.bottom);
      let parent = el.parentElement;
      while (parent && parent !== document.documentElement) {
        const parentStyle = getComputedStyle(parent);
        const parentRect = parent.getBoundingClientRect();
        if (/hidden|auto|scroll|clip/.test(parentStyle.overflowX)) {
          left = Math.max(left, parentRect.left);
          right = Math.min(right, parentRect.right);
        }
        if (/hidden|auto|scroll|clip/.test(parentStyle.overflowY)) {
          top = Math.max(top, parentRect.top);
          bottom = Math.min(bottom, parentRect.bottom);
        }
        if (right <= left || bottom <= top) return false;
        parent = parent.parentElement;
      }
      return right > left && bottom > top;
    };
    const labelFor = (el) => {
      if (!el.id) return null;
      return [...document.querySelectorAll('label')].find((label) => label.htmlFor === el.id) || null;
    };
    const explicitNameFor = (el) => {
      const aria = (el.getAttribute('aria-label') || '').trim();
      if (aria) return aria;
      const labelledBy = (el.getAttribute('aria-labelledby') || '').trim();
      if (labelledBy) return labelledBy.split(/\s+/).map((labelId) => document.getElementById(labelId)?.textContent || '').join(' ').trim();
      const label = labelFor(el);
      if (label) return (label.textContent || '').trim();
      const title = (el.getAttribute('title') || '').trim();
      if (title) return title;
      return '';
    };
    const nameFor = (el) => {
      const explicit = explicitNameFor(el);
      if (explicit) return explicit.replace(/\s+/g, ' ').slice(0, 70);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return (el.getAttribute('placeholder') || '').trim().slice(0, 70);
      if (el.tagName === 'SELECT') return '';
      return (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70);
    };
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

    const controls = [...root.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')].filter(isVisible);
    const unnamed = controls.filter((el) => !nameFor(el)).map((el) => ({ tag:el.tagName, cls:el.className, rect:rectFor(el) }));

    const tiny = controls.map((el) => ({ name:nameFor(el), tag:el.tagName, cls:String(el.className || ''), rect:rectFor(el) }))
      .filter((item) => item.rect.width < 32 || item.rect.height < 32);

    const nav = document.querySelector('.broadcast-nav');
    const navRect = nav && isVisible(nav) ? rectFor(nav) : null;
    const navMenu = nav?.querySelector('.menu');
    const navMenuRect = navMenu && isVisible(navMenu) ? rectFor(navMenu) : null;
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
      navMenuRect,
      navOverlaps,
      clippedRight,
    };
  }, id);
  console.log(`AUDIT ${id} ${JSON.stringify(result)}`);
  return result;
}

async function auditSquadLayout(page) {
  return page.evaluate(() => {
    const rectFor = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom, width:rect.width, height:rect.height };
    };
    return {
      screen: rectFor('#screen-squad .tactics-screen'),
      pitchArea: rectFor('#screen-squad .tac-pitch-area'),
      pitch: rectFor('#screen-squad .pitch-wrap'),
      bench: rectFor('#screen-squad .tac-bench-strip'),
    };
  });
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

  const screens = ['home', 'squad', 'transfers', 'competitions', 'academy', 'trophies', 'settings', 'inbox'];
  const audits = [];
  let squadLayout = null;
  for (const id of screens) {
    await go(page, id);
    const audit = await auditActiveScreen(page, id);
    audits.push(audit);
    if (id === 'squad') squadLayout = await auditSquadLayout(page);
    if (id === 'competitions') {
      await page.locator('#screen-competitions').screenshot({ path:'test-results/p1-competitions-390x844.png' });
    }
  }

  await go(page, 'match');
  await expect(page.locator('#screen-match')).toContainText(/Team News|Kick Off|Sim Instantly/i, { timeout: 15000 });
  audits.push(await auditActiveScreen(page, 'match'));

  for (const audit of audits) {
    expect(audit.docScrollWidth, `${audit.screenId}: document horizontal overflow`).toBeLessThanOrEqual(audit.viewport.width + 1);
    expect(audit.unnamed, `${audit.screenId}: visible controls without an accessible name`).toEqual([]);
    expect(audit.clippedRight, `${audit.screenId}: content clipped off the right edge outside an intentional scroller`).toEqual([]);
    expect(audit.navOverlaps, `${audit.screenId}: floating navigation overlaps another interactive control`).toEqual([]);
    if (audit.navMenuRect) {
      expect(audit.navMenuRect.width, `${audit.screenId}: nav trigger is narrower than 44px`).toBeGreaterThanOrEqual(44);
      expect(audit.navMenuRect.height, `${audit.screenId}: nav trigger is shorter than 44px`).toBeGreaterThanOrEqual(44);
      expect(audit.navMenuRect.top, `${audit.screenId}: navigation must use the shared bottom-right position`).toBeGreaterThan(audit.viewport.height / 2);
      expect(audit.navMenuRect.bottom, `${audit.screenId}: navigation is not anchored near the bottom edge`).toBeGreaterThan(audit.viewport.height - 80);
    }
  }

  expect(squadLayout?.screen, 'squad: tactics screen exists').not.toBeNull();
  expect(squadLayout?.pitchArea, 'squad: pitch area exists').not.toBeNull();
  expect(squadLayout?.pitch, 'squad: pitch exists').not.toBeNull();
  expect(squadLayout?.bench, 'squad: bench exists').not.toBeNull();
  expect(squadLayout.pitch.top, 'squad: pitch starts above its working area').toBeGreaterThanOrEqual(squadLayout.pitchArea.top - 1);
  expect(squadLayout.pitch.bottom, 'squad: pitch overflows into the bench').toBeLessThanOrEqual(squadLayout.pitchArea.bottom + 1);
  expect(squadLayout.pitch.width, 'squad: pitch is wider than its working area').toBeLessThanOrEqual(squadLayout.pitchArea.width + 1);
  expect(squadLayout.pitch.height, 'squad: pitch has collapsed too small to use').toBeGreaterThan(250);
  expect(squadLayout.bench.bottom, 'squad: bench falls outside the reserved mobile viewport').toBeLessThanOrEqual(squadLayout.screen.bottom + 1);

  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('P1 living-world club profiles stay inspectable on a wide Competitions layout', async ({ page }) => {
  await page.setViewportSize({ width:1280, height:800 });
  await startArsenalCareer(page);
  await go(page, 'match');

  await page.getByRole('button', { name:/Sim Instantly/ }).click();
  await expect(page.locator('.ft-status')).toHaveText('FULL TIME', { timeout:30000 });
  await page.getByRole('button', { name:/Continue/ }).click();
  await expect(page.locator('.after-wrap')).toBeVisible({ timeout:15000 });
  await page.getByRole('button', { name:/Continue/ }).click();
  await expect(page.locator('#screen-home')).toHaveClass(/active/, { timeout:15000 });

  await go(page, 'competitions');
  const clubs = [
    { league:'La Liga', club:'Barcelona' },
    { league:'Bundesliga', club:'Borussia Dortmund' },
    { league:'Eredivisie', club:'Ajax' },
  ];

  for (const { league, club } of clubs) {
    await page.getByRole('button', { name:league, exact:true }).click();
    await expect(page.locator('.league-title')).toContainText(league);
    await page.getByRole('button', { name:`Inspect ${club}` }).click();

    const profile = page.getByRole('region', { name:`${club} world profile` });
    await expect(profile).toBeVisible();
    await expect(profile.locator('.club-name')).toHaveText(club);
    await expect(profile.locator('.club-form .fdot').first(), `${club}: league form is inspectable after the world week`).toBeVisible();
    await expect(profile.locator('.player-leader').first(), `${club}: player leaders are present`).toContainText(/[1-9]\d* apps/);
    await expect(profile.locator('.club-last-five strong').first(), `${club}: a canonical recent result is visible`).toContainText(/\d+–\d+/);

    const geometry = await page.evaluate(() => ({
      viewport:window.innerWidth,
      documentWidth:document.documentElement.scrollWidth,
      screenWidth:document.querySelector('#screen-competitions')?.scrollWidth ?? 0,
    }));
    expect(geometry.documentWidth, `${club}: wide layout causes document overflow`).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.screenWidth, `${club}: Competitions surface causes horizontal overflow`).toBeLessThanOrEqual(geometry.viewport + 1);
  }

  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('watched match runs from Team News through post-match and unlocks navigation', async ({ page }) => {
  await startArsenalCareer(page);
  await go(page, 'match');

  await page.getByRole('button', { name: /Kick Off/ }).click();
  await expect(page.locator('.kickoff-beat')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.broadcast-pitch')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.broadcast-nav')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole('button', { name: /Tactics/ }).click();
  await expect(page.getByRole('region', { name: 'Live match tactics' })).toBeVisible();
  await page.getByRole('button', { name: 'Attacking mentality' }).click();
  await expect(page.getByRole('button', { name: 'Attacking mentality' })).toHaveClass(/active/);
  await page.getByRole('button', { name: /Back to match/ }).click();
  await expect(page.locator('.broadcast-pitch')).toBeVisible();

  await page.getByRole('button', { name: '4×' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Skip/ }).click();

  await expect(page.locator('.ft-status')).toHaveText('FULL TIME', { timeout: 15000 });
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.locator('.after-wrap')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /Continue/ }).click();

  await expect(page.locator('#screen-home')).toHaveClass(/active/, { timeout: 15000 });
  await expect(page.locator('.broadcast-nav')).toBeVisible();
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});
