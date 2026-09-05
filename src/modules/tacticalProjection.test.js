import { describe, expect, it } from 'vitest';
import { simulateMatch } from './matchEngine.js';
import {
  attachTacticalShadow,
  projectLineupTacticalProfile,
  projectTacticalMatchup,
  tacticalActionUsage,
} from './tacticalProjection.js';
import { createUserTacticalPlan } from './tactics.js';

function player(id, position, attributes = {}, overrides = {}) {
  const base = position === 'GK' ? 76 : 74;
  return {
    id,
    name:id,
    position,
    age:25,
    attack:['ST','CF','RW','LW','CAM'].includes(position) ? base + 4 : base - 8,
    midfield:['CM','CDM','CAM','RM','LM','RW','LW'].includes(position) ? base + 3 : base - 6,
    defence:['CB','RB','LB','CDM'].includes(position) ? base + 4 : base - 15,
    goalkeeping:position === 'GK' ? base + 4 : 10,
    fitness:100,
    form:50,
    individualMorale:50,
    sharpness:50,
    injured:false,
    suspended:false,
    inSquad:true,
    traits:[],
    attributeProfile:{
      version:1,
      pace:74,
      shooting:72,
      passing:74,
      dribbling:74,
      defending:72,
      physical:74,
      ...attributes,
    },
    ...overrides,
  };
}

function squad(prefix, overrides = {}) {
  const positions = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RW','LW','ST','GK','CB','CM','RW','ST','LB','CDM'];
  return positions.map((position, index) => player(`${prefix}_${index}`, position, overrides[position] ?? {}));
}

function team(id, instructions = {}) {
  return {
    id,
    name:id,
    reputation:80,
    crest:'X',
    tacticalPlan:createUserTacticalPlan(instructions),
  };
}

function clonePlayers(players) {
  return players.map(subject => structuredClone(subject));
}

