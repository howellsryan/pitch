import { describe, expect, it } from 'vitest';

import {
  applyWorldPlayerStats,
  buildLivingWorldSeasonSummary,
  buildWorldBackfill,
  buildWorldLeagueSeason,
  generateReplacementNewgens,
  resetSeasonPlayerStats,
  resultFromCanonicalLeagueRecord,
  toCanonicalLeagueRecord,
} from './world.js';

function team(id, league, reputation = 70) {
  return { id, name:id.toUpperCase(), shortName:id.slice(0, 3).toUpperCase(), league, reputation, budget:10_000_000 };
}

function player(id, teamId, position = 'CM') {
  return {
    id,
    name:id,
    teamId,
    position,
    age:24,
    attack:68,
    midfield:72,
    defence:65,
    goalkeeping:position === 'GK' ? 74 : 12,
    appearances:0,
    starts:0,
    minutes:0,
    goals:0,
    assists:0,
    cleanSheets:0,
    yellowCards:0,
    form:50,
  };
}

describe('P1 living-world contracts', () => {
  it('creates a full double round-robin schedule and table for every supported league', () => {
    const teams = [
      team('a1', 'League A'), team('a2', 'League A'), team('a3', 'League A'), team('a4', 'League A'),
      team('b1', 'League B'), team('b2', 'League B'), team('b3', 'League B'), team('b4', 'League B'),
    ];

    const world = buildWorldLeagueSeason(teams, 2025);

    expect(world.fixtures).toHaveLength(24);
    expect(world.standings).toHaveLength(8);
    expect(new Set(world.fixtures.map(f => f.league))).toEqual(new Set(['League A', 'League B']));
    expect(world.fixtures.filter(f => f.league === 'League A')).toHaveLength(12);
    expect(world.fixtures.filter(f => f.league === 'League B')).toHaveLength(12);
  });

  it('backfills missing leagues without replacing an existing P0 league schedule', () => {
    const teams = [
      team('a1', 'League A'), team('a2', 'League A'),
      team('b1', 'League B'), team('b2', 'League B'),
    ];
    const existingFixture = {
      id:'legacy_a', competition:'league', gameweek:1, homeTeamId:'a1', awayTeamId:'a2', played:true,
    };
    const existingStanding = { teamId:'a1', teamName:'A1', played:1, points:3 };

    const patch = buildWorldBackfill(teams, [existingFixture], [existingStanding], 2025);

    expect(patch.fixturesToAdd.some(f => f.id === 'legacy_a')).toBe(true);
    expect(patch.fixturesToAdd.find(f => f.id === 'legacy_a')).toMatchObject({ league:'League A', played:true });
    expect(patch.fixturesToAdd.filter(f => f.league === 'League B')).toHaveLength(2);
    expect(patch.standingsToAdd.find(row => row.teamId === 'a1')).toMatchObject({ league:'League A', points:3 });
    expect(patch.standingsToAdd.some(row => row.teamId === 'b1')).toBe(true);
    expect(patch.standingsToAdd.some(row => row.teamId === 'b2')).toBe(true);
  });

  it('round-trips one canonical match record without inventing another result', () => {
    const fixture = {
      id:'gw1_a_b', competition:'league', gameweek:1, league:'League A', homeTeamId:'a', awayTeamId:'b', played:false,
    };
    const result = {
      homeTeamId:'a', awayTeamId:'b', homeGoals:2, awayGoals:1,
      homeScorers:[{ type:'goal', playerId:'a9', assistId:'a8' }],
      awayScorers:[{ type:'goal', playerId:'b9' }],
      events:[{ type:'yellow', minute:40, teamId:'b', playerId:'b4' }],
      fitnessUpdates:[{ id:'a9', teamId:'a', newFitness:72 }],
      stats:{ shots:{ home:12, away:8 } },
    };

    const canonical = toCanonicalLeagueRecord(fixture, result, '2025/26');
    const restored = resultFromCanonicalLeagueRecord(canonical);

    expect(canonical).toMatchObject({ played:true, projectionsApplied:false, season:'2025/26', homeGoals:2, awayGoals:1 });
    expect(restored).toMatchObject({ fixtureId:fixture.id, homeTeamId:'a', awayTeamId:'b', homeGoals:2, awayGoals:1, gameweek:1 });
    expect(restored.events).toEqual(result.events);
  });

  it('derives appearances, minutes, goals, assists, cards, ratings and goalkeeper clean sheets from one result', () => {
    const cache = new Map([
      ['gk', player('gk', 'a', 'GK')],
      ['starter', player('starter', 'a', 'ST')],
      ['creator', player('creator', 'a', 'CM')],
      ['sub', player('sub', 'a', 'RW')],
      ['opp', player('opp', 'b', 'ST')],
    ]);
    const result = {
      homeTeamId:'a', awayTeamId:'b', homeGoals:1, awayGoals:0, gameweek:4,
      fitnessUpdates:[
        { id:'gk', teamId:'a', newFitness:80 },
        { id:'starter', teamId:'a', newFitness:68 },
        { id:'creator', teamId:'a', newFitness:70 },
        { id:'opp', teamId:'b', newFitness:67 },
      ],
      events:[
        { type:'sub', minute:60, teamId:'a', outId:'creator', inId:'sub' },
        { type:'goal', minute:75, teamId:'a', playerId:'starter', assistId:'sub' },
        { type:'yellow', minute:82, teamId:'b', playerId:'opp' },
      ],
    };

    applyWorldPlayerStats(cache, [result]);

    expect(cache.get('starter')).toMatchObject({ appearances:1, starts:1, minutes:90, goals:1 });
    expect(cache.get('creator')).toMatchObject({ appearances:1, starts:1, minutes:60 });
    expect(cache.get('sub')).toMatchObject({ appearances:1, starts:0, minutes:30, assists:1 });
    expect(cache.get('gk')).toMatchObject({ appearances:1, cleanSheets:1 });
    expect(cache.get('opp')).toMatchObject({ appearances:1, yellowCards:1 });
    expect(cache.get('starter').averageRating).toBeGreaterThan(6);
  });

  it('resets only season projections while keeping the durable player identity intact', () => {
    const original = { ...player('p1', 'a'), goals:12, assists:7, minutes:2200, averageRating:7.2, yellowCards:5 };
    const reset = resetSeasonPlayerStats(original);

    expect(reset).toMatchObject({ id:'p1', teamId:'a', goals:0, assists:0, minutes:0, yellowCards:0, averageRating:null });
  });

  it('stores compact league, club and player history from the same season projections', () => {
    const teams = [team('a', 'League A'), team('b', 'League A')];
    const standings = [
      { teamId:'a', teamName:'A', league:'League A', position:1, points:80, form:['W','W'] },
      { teamId:'b', teamName:'B', league:'League A', position:2, points:70, form:['L','W'] },
    ];
    const players = [
      { ...player('ace', 'a', 'ST'), appearances:30, minutes:2500, goals:21, assists:4, averageRating:7.8, ratingApps:30 },
      { ...player('maker', 'b', 'CM'), appearances:28, minutes:2300, goals:5, assists:12, averageRating:7.4, ratingApps:28 },
    ];
    const transfers = [{ playerId:'ace', fromTeamId:'b', toTeamId:'a', fee:25_000_000, type:'buy', date:'2025-08-20' }];

    const history = buildLivingWorldSeasonSummary({
      save:{ season:'2025/26', userTeamId:'a', managerName:'Manager' },
      teams, standings, players, transfers,
    });

    expect(history.competitionHistory[0]).toMatchObject({ competition:'League A', champion:'a' });
    expect(history.competitionHistory[0].topScorer).toMatchObject({ playerId:'ace', value:21 });
    expect(history.competitionHistory[0].topAssists).toMatchObject({ playerId:'maker', value:12 });
    expect(history.clubHistory.find(row => row.teamId === 'a')).toMatchObject({ finish:1, manager:'Manager' });
    expect(history.playerHistory.find(row => row.playerId === 'ace').transfers).toHaveLength(1);
  });

  it('replaces retirees one-for-one with context-calibrated generated players', () => {
    const teams = [team('a', 'League A', 85), team('b', 'League B', 60)];
    const retirees = [
      { ...player('old_a', 'a', 'ST'), age:37, attack:84 },
      { ...player('old_b', 'b', 'GK'), age:38, goalkeeping:66 },
    ];

    const generated = generateReplacementNewgens(retirees, teams, '2026/27');

    expect(generated).toHaveLength(2);
    expect(generated[0]).toMatchObject({ teamId:'a', position:'ST', generated:true, generatedSeason:'2026/27' });
    expect(generated[1]).toMatchObject({ teamId:'b', position:'GK', generated:true, generatedSeason:'2026/27' });
    expect(generated.every(p => p.age >= 17 && p.age <= 20)).toBe(true);
    expect(new Set(generated.map(p => p.id)).size).toBe(2);
  });
});
