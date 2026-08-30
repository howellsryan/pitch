import { test, expect } from '@playwright/test';

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
}

test('Settings can return to title and Continue resumes the same career', async ({ page }) => {
  await startArsenalCareer(page);
  await go(page, 'settings');

  await page.getByRole('button', { name: 'Menu' }).click();
  const menu = page.getByRole('region', { name: 'Career menu' });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Arsenal');
  await expect(menu.getByRole('button', { name: 'Continue career' })).toBeVisible();

  await menu.getByRole('button', { name: 'Continue career' }).click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#screen-home')).toHaveClass(/active/, { timeout: 15000 });

  await go(page, 'settings');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('Start a new career?')).toBeVisible();
  await expect(page.getByText(/Export a .*\.pitch.* backup first/i)).toBeVisible();
  await page.getByRole('button', { name: 'Keep Career' }).click();
  await expect(page.locator('#screen-settings')).toHaveClass(/active/);
});

test('startNewGame replaces previous league fixtures and standings', async ({ page }) => {
  await startArsenalCareer(page);

  const state = await page.evaluate(async () => {
    const saveModule = await import('/src/modules/save.js');
    const db = await import('/src/modules/db.js');

    const before = await db.getSave();
    const allTeams = saveModule.getAllTeamData();
    const target = allTeams.find((team) => (team.league ?? 'Premier League') !== before.userLeague);
    if (!target) throw new Error('No cross-league target club found');

    await saveModule.startNewGame(target.id, 'R7 Test Manager');

    const after = await db.getSave();
    const targetLeagueIds = new Set(
      allTeams
        .filter((team) => (team.league ?? 'Premier League') === after.userLeague)
        .map((team) => team.id),
    );
    const fixtures = await db.getAllFixtures();
    const standings = await db.getAllStandings();

    return {
      beforeTeamId: before.userTeamId,
      afterTeamId: after.userTeamId,
      afterLeague: after.userLeague,
      expectedStandings: targetLeagueIds.size,
      standingsCount: standings.length,
      staleStandingIds: standings.filter((row) => !targetLeagueIds.has(row.teamId)).map((row) => row.teamId),
      staleFixtureIds: fixtures
        .filter((fixture) => !targetLeagueIds.has(fixture.homeTeamId) || !targetLeagueIds.has(fixture.awayTeamId))
        .slice(0, 10)
        .map((fixture) => fixture.id),
      oldTeamStillPresent: standings.some((row) => row.teamId === before.userTeamId)
        || fixtures.some((fixture) => fixture.homeTeamId === before.userTeamId || fixture.awayTeamId === before.userTeamId),
    };
  });

  expect(state.afterTeamId).not.toBe(state.beforeTeamId);
  expect(state.standingsCount).toBe(state.expectedStandings);
  expect(state.staleStandingIds).toEqual([]);
  expect(state.staleFixtureIds).toEqual([]);
  expect(state.oldTeamStillPresent).toBe(false);
});

test('R7 secondary screens keep dense mobile geometry including Team News', async ({ page }) => {
  await startArsenalCareer(page);

  await page.evaluate(async () => {
    const inbox = await import('/src/ui/inbox.js');
    const db = await import('/src/modules/db.js');
    const save = await db.getSave();
    await inbox.addNewsItem(inbox._makeNewsItem('academy', 'Academy report ready', 'A new youth report is available.', { gw: save.currentGameweek }));
  });

  for (const id of ['academy', 'trophies', 'settings', 'inbox']) {
    await go(page, id);
    const geometry = await page.evaluate((screenId) => {
      const root = document.getElementById(`screen-${screenId}`);
      const nav = document.querySelector('.broadcast-nav');
      const controls = [...root.querySelectorAll('button, input, textarea, select')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
        })
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        });
      const navRect = nav?.getBoundingClientRect();
      const overlapsNav = navRect ? controls.some((r) => r.left < navRect.right && r.right > navRect.left && r.top < navRect.bottom && r.bottom > navRect.top) : false;
      return {
        docWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        overlapsNav,
      };
    }, id);

    expect(geometry.docWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.overlapsNav).toBe(false);
  }

  await expect(page.locator('#screen-inbox')).toContainText('Academy report ready');
});
