import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  openDB: vi.fn(async () => {}),
  getSave: vi.fn(async () => null),
  putPlayersBulk: vi.fn(async () => {}),
  putSave: vi.fn(async () => {}),
  putTeamsBulk: vi.fn(async () => {}),
  replaceAllFixtures: vi.fn(async () => {}),
  replaceAllStandings: vi.fn(async () => {}),
}));

vi.mock('./db.js', () => db);

import { getAllTeamData, startNewGame } from './save.js';

describe('R7 new-career persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces standings and fixtures with only the selected league', async () => {
    const allTeams = getAllTeamData();
    const target = allTeams.find((team) => team.league === 'La Liga')
      ?? allTeams.find((team) => (team.league ?? 'Premier League') !== 'Premier League');

    expect(target).toBeTruthy();
    await startNewGame(target.id, 'R7 Test Manager');

    expect(db.replaceAllStandings).toHaveBeenCalledTimes(1);
    expect(db.replaceAllFixtures).toHaveBeenCalledTimes(1);

    const expectedIds = new Set(
      allTeams
        .filter((team) => (team.league ?? 'Premier League') === (target.league ?? 'Premier League'))
        .map((team) => team.id),
    );
    const [standings] = db.replaceAllStandings.mock.calls[0];
    const [fixtures] = db.replaceAllFixtures.mock.calls[0];

    expect(standings).toHaveLength(expectedIds.size);
    expect(standings.every((row) => expectedIds.has(row.teamId))).toBe(true);
    expect(fixtures.length).toBeGreaterThan(0);
    expect(fixtures.every((fixture) => expectedIds.has(fixture.homeTeamId) && expectedIds.has(fixture.awayTeamId))).toBe(true);
  });
});
