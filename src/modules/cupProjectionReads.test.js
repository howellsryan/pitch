import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ players:[], writes:[] }));
vi.mock('./db.js', () => ({
  getAllPlayers:async () => { throw new Error('Unrelated world players must not be loaded for a cup projection'); },
  getPlayersByTeams:async ids => structuredClone(state.players.filter(player => ids.includes(player.teamId))),
  putPlayersBulk:async rows => { state.writes.push(...structuredClone(rows)); },
}));

import { applyNonLeaguePlayerResults, projectNonLeaguePlayers } from './worldRuntime.js';

describe('cup projection scope', () => {
  beforeEach(() => { state.players = []; state.writes = []; });

  it('preserves the full-world projection while reading only participating clubs', async () => {
    state.players = ['home','away','third','unrelated','free_agents'].map((teamId, index) => ({
      id:`p${index}`, teamId, position:'ST', age:24, fitness:80, form:50,
      appearances:0, starts:0, minutes:0, goals:0, assists:0,
    }));
    const matches = [
      { homeTeamId:'home', awayTeamId:'away', homeGoals:1, awayGoals:0,
        events:[{ type:'goal', teamId:'home', playerId:'p0' }], fitnessUpdates:[] },
      { homeTeamId:'home', awayTeamId:'third', homeGoals:0, awayGoals:0, events:[], fitnessUpdates:[] },
    ];
    const expected = projectNonLeaguePlayers(structuredClone(state.players), matches);
    await applyNonLeaguePlayerResults(matches);
    expect(state.writes.sort((a,b) => a.id.localeCompare(b.id))).toEqual(expected.sort((a,b) => a.id.localeCompare(b.id)));
    expect(new Set(state.writes.map(player => player.id)).size).toBe(state.writes.length);
    expect(state.writes.some(player => ['unrelated','free_agents'].includes(player.teamId))).toBe(false);
  });

  it('does no persistence work for an empty batch', async () => {
    await applyNonLeaguePlayerResults([]);
    expect(state.writes).toEqual([]);
  });
});
