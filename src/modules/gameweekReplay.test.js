import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => ({ save:null, teams:[], players:[], fixtures:[], standings:[], failProjection:false, failAdvanceSave:false, projections:0 }));

vi.mock('./db.js', () => {
  const clone = value => globalThis.structuredClone(value);
  const putRows = (name, rows, key = 'id') => {
    for (const row of rows) {
      const index = memory[name].findIndex(existing => existing[key] === row[key]);
      if (index < 0) memory[name].push(clone(row));
      else memory[name][index] = clone(row);
    }
  };
  return {
    SAVE_SCHEMA_VERSION:2, _db:null,
    getSave:async () => clone(memory.save), putSave:async save => {
      if (memory.failAdvanceSave && save.currentGameweek > memory.save.currentGameweek) {
        memory.failAdvanceSave = false;
        throw new Error('interrupted before final week save');
      }
      memory.save = clone(save);
    },
    getAllTeams:async () => clone(memory.teams), getAllPlayers:async () => clone(memory.players),
    getAllStandings:async () => clone(memory.standings), getAllFixtures:async () => clone(memory.fixtures),
    getFixturesByGW:async gw => clone(memory.fixtures.filter(row => row.gameweek === gw)),
    getPlayersByTeam:async id => clone(memory.players.filter(row => row.teamId === id)),
    getTeam:async id => clone(memory.teams.find(row => row.id === id)),
    getManager:async () => null,
    getStanding:async id => clone(memory.standings.find(row => row.teamId === id)),
    putPlayersBulk:async rows => putRows('players', rows),
    putFixture:async row => putRows('fixtures', [row]), putFixturesBulk:async rows => putRows('fixtures', rows),
    putTeam:async row => putRows('teams', [row]),
    commitMatchEventAtomic:async ({ event, season, gameweek, savePatch, fixture, players }) => {
      if (memory.save.season !== season || memory.save.currentGameweek !== gameweek || JSON.stringify(memory.save.pendingEvents?.[0]) !== JSON.stringify(event)) throw new Error('MATCH_EVENT_CHANGED');
      if (fixture) putRows('fixtures', [fixture]);
      putRows('players', players ?? []);
      memory.save = { ...memory.save, ...clone(savePatch) };
      return clone(memory.save);
    },
  };
});

vi.mock('./worldRuntime.js', async importOriginal => {
  const actual = await importOriginal();
  const world = await import('./world.js');
  return {
    ...actual,
    applyPendingWorldCompetitionProjections:async save => ({ save, results:[] }),
    applyPendingWorldLeagueProjections:async fixtures => {
      if (memory.failProjection) { memory.failProjection = false; throw new Error('interrupted before league projection'); }
      const pending = fixtures.filter(row => row.played && row.projectionsApplied !== true);
      if (!pending.length) return [];
      memory.projections += 1;
      const results = pending.map(world.resultFromCanonicalLeagueRecord);
      const projected = actual.projectWorldBatch(memory.players, memory.standings, results);
      memory.players = projected.players;
      memory.standings = projected.standings;
      for (const row of pending) memory.fixtures.find(existing => existing.id === row.id).projectionsApplied = true;
      return results;
    },
    applyNonLeaguePlayerResults:async results => {
      const projected = actual.projectNonLeaguePlayers(memory.players, results);
      for (const row of projected) memory.players[memory.players.findIndex(existing => existing.id === row.id)] = row;
    },
  };
});

vi.mock('./matchEngine.js', async importOriginal => ({
  ...await importOriginal(),
  simulateMatch:vi.fn((home, away, homePlayers, awayPlayers) => ({
    homeTeamId:home.id, awayTeamId:away.id, homeTeamName:home.name, awayTeamName:away.name,
    homeGoals:1, awayGoals:0, homeScorers:[], awayScorers:[], events:[],
    fitnessUpdates:[...homePlayers, ...awayPlayers].map(player => ({ id:player.id, teamId:player.teamId, newFitness:65 })),
    stats:{ possession:{ home:55, away:45 } }, seed:`${home.id}:${away.id}`,
  })),
}));
vi.mock('./p5Runtime.js', () => ({ advanceP5CareerDepthWeek:async () => ({}) }));
vi.mock('./p6Runtime.js', () => ({ advanceP6ManagerCareerWeek:async () => ({}) }));
vi.mock('./p7Runtime.js', () => ({ advanceP7ClubFinanceWeek:async () => ({}) }));
vi.mock('./p8Runtime.js', () => ({ advanceP8StoryWeek:async () => ({}) }));
vi.mock('./transfers.js', () => ({ advanceTransferMarketWeek:async () => ({}) }));
vi.mock('./season.js', () => ({ payWeeklyWages:async () => {} }));

import { simulateMatch } from './matchEngine.js';
import { advanceOneFixture, advanceOneFixtureWithResult, buildPendingEvents, getNextMatchEvent } from './gameweek.js';
import { toCanonicalLeagueRecord } from './world.js';

