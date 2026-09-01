import { describe, expect, it } from 'vitest';

import { personalStateSettlementRequiresFullWorld } from './gameweek.js';
import { buildPersonalStatePatches, normalizePlayerModel } from './playerModel.js';
import { coalescePersonalStateProjection, projectNonLeaguePlayers, projectWorldBatch } from './worldRuntime.js';

function player(id, teamId, extras = {}) {
  return normalizePlayerModel({
    id,
    name:id,
    teamId,
    position:'CM',
    age:24,
    attack:65,
    midfield:74,
    defence:66,
    goalkeeping:10,
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
  });
}

function standing(teamId) {
  return {
    teamId,
    teamName:teamId,
    league:'League A',
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

function result(homeTeamId, awayTeamId, fitnessUpdates = []) {
  return {
    homeTeamId,
    awayTeamId,
    homeGoals:0,
    awayGoals:0,
    gameweek:5,
    season:'2025/26',
    events:[],
    fitnessUpdates,
  };
}

describe('P3 completed world-week settlement', () => {
  it('keeps the full-world final pass only for genuine league-less weeks', () => {
    expect(personalStateSettlementRequiresFullWorld([])).toBe(true);
    expect(personalStateSettlementRequiresFullWorld([
      { id:'cup-only', competition:'cup', gameweek:5, played:true },
    ])).toBe(true);
    expect(personalStateSettlementRequiresFullWorld([
      { id:'league', competition:'league', gameweek:5, played:true },
      { id:'cup', competition:'cup', gameweek:5, played:true },
    ])).toBe(false);
  });

  it('settles a league-only player exactly once', () => {
    const league = projectWorldBatch(
      [player('starter', 'a'), player('opponent', 'b')],
      [standing('a'), standing('b')],
      [result('a', 'b', [
        { id:'starter', teamId:'a', newFitness:72 },
        { id:'opponent', teamId:'b', newFitness:72 },
      ])],
    );
    const settled = coalescePersonalStateProjection(league.players, league.changedPlayers, 5, '2025/26');
    const starter = settled.players.find(row => row.id === 'starter');

    expect(starter).toMatchObject({
      appearances:1,
      minutes:90,
      personalStateSettledKey:'2025/26:5',
      developmentSettledKey:'2025/26:5',
    });
    expect(buildPersonalStatePatches(settled.players, 5, '2025/26')).toEqual([]);
  });

  it('settles league + European participation once after total exposure is known', () => {
    const initial = [player('euro-starter', 'a'), player('opponent', 'b')];
    const league = projectWorldBatch(
      initial,
      [standing('a'), standing('b')],
      [result('a', 'b', [
        { id:'euro-starter', teamId:'a', newFitness:72 },
        { id:'opponent', teamId:'b', newFitness:72 },
      ])],
    );
    const deferred = coalescePersonalStateProjection(
      league.players,
      league.changedPlayers,
      5,
      '2025/26',
      { deferTeamIds:new Set(['a']) },
    );
    expect(deferred.players.find(row => row.id === 'euro-starter').personalStateSettledKey).toBeNull();

    const european = projectNonLeaguePlayers(deferred.players, [result('a', 'b', [
      { id:'euro-starter', teamId:'a', newFitness:68 },
    ])]);
    const final = coalescePersonalStateProjection(european, european, 5, '2025/26');
    const starter = final.players.find(row => row.id === 'euro-starter');

    expect(starter).toMatchObject({
      appearances:2,
      minutes:180,
      personalStateSettledKey:'2025/26:5',
      developmentSettledKey:'2025/26:5',
    });
    expect(buildPersonalStatePatches(final.players, 5, '2025/26')).toEqual([]);
  });

  it('applies no-fixture personal recovery/decay once and replay is a no-op', () => {
    const idle = player('idle', 'a', { individualMorale:60, sharpness:70 });
    const [settled] = buildPersonalStatePatches([idle], 5, '2025/26');

    expect(settled).toMatchObject({
      individualMorale:58,
      sharpness:66,
      personalStateSettledKey:'2025/26:5',
    });
    expect(settled.developmentSettledKey).toBeNull();
    expect(buildPersonalStatePatches([settled], 5, '2025/26')).toEqual([]);
  });
});
