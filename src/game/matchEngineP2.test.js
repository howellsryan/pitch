import { describe, expect, it } from 'vitest';
import {
  buildLiveMatchState,
  createSeededRng,
  finaliseLiveMatch,
  simulateMatch,
  simulateMatchSegment,
} from '../modules/matchEngine.js';
import { createUserTacticalPlan } from '../modules/tactics.js';

function makePlayer(id, position, rating = 78, age = 26) {
  return {
    id,
    name:id,
    position,
    age,
    attack:position === 'ST' || position === 'RW' || position === 'LW' ? rating : Math.max(35, rating - 10),
    midfield:['CM','CDM','CAM','RW','LW'].includes(position) ? rating : Math.max(35, rating - 8),
    defence:['CB','RB','LB','CDM'].includes(position) ? rating : Math.max(25, rating - 18),
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:90,
    injured:false,
    suspended:false,
    inSquad:true,
    appearances:4,
    goals:position === 'ST' ? 2 : 0,
    assists:position === 'CAM' ? 2 : 0,
  };
}

function makeSquad(prefix, rating = 78) {
  const positions = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RW','LW','ST','GK','CB','CM','RW','ST','LB','CDM'];
  return positions.map((position, index) => makePlayer(`${prefix}_${index}`, position, rating + (index % 3) - 1, 22 + index % 10));
}

function cloneSquad(players) { return players.map(player => ({ ...player })); }

function managedTeam(id, reputation = 80) {
  return {
    id,
    name:id,
    reputation,
    crest:'X',
    tacticalPlan:createUserTacticalPlan({
      buildUp:'patient', tempo:'balanced', defensiveLine:'mid', pressing:'standard', width:'wide',
      transition:'hold_shape', chanceCreation:'work_ball', defensiveApproach:'balanced', setPieces:'balanced',
    }),
  };
}

describe('Match Engine 2.0 seeded RNG', () => {
  it('repeats the same random stream for the same seed', () => {
    const a = createSeededRng('fixture-42');
    const b = createSeededRng('fixture-42');
    const c = createSeededRng('fixture-43');
    const seqA = Array.from({ length:8 }, () => a());
    const seqB = Array.from({ length:8 }, () => b());
    const seqC = Array.from({ length:8 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it.each([1, 7, 10, 30, 120])('produces the exact same authoritative match with %i-phase broadcast segments', (segmentSize) => {
    const homeTeam = managedTeam('home');
    const awayTeam = { id:'away', name:'away', reputation:82, crest:'Y' };
    const homePlayers = makeSquad('h', 80);
    const awayPlayers = makeSquad('a', 81);

    const quick = simulateMatch(
      homeTeam, awayTeam, cloneSquad(homePlayers), cloneSquad(awayPlayers),
      '4-3-3', '4-2-3-1', null, null, 'possession', 'balanced', { seed:'parity-fixture' },
    );

    let state = buildLiveMatchState(
      homeTeam, awayTeam, cloneSquad(homePlayers), cloneSquad(awayPlayers),
      '4-3-3', '4-2-3-1', null, null, 'possession', 'balanced', { seed:'parity-fixture' },
    );
    const events = [];
    for (let start = 1; start <= 120; start += segmentSize) {
      const segment = simulateMatchSegment(homeTeam, awayTeam, state, start, Math.min(120, start + segmentSize - 1), homeTeam.id);
      state = segment.updatedState;
      events.push(...segment.segEvents);
    }
    const watched = finaliseLiveMatch(homeTeam, awayTeam, state, events);

    expect({
      homeGoals:watched.homeGoals,
      awayGoals:watched.awayGoals,
      events:watched.events,
      stats:watched.stats,
      fitnessUpdates:watched.fitnessUpdates,
      seed:watched.seed,
      homeFormation:watched.homeFormation,
      awayFormation:watched.awayFormation,
      homeTactics:watched.homeTactics,
      awayTactics:watched.awayTactics,
    }).toEqual({
      homeGoals:quick.homeGoals,
      awayGoals:quick.awayGoals,
      events:quick.events,
      stats:quick.stats,
      fitnessUpdates:quick.fitnessUpdates,
      seed:quick.seed,
      homeFormation:quick.homeFormation,
      awayFormation:quick.awayFormation,
      homeTactics:quick.homeTactics,
      awayTactics:quick.awayTactics,
    });
  });
});

describe('Match Engine 2.0 statistical regression envelope', () => {
  it('keeps goals, home advantage, cards and possession within broad football-like bounds', () => {
    const homeTeam = managedTeam('baseline_home', 78);
    const awayTeam = managedTeam('baseline_away', 78);
    const homePlayers = makeSquad('bh', 77);
    const awayPlayers = makeSquad('ba', 77);
    let homeGoals = 0;
    let awayGoals = 0;
    let yellows = 0;
    let possession = 0;
    const sample = 600;

    for (let index = 0; index < sample; index++) {
      const result = simulateMatch(
        homeTeam, awayTeam, cloneSquad(homePlayers), cloneSquad(awayPlayers),
        '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed:`baseline-${index}` },
      );
      homeGoals += result.homeGoals;
      awayGoals += result.awayGoals;
      yellows += result.stats.yellowCards.home + result.stats.yellowCards.away;
      possession += result.stats.possession.home;
    }

    const avgGoals = (homeGoals + awayGoals) / sample;
    const avgYellows = yellows / sample;
    const avgHomePossession = possession / sample;
    expect(avgGoals).toBeGreaterThan(1.2);
    expect(avgGoals).toBeLessThan(4.5);
    expect(homeGoals).toBeGreaterThanOrEqual(awayGoals);
    expect(avgYellows).toBeGreaterThan(.1);
    expect(avgYellows).toBeLessThan(1.8);
    expect(avgHomePossession).toBeGreaterThan(45);
    expect(avgHomePossession).toBeLessThan(55);
  });
});
