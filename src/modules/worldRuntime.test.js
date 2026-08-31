import { describe, expect, it } from 'vitest';

import { projectWorldBatch } from './worldRuntime.js';

function player(id, teamId, position = 'CM', extras = {}) {
  return {
    id,
    name:id,
    teamId,
    position,
    age:24,
    attack:70,
    midfield:70,
    defence:70,
    goalkeeping:position === 'GK' ? 75 : 10,
    fitness:100,
    form:50,
    appearances:0,
    starts:0,
    minutes:0,
    goals:0,
    assists:0,
    cleanSheets:0,
    yellowCards:0,
    suspensionGWsLeft:0,
    ...extras,
  };
}

function standing(teamId, league) {
  return {
    teamId,
    teamName:teamId.toUpperCase(),
    league,
    played:0,
    won:0,
    drawn:0,
    lost:0,
    goalsFor:0,
    goalsAgainst:0,
    goalDifference:0,
    points:0,
    position:0,
    form:[],
  };
}

describe('P1 world projection runtime', () => {
  it('projects player statistics and league standings from the same match result', () => {
    const players = [
      player('a_gk', 'a', 'GK'),
      player('a_st', 'a', 'ST'),
      player('b_gk', 'b', 'GK'),
      player('b_st', 'b', 'ST'),
    ];
    const standings = [standing('a', 'League A'), standing('b', 'League A')];
    const result = {
      fixtureId:'gw1_a_b',
      gameweek:1,
      homeTeamId:'a',
      awayTeamId:'b',
      homeGoals:1,
      awayGoals:0,
      events:[
        { type:'goal', minute:55, teamId:'a', playerId:'a_st' },
        { type:'yellow', minute:70, teamId:'b', playerId:'b_st' },
      ],
      fitnessUpdates:[
        { id:'a_gk', teamId:'a', newFitness:74 },
        { id:'a_st', teamId:'a', newFitness:70 },
        { id:'b_gk', teamId:'b', newFitness:72 },
        { id:'b_st', teamId:'b', newFitness:68 },
      ],
    };

    const projected = projectWorldBatch(players, standings, [result]);
    const byId = new Map(projected.players.map(p => [p.id, p]));
    const table = new Map(projected.standings.map(row => [row.teamId, row]));

    expect(table.get('a')).toMatchObject({ played:1, won:1, points:3, goalsFor:1, goalsAgainst:0, position:1 });
    expect(table.get('b')).toMatchObject({ played:1, lost:1, points:0, goalsFor:0, goalsAgainst:1, position:2 });
    expect(byId.get('a_st')).toMatchObject({ appearances:1, starts:1, minutes:90, goals:1 });
    expect(byId.get('a_gk')).toMatchObject({ appearances:1, cleanSheets:1 });
    expect(byId.get('b_st')).toMatchObject({ appearances:1, yellowCards:1 });
  });

  it('keeps every league table independent when recomputing positions', () => {
    const players = [
      player('a1p', 'a1'), player('a2p', 'a2'), player('b1p', 'b1'), player('b2p', 'b2'),
    ];
    const standings = [
      standing('a1', 'League A'), standing('a2', 'League A'),
      standing('b1', 'League B'), standing('b2', 'League B'),
    ];
    const results = [
      { homeTeamId:'a1', awayTeamId:'a2', homeGoals:2, awayGoals:0, events:[], fitnessUpdates:[] },
      { homeTeamId:'b2', awayTeamId:'b1', homeGoals:1, awayGoals:0, events:[], fitnessUpdates:[] },
    ];

    const projected = projectWorldBatch(players, standings, results);
    const table = new Map(projected.standings.map(row => [row.teamId, row]));

    expect(table.get('a1').position).toBe(1);
    expect(table.get('a2').position).toBe(2);
    expect(table.get('b2').position).toBe(1);
    expect(table.get('b1').position).toBe(2);
  });

  it('retains between-match recovery and neutralises rested players', () => {
    const played = player('played', 'a', 'CM', { fitness:65, form:55, age:24 });
    const rested = player('rested', 'a', 'CM', { fitness:62, form:65, age:24 });
    const opponent = player('opp', 'b', 'CM', { fitness:80, form:50, age:24 });
    const result = {
      homeTeamId:'a', awayTeamId:'b', homeGoals:0, awayGoals:0, events:[],
      fitnessUpdates:[
        { id:'played', teamId:'a', newFitness:60 },
        { id:'opp', teamId:'b', newFitness:70 },
      ],
    };

    const projected = projectWorldBatch(
      [played, rested, opponent],
      [standing('a', 'League A'), standing('b', 'League A')],
      [result],
    );
    const byId = new Map(projected.players.map(p => [p.id, p]));

    expect(byId.get('played').fitness).toBe(80);
    expect(byId.get('rested').fitness).toBe(100);
    expect(byId.get('rested').form).toBe(62);
  });

  it('ticks a prior suspension before applying a new card threshold', () => {
    const suspended = player('p', 'a', 'CM', { yellowCards:4, suspensionGWsLeft:1, suspended:true });
    const opponent = player('o', 'b');
    const result = {
      homeTeamId:'a', awayTeamId:'b', homeGoals:0, awayGoals:0,
      fitnessUpdates:[{ id:'p', teamId:'a', newFitness:70 }, { id:'o', teamId:'b', newFitness:70 }],
      events:[{ type:'yellow', minute:20, teamId:'a', playerId:'p' }],
    };

    const projected = projectWorldBatch(
      [suspended, opponent],
      [standing('a', 'League A'), standing('b', 'League A')],
      [result],
    );
    const p = projected.players.find(row => row.id === 'p');

    expect(p.yellowCards).toBe(5);
    expect(p.suspensionGWsLeft).toBe(1);
    expect(p.suspended).toBe(true);
  });
});