describe('T2 tactical shadow action causality', () => {
  it('makes pace matter for runs into space without directly improving shooting', () => {
    const fast = player('fast', 'ST', { pace:95, shooting:78, passing:76, dribbling:78, physical:76 });
    const slow = player('slow', 'ST', { pace:60, shooting:78, passing:76, dribbling:78, physical:76 });
    const fastProfile = projectLineupTacticalProfile({ players:[fast], rolesById:{ fast:'poacher' } });
    const slowProfile = projectLineupTacticalProfile({ players:[slow], rolesById:{ slow:'poacher' } });

    expect(fastProfile.actions.pass_into_space.execution).toBeGreaterThan(slowProfile.actions.pass_into_space.execution);
    expect(fastProfile.actions.shot.execution).toBe(slowProfile.actions.shot.execution);
  });

  it('makes shooting and dribbling independently valuable for their football actions', () => {
    const finisher = player('finisher', 'ST', { shooting:94, dribbling:68, pace:78, physical:78 });
    const carrier = player('carrier', 'RW', { shooting:68, dribbling:94, pace:78, physical:78 });
    const ordinaryForward = player('ordinary-forward', 'ST', { shooting:70, dribbling:68, pace:78, physical:78 });
    const ordinaryWinger = player('ordinary-winger', 'RW', { shooting:68, dribbling:70, pace:78, physical:78 });

    const finisherProfile = projectLineupTacticalProfile({ players:[finisher], rolesById:{ finisher:'poacher' } });
    const ordinaryForwardProfile = projectLineupTacticalProfile({ players:[ordinaryForward], rolesById:{ 'ordinary-forward':'poacher' } });
    const carrierProfile = projectLineupTacticalProfile({ players:[carrier], rolesById:{ carrier:'winger' } });
    const ordinaryWingerProfile = projectLineupTacticalProfile({ players:[ordinaryWinger], rolesById:{ 'ordinary-winger':'winger' } });

    expect(finisherProfile.actions.shot.execution).toBeGreaterThan(ordinaryForwardProfile.actions.shot.execution);
    expect(carrierProfile.actions.carry.execution).toBeGreaterThan(ordinaryWingerProfile.actions.carry.execution);
  });

  it('makes fast defensive cover materially better at recovering behind a high line', () => {
    const fastCover = player('fast-cover', 'CB', { pace:92, defending:84, physical:80 });
    const slowCover = player('slow-cover', 'CB', { pace:58, defending:84, physical:80 });
    const fastProfile = projectLineupTacticalProfile({ players:[fastCover], rolesById:{ 'fast-cover':'cover' } });
    const slowProfile = projectLineupTacticalProfile({ players:[slowCover], rolesById:{ 'slow-cover':'cover' } });

    expect(fastProfile.actions.recovery_defence.execution).toBeGreaterThan(slowProfile.actions.recovery_defence.execution);
  });

  it('changes route frequency from tactics rather than applying a universal quality boost', () => {
    const directCounter = tacticalActionUsage({ buildUp:'direct', tempo:'fast', transition:'counter', width:'wide' });
    const patient = tacticalActionUsage({ buildUp:'patient', tempo:'slow', transition:'hold_shape', width:'balanced' });

    expect(directCounter.direct_pass).toBeGreaterThan(patient.direct_pass);
    expect(directCounter.pass_into_space).toBeGreaterThan(patient.pass_into_space);
    expect(directCounter.wide_delivery).toBeGreaterThan(patient.wide_delivery);
    expect(patient.circulation).toBeGreaterThan(directCounter.circulation);
  });

  it('projects football-shaped counters for high lines, compact blocks and narrow defending', () => {
    const attackers = [
      player('creator', 'CM', { passing:90, dribbling:84 }, { tacticalRole:'deep_playmaker' }),
      player('runner', 'ST', { pace:94, shooting:82 }, { tacticalRole:'poacher' }),
      player('winger', 'RW', { pace:90, dribbling:90, passing:84 }, { tacticalRole:'winger' }),
    ];
    const defenders = [
      player('keeper', 'GK', {}, { tacticalRole:'goalkeeper' }),
      player('cover', 'CB', { pace:78, defending:84, physical:82 }, { tacticalRole:'cover' }),
      player('fullback', 'RB', { pace:80, defending:80, physical:77 }, { tacticalRole:'full_back' }),
    ];
    const attackingPlan = { buildUp:'direct', tempo:'fast', transition:'counter', width:'wide' };

    const versusHighNarrow = projectTacticalMatchup(
      { players:attackers, instructions:attackingPlan },
      { players:defenders, instructions:{ defensiveLine:'high', width:'narrow', defensiveApproach:'balanced' } },
    );
    const versusLowWide = projectTacticalMatchup(
      { players:attackers, instructions:attackingPlan },
      { players:defenders, instructions:{ defensiveLine:'low', width:'wide', defensiveApproach:'compact' } },
    );

    expect(versusHighNarrow.home.actions.pass_into_space.contextEdge).toBeGreaterThan(versusLowWide.home.actions.pass_into_space.contextEdge);
    expect(versusHighNarrow.home.actions.wide_delivery.contextEdge).toBeGreaterThan(versusLowWide.home.actions.wide_delivery.contextEdge);
    expect(versusLowWide.home.actions.carry.contextEdge).toBeLessThan(versusHighNarrow.home.actions.carry.contextEdge);
  });
});

describe('T2 shadow authority boundary', () => {
  it('does not mutate inputs or alter a seeded authoritative match result', () => {
    const homeTeam = team('home', { buildUp:'direct', transition:'counter', tempo:'fast' });
    const awayTeam = team('away', { defensiveLine:'high', pressing:'aggressive' });
    const homePlayers = squad('home');
    const awayPlayers = squad('away');

    const authoritative = simulateMatch(
      homeTeam,
      awayTeam,
      clonePlayers(homePlayers),
      clonePlayers(awayPlayers),
      '4-3-3',
      '4-3-3',
      null,
      null,
      'possession',
      'balanced',
      { seed:'t2-shadow-parity' },
    );
    const beforeResult = structuredClone(authoritative);
    const beforeHome = structuredClone(homePlayers);
    const beforeAway = structuredClone(awayPlayers);

    const wrapped = attachTacticalShadow(
      authoritative,
      { players:homePlayers, instructions:homeTeam.tacticalPlan },
      { players:awayPlayers, instructions:awayTeam.tacticalPlan },
    );

    expect(wrapped.authoritativeResult).toBe(authoritative);
    expect(authoritative).toEqual(beforeResult);
    expect(homePlayers).toEqual(beforeHome);
    expect(awayPlayers).toEqual(beforeAway);
    expect(wrapped.shadow.home.actions.pass_into_space).toBeTruthy();

    const replay = simulateMatch(
      homeTeam,
      awayTeam,
      clonePlayers(homePlayers),
      clonePlayers(awayPlayers),
      '4-3-3',
      '4-3-3',
      null,
      null,
      'possession',
      'balanced',
      { seed:'t2-shadow-parity' },
    );
    expect(replay).toEqual(beforeResult);
  });
});