function setup({ league = true, cup = false, gw = 1 } = {}) {
  memory.save = { season:'2025/26', currentGameweek:gw, currentDate:'2025-08-09T00:00:00.000Z', totalGameweeks:38, userTeamId:'a', cups:cup ? { fa_cup:{ status:'active', roundIndex:0, results:[] } } : {}, pendingEvents:[] };
  memory.teams = ['a','b','c','d'].map(id => ({ id, name:id.toUpperCase(), league:'Premier League', reputation:70, morale:50 }));
  memory.players = memory.teams.flatMap(team => ['GK','ST'].map(position => ({ id:`${team.id}_${position}`, name:`${team.id}_${position}`, teamId:team.id, position, age:24, attack:70, midfield:70, defence:70, goalkeeping:position === 'GK' ? 70 : 10, fitness:100, form:70, suspensionGWsLeft:0, appearances:0, starts:0, minutes:0 })));
  memory.fixtures = league ? [
    { id:'managed', homeTeamId:'a', awayTeamId:'b', gameweek:gw, competition:'league', league:'Premier League', played:false },
    { id:'background', homeTeamId:'c', awayTeamId:'d', gameweek:gw, competition:'league', league:'Premier League', played:false },
  ] : [];
  memory.standings = memory.teams.map(team => ({ teamId:team.id, teamName:team.name, league:team.league, played:0, won:0, drawn:0, lost:0, goalsFor:0, goalsAgainst:0, goalDifference:0, points:0, form:[] }));
  memory.failProjection = false;
  memory.failAdvanceSave = false;
  memory.projections = 0;
  vi.clearAllMocks();
}

beforeEach(() => setup());

