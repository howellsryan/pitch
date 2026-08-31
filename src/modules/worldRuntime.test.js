import { describe, expect, it } from 'vitest';

import { assignDefaultSquadRoles, buildPersonalStatePatches, normalizePlayerModel } from './playerModel.js';
import {
  coalescePersonalStateProjection,
  projectNonLeaguePlayers,
  projectWorldBatch,
  scheduledWorldCompetitionTeamIds,
} from './worldRuntime.js';

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

function result(homeTeamId, awayTeamId, gameweek = 1, extras = {}) {
  return {
    homeTeamId,
    awayTeamId,
    homeGoals:0,
    awayGoals:0,
    gameweek,
    season:'2025/26',
    events:[],
    fitnessUpdates:[],
    ...extras,
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
    const match = {
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

    const projected = projectWorldBatch(players, standings, [match]);
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
    const match = {
      homeTeamId:'a', awayTeamId:'b', homeGoals:0, awayGoals:0, events:[],
      fitnessUpdates:[
        { id:'played', teamId:'a', newFitness:60 },
        { id:'opp', teamId:'b', newFitness:70 },
      ],
    };

    const projected = projectWorldBatch(
      [played, rested, opponent],
      [standing('a', 'League A'), standing('b', 'League A')],
      [match],
    );
    const byId = new Map(projected.players.map(p => [p.id, p]));

    expect(byId.get('played').fitness).toBe(80);
    expect(byId.get('rested').fitness).toBe(100);
    expect(byId.get('rested').form).toBe(62);
  });

  it('persists only player rows whose projected state changed', () => {
    const starter = player('starter', 'a', 'CM');
    const alreadyNeutralRested = player('neutral', 'a', 'CM');
    const recoveringRested = player('recovering', 'a', 'CM', { fitness:73, form:56 });
    const opponent = player('opp', 'b', 'CM');
    const match = {
      homeTeamId:'a', awayTeamId:'b', homeGoals:0, awayGoals:0, events:[],
      fitnessUpdates:[
        { id:'starter', teamId:'a', newFitness:70 },
        { id:'opp', teamId:'b', newFitness:70 },
      ],
    };

    const projected = projectWorldBatch(
      [starter, alreadyNeutralRested, recoveringRested, opponent],
      [standing('a', 'League A'), standing('b', 'League A')],
      [match],
    );
    const changedIds = projected.changedPlayers.map(row => row.id).sort();

    expect(changedIds).toEqual(['opp', 'recovering', 'starter']);
    expect(projected.players).toHaveLength(4);
  });

  it('coalesces P3 weekly state into the existing changed-row projection', () => {
    const prepared = assignDefaultSquadRoles([
      player('starter', 'a', 'CM'),
      player('p3-rested', 'a', 'CM', { individualMorale:60, sharpness:70 }),
      player('opp', 'b', 'CM'),
    ].map(normalizePlayerModel), { currentYear:2025, managedTeamId:null });
    const match = {
      homeTeamId:'a', awayTeamId:'b', homeGoals:0, awayGoals:0, events:[],
      fitnessUpdates:[
        { id:'starter', teamId:'a', newFitness:70 },
        { id:'opp', teamId:'b', newFitness:70 },
      ],
    };
    const projected = projectWorldBatch(
      prepared,
      [standing('a', 'League A'), standing('b', 'League A')],
      [match],
    );
    expect(projected.changedPlayers.map(row => row.id).sort()).toEqual(['opp', 'starter']);

    const coalesced = coalescePersonalStateProjection(
      projected.players,
      projected.changedPlayers,
      1,
      '2025/26',
    );
    const changedIds = coalesced.changedPlayers.map(row => row.id).sort();
    const rested = coalesced.players.find(row => row.id === 'p3-rested');
    const starter = coalesced.players.find(row => row.id === 'starter');

    expect(changedIds).toEqual(['opp', 'p3-rested', 'starter']);
    expect(rested).toMatchObject({ individualMorale:58, sharpness:66, personalStateSettledKey:'2025/26:1' });
    expect(starter).toMatchObject({ personalStateSettledKey:'2025/26:1', developmentSettledKey:'2025/26:1' });
  });

  it('defers a managed club until the completed world-week boundary', () => {
    const prepared = assignDefaultSquadRoles([
      player('user-starter', 'user', 'CM'),
      player('user-rested', 'user', 'CM', { individualMorale:60, sharpness:70 }),
      player('opp', 'b', 'CM'),
    ].map(normalizePlayerModel), { currentYear:2025, managedTeamId:'user' });
    const projected = projectWorldBatch(
      prepared,
      [standing('user', 'League A'), standing('b', 'League A')],
      [result('user', 'b', 1, { fitnessUpdates:[
        { id:'user-starter', teamId:'user', newFitness:70 },
        { id:'opp', teamId:'b', newFitness:70 },
      ] })],
    );

    const coalesced = coalescePersonalStateProjection(projected.players, projected.changedPlayers, 1, '2025/26');
    expect(coalesced.players.find(row => row.id === 'user-starter').personalStateSettledKey).toBeNull();
    expect(coalesced.players.find(row => row.id === 'user-rested').personalStateSettledKey).toBeNull();
    expect(coalesced.players.find(row => row.id === 'opp').personalStateSettledKey).toBe('2025/26:1');

    const finalPatches = buildPersonalStatePatches(coalesced.players, 1, '2025/26');
    const userPatches = finalPatches.filter(row => row.teamId === 'user');
    expect(userPatches).toHaveLength(2);
    expect(userPatches.every(row => row.personalStateSettledKey === '2025/26:1')).toBe(true);
    expect(userPatches.every(row => row.playingTimeAgreement?.history?.filter(sample => sample.key === '2025/26:1').length === 1)).toBe(true);
  });

  it('defers league + domestic cup participation and settles once after total exposure is known', () => {
    const prepared = [
      normalizePlayerModel(player('cup-starter', 'a', 'CM')),
      normalizePlayerModel(player('cup-rested', 'a', 'CM', { individualMorale:60, sharpness:70 })),
      normalizePlayerModel(player('opp', 'b', 'CM')),
    ];
    const league = projectWorldBatch(
      prepared,
      [standing('a', 'League A'), standing('b', 'League A')],
      [result('a', 'b', 1, { fitnessUpdates:[
        { id:'cup-starter', teamId:'a', newFitness:70 },
        { id:'opp', teamId:'b', newFitness:70 },
      ] })],
    );
    const afterLeague = coalescePersonalStateProjection(
      league.players,
      league.changedPlayers,
      1,
      '2025/26',
      { deferTeamIds:new Set(['a']) },
    );
    expect(afterLeague.players.find(row => row.id === 'cup-starter').personalStateSettledKey).toBeNull();

    const cupProjected = projectNonLeaguePlayers(afterLeague.players, [result('a', 'b', 1, {
      competition:'cup',
      fitnessUpdates:[{ id:'cup-starter', teamId:'a', newFitness:66 }],
    })]);
    const afterCup = coalescePersonalStateProjection(cupProjected, cupProjected, 1, '2025/26');
    const starter = afterCup.players.find(row => row.id === 'cup-starter');
    expect(starter).toMatchObject({ appearances:2, minutes:180, personalStateSettledKey:'2025/26:1', developmentSettledKey:'2025/26:1' });
    expect(buildPersonalStatePatches(afterCup.players, 1, '2025/26')).toEqual([]);
  });

  it('recognises scheduled domestic and European background participants before league settlement', () => {
    const state = {
      competitions:{
        league_cup:{
          id:'league_cup',
          format:'knockout',
          roundIndex:0,
          activeTeamIds:['cup-a','cup-b'],
          entrantsByRound:{ 0:['cup-c'] },
          processedGameweeks:[],
          results:[],
        },
        ucl:{
          id:'ucl',
          format:'uefa_league_phase',
          phase:'league_phase',
          leaguePhaseMatchday:0,
          activeTeamIds:['euro-a','euro-b'],
          processedGameweeks:[],
          results:[],
        },
      },
    };

    expect([...scheduledWorldCompetitionTeamIds(state, 1)].sort()).toEqual(['cup-a','cup-b','cup-c']);
    expect([...scheduledWorldCompetitionTeamIds(state, 5)].sort()).toEqual(['euro-a','euro-b']);
  });

  it('keeps the defer decision stable after a background competition record is persisted', () => {
    const state = {
      competitions:{
        league_cup:{
          id:'league_cup',
          format:'knockout',
          roundIndex:1,
          activeTeamIds:['winner'],
          processedGameweeks:[1],
          results:[result('cup-a', 'cup-b', 1, { id:'world:cup', competitionId:'league_cup' })],
        },
      },
    };
    expect([...scheduledWorldCompetitionTeamIds(state, 1)].sort()).toEqual(['cup-a','cup-b']);
  });

  it('projects and returns only clubs participating in a cup batch', () => {
    const cupPlayer = player('cup', 'a', 'CM', { fitness:68, form:55 });
    const idleElsewhere = player('idle', 'other', 'CM', { fitness:61, form:67 });
    const opponent = player('opp', 'b', 'CM', { fitness:80, form:50 });
    const match = {
      homeTeamId:'a', awayTeamId:'b', homeGoals:1, awayGoals:0,
      events:[{ type:'goal', minute:30, teamId:'a', playerId:'cup' }],
      fitnessUpdates:[
        { id:'cup', teamId:'a', newFitness:60 },
        { id:'opp', teamId:'b', newFitness:70 },
      ],
    };

    const projected = projectNonLeaguePlayers([cupPlayer, idleElsewhere, opponent], [match]);
    const byId = new Map(projected.map(p => [p.id, p]));

    expect(byId.get('cup')).toMatchObject({ appearances:1, goals:1, fitness:80 });
    expect(byId.get('opp')).toMatchObject({ appearances:1, fitness:90 });
    expect(byId.has('idle')).toBe(false);
  });

  it('ticks a prior suspension before applying a new card threshold', () => {
    const suspended = player('p', 'a', 'CM', { yellowCards:4, suspensionGWsLeft:1, suspended:true });
    const opponent = player('o', 'b');
    const match = {
      homeTeamId:'a', awayTeamId:'b', homeGoals:0, awayGoals:0,
      fitnessUpdates:[{ id:'p', teamId:'a', newFitness:70 }, { id:'o', teamId:'b', newFitness:70 }],
      events:[{ type:'yellow', minute:20, teamId:'a', playerId:'p' }],
    };

    const projected = projectWorldBatch(
      [suspended, opponent],
      [standing('a', 'League A'), standing('b', 'League A')],
      [match],
    );
    const p = projected.players.find(row => row.id === 'p');

    expect(p.yellowCards).toBe(5);
    expect(p.suspensionGWsLeft).toBe(1);
    expect(p.suspended).toBe(true);
  });
});
