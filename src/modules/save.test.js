import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  openDB: vi.fn(async () => {}),
  getSave: vi.fn(async () => null),
  putPlayersBulk: vi.fn(async () => {}),
  putManagersBulk: vi.fn(async () => {}),
  putSave: vi.fn(async () => {}),
  putTeamsBulk: vi.fn(async () => {}),
  replaceAllFixtures: vi.fn(async () => {}),
  replaceAllStandings: vi.fn(async () => {}),
}));

vi.mock('./db.js', () => db);

import { getAllTeamData, startNewGame } from './save.js';

describe('P1 new-career living-world persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces standings and fixtures with every supported domestic league', async () => {
    const allTeams = getAllTeamData();
    const target = allTeams.find((team) => team.league === 'La Liga')
      ?? allTeams.find((team) => (team.league ?? 'Premier League') !== 'Premier League');

    expect(target).toBeTruthy();
    await startNewGame(target.id, 'P1 Test Manager');

    expect(db.replaceAllStandings).toHaveBeenCalledTimes(1);
    expect(db.replaceAllFixtures).toHaveBeenCalledTimes(1);

    const expectedIds = new Set(allTeams.map((team) => team.id));
    const expectedLeagues = new Set(allTeams.map((team) => team.league ?? 'Premier League'));
    const [standings] = db.replaceAllStandings.mock.calls[0];
    const [fixtures] = db.replaceAllFixtures.mock.calls[0];

    expect(standings).toHaveLength(expectedIds.size);
    expect(new Set(standings.map((row) => row.league))).toEqual(expectedLeagues);
    expect(standings.every((row) => expectedIds.has(row.teamId))).toBe(true);

    expect(fixtures.length).toBeGreaterThan(0);
    expect(new Set(fixtures.map((fixture) => fixture.league))).toEqual(expectedLeagues);
    expect(fixtures.every((fixture) => (
      expectedIds.has(fixture.homeTeamId) && expectedIds.has(fixture.awayTeamId)
    ))).toBe(true);
  });
});