describe('managed result interruption recovery', () => {
  it('finishes a partially persisted league batch once without resimulating its managed result', async () => {
    const event = { type:'league', fixtureId:'managed', gw:1 };
    memory.save.pendingEvents = [event];
    const authoritative = { homeTeamId:'a', awayTeamId:'b', homeGoals:3, awayGoals:2, events:[], fitnessUpdates:[], seed:'original' };
    memory.fixtures[0] = toCanonicalLeagueRecord(memory.fixtures[0], authoritative, memory.save.season);
    memory.players.forEach(player => { player.suspensionGWsLeft = 2; });

    const result = await advanceOneFixture();

    expect(result.singleResult).toMatchObject({ homeGoals:3, awayGoals:2, seed:'original' });
    expect(simulateMatch).toHaveBeenCalledTimes(1);
    expect(memory.projections).toBe(1);
    expect(memory.standings.every(row => row.played === 1)).toBe(true);
    expect(memory.players.every(player => player.suspensionGWsLeft === 1)).toBe(true);
    expect(memory.save.currentGameweek).toBe(2);
    expect(memory.save.managerDNA.matches).toBe(1);
  });

  it('resumes after the result checkpoint without consuming another event or projecting twice', async () => {
    memory.failProjection = true;
    await expect(advanceOneFixture()).rejects.toThrow('interrupted before league projection');
    expect(memory.fixtures[0].played).toBe(true);
    expect(memory.save.pendingEvents).toEqual([]);
    expect(memory.save.currentGameweek).toBe(1);
    await advanceOneFixture();
    expect(simulateMatch).toHaveBeenCalledTimes(2);
    expect(memory.standings.every(row => row.played === 1)).toBe(true);
    expect(memory.save.managerDNA.matches).toBe(1);
    expect(memory.save.currentGameweek).toBe(2);
  });

  it('records Quick Sim cup appearances in the same checkpoint as its history and queue', async () => {
    setup({ league:false });
    const event = { type:'cup', cupId:'fa_cup', roundIdx:0, roundName:'First Round', gw:1, opponentId:'b', opponentName:'B', userIsHome:true };
    memory.save.cups = { fa_cup:{ status:'active', roundIndex:0, results:[] } };
    memory.save.pendingEvents = [event, { ...event, cupId:'league_cup' }];
    await advanceOneFixture();
    expect(memory.players.filter(player => ['a','b'].includes(player.teamId)).every(player => player.appearances === 1)).toBe(true);
    expect(memory.save.cups.fa_cup.results).toHaveLength(1);
    expect(memory.save.pendingEvents).toHaveLength(1);
    expect(memory.save.managerDNA.matches).toBe(1);
  });

  it('keeps a completed European week queue empty after an interrupted closeout', async () => {
    setup({ league:false, gw:5 });
    memory.save.cups = { ucl:{ status:'active', leaguePhase:{ matchday:0, opponents:[{ id:'b', name:'B' },{ id:'c', name:'C' }] }, results:[] } };
    memory.save.pendingEvents = [{ type:'ucl_md', cupId:'ucl', gw:5, matchday:1, opponentId:'b', opponentName:'B', userIsHome:true }];
    memory.failAdvanceSave = true;
    await expect(advanceOneFixture()).rejects.toThrow('interrupted before final week save');
    expect(memory.save.cups.ucl.leaguePhase.matchday).toBe(1);
    expect(await getNextMatchEvent()).toEqual({ type:'no_user_event', gw:5 });
    await advanceOneFixture();
    expect(simulateMatch).toHaveBeenCalledTimes(1);
    expect(memory.save.cups.ucl.results).toHaveLength(1);
    expect(memory.save.currentGameweek).toBe(6);
    expect(memory.players.filter(player => ['a','b'].includes(player.teamId)).every(player => player.appearances === 1)).toBe(true);
    expect(memory.save.managerDNA.matches).toBe(1);
  });

  it('resumes a matching Broadcast completion after checkpoint without applying its result twice', async () => {
    const event = await getNextMatchEvent();
    const result = { homeTeamId:'a', awayTeamId:'b', homeGoals:2, awayGoals:1, events:[], fitnessUpdates:[], seed:'broadcast-original' };
    memory.failProjection = true;
    await expect(advanceOneFixtureWithResult(result, event, true)).rejects.toThrow('interrupted before league projection');
    const resumed = await advanceOneFixtureWithResult(result, event, true);
    expect(resumed.singleResult).toEqual(result);
    expect(memory.fixtures[0]).toMatchObject({ homeGoals:2, awayGoals:1, projectionsApplied:true });
    expect(memory.standings.every(row => row.played === 1)).toBe(true);
    expect(memory.save.currentGameweek).toBe(2);
    expect(memory.save.managerDNA.matches).toBe(1);
    await advanceOneFixtureWithResult(result, event, true);
    expect(memory.save.currentGameweek).toBe(2);
  });

  it.each([true, false])('commits a Broadcast league result with a presentation venue hint (home=%s)', async userIsHome => {
    memory.save.userTeamId = userIsHome ? 'a' : 'b';
    const event = await getNextMatchEvent();
    expect(event).not.toHaveProperty('userIsHome');
    const result = { homeTeamId:'a', awayTeamId:'b', homeGoals:2, awayGoals:1, events:[], fitnessUpdates:[], seed:'broadcast-venue' };
    const displayedEvent = { ...event, userIsHome };
    await advanceOneFixtureWithResult(result, displayedEvent, userIsHome);
    expect(memory.fixtures[0]).toMatchObject({ homeGoals:2, awayGoals:1, projectionsApplied:true });
    expect(memory.save.currentGameweek).toBe(2);
    expect(memory.save.managerDNA.matches).toBe(1);
    await advanceOneFixtureWithResult(result, displayedEvent, userIsHome);
    expect(memory.save.currentGameweek).toBe(2);
    expect(memory.standings.every(row => row.played === 1)).toBe(true);
  });

  it('validates the actual fixture venue even when presentation supplies its own hint', async () => {
    const event = await getNextMatchEvent();
    const result = { homeTeamId:'a', awayTeamId:'b', homeGoals:2, awayGoals:1, events:[], fitnessUpdates:[] };
    await expect(advanceOneFixtureWithResult(result, { ...event, userIsHome:false }, false)).rejects.toThrow('MATCH_RESULT_PARTICIPANTS_CHANGED');
    expect(memory.fixtures.every(row => !row.played)).toBe(true);
  });

  it('uses AI plans while between jobs and rejects managerial Broadcast commits', async () => {
    memory.save.sacked = true;
    memory.save.formation = '3-4-3';
    memory.save.lineup = ['a_ST'];
    const event = await getNextMatchEvent();
    await expect(advanceOneFixtureWithResult({ homeTeamId:'a', awayTeamId:'b', homeGoals:1, awayGoals:0 }, event, true)).rejects.toThrow('MANAGER_NOT_EMPLOYED');
    await advanceOneFixture();
    const managedCall = simulateMatch.mock.calls.find(call => call[0].id === 'a');
    expect(managedCall[0]).not.toHaveProperty('tacticalPlan');
    expect(managedCall.slice(4, 10)).toEqual([undefined, undefined, null, null, undefined, undefined]);
    expect(memory.save.managerDNA).toBeUndefined();
    expect(memory.save.currentGameweek).toBe(2);
  });

  it('rejects a stale Broadcast event and a result for the wrong participants', async () => {
    const event = await getNextMatchEvent();
    const result = { homeTeamId:'a', awayTeamId:'b', homeGoals:1, awayGoals:0, events:[], fitnessUpdates:[] };
    await expect(advanceOneFixtureWithResult(result, { ...event, fixtureId:'different' }, true)).rejects.toThrow(/event|changed|stale/i);
    await expect(advanceOneFixtureWithResult({ ...result, awayTeamId:'d' }, event, true)).rejects.toThrow(/participant|team|result/i);
    expect(memory.fixtures.every(row => !row.played)).toBe(true);
  });

  it('does not resolve a second European matchday when the same week queue is rebuilt', () => {
    const cups = { ucl:{ status:'active', leaguePhase:{ matchday:1, opponents:[{ id:'b' },{ id:'c' }] } } };
    expect(buildPendingEvents(5, 'a', [], cups, memory.teams)).toEqual([]);
  });
});
