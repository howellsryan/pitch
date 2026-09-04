import { describe, expect, it } from 'vitest';
import {
  MATCH_ACTION_LEDGER_VERSION,
  MATCH_RNG_PACKET_FIELDS,
  actionContestProbability,
  deriveStatsFromActionLedger,
  fixedPhaseRngPacket,
  resolveAuthoritativePhase,
  resolveShotOutcome,
} from './matchActionResolver.js';

function player(id, position, profile = {}, overrides = {}) {
  return {
    id,
    name:id,
    position,
    matchPosition:position,
    age:25,
    attack:76,
    midfield:76,
    defence:76,
    goalkeeping:position === 'GK' ? 78 : 10,
    fitness:100,
    form:50,
    individualMorale:50,
    sharpness:50,
    traits:[],
    positionSuitability:{ [position]:1 },
    attributeProfile:{
      version:1,
      pace:76,
      shooting:76,
      passing:76,
      dribbling:76,
      defending:76,
      physical:76,
      ...profile,
    },
    ...overrides,
  };
}

function packet(overrides = {}) {
  return {
    version:1,
    possession:.4,
    route:.55,
    actor:.40,
    target:.20,
    defender:.20,
    execution:.20,
    outcome:.60,
    chance:.01,
    shooter:.10,
    shot:.20,
    finish:.10,
    assist:.20,
    discipline:.80,
    injury:.80,
    ...overrides,
  };
}

function attackingUnit(runnerPace = 76, wingerDribbling = 76) {
  return [
    player('runner', 'ST', { pace:runnerPace, shooting:82 }, { tacticalRole:'poacher' }),
    player('passer', 'CM', { passing:90 }, { tacticalRole:'deep_playmaker' }),
    player('winger', 'RW', { dribbling:wingerDribbling, pace:84 }, { tacticalRole:'winger' }),
  ];
}

function defendingUnit(coverPace = 76) {
  return [
    player('keeper', 'GK', {}, { tacticalRole:'goalkeeper', goalkeeping:80 }),
    player('cover', 'CB', { defending:84, pace:coverPace, physical:82 }, { tacticalRole:'cover' }),
    player('fullback', 'RB', { defending:80, pace:80 }, { tacticalRole:'full_back' }),
  ];
}

function roles(players) {
  return Object.fromEntries(players.map(subject => [subject.id, subject.tacticalRole]));
}

function phase(players, defenders, rngPacket = packet(), instructions = {}, opponentInstructions = {}) {
  return resolveAuthoritativePhase({
    phase:12,
    minute:9,
    teamId:'home',
    opponentTeamId:'away',
    attackers:players,
    defenders,
    rolesById:roles(players),
    opponentRolesById:roles(defenders),
    instructions,
    opponentInstructions,
    packet:rngPacket,
    isHome:true,
  });
}

describe('T3 fixed RNG packet', () => {
  it('always consumes exactly the versioned packet width', () => {
    let calls = 0;
    const values = Array.from({ length:MATCH_RNG_PACKET_FIELDS.length }, (_, index) => (index + 1) / 100);
    const rngPacket = fixedPhaseRngPacket(() => values[calls++]);

    expect(calls).toBe(MATCH_RNG_PACKET_FIELDS.length);
    expect(Object.keys(rngPacket)).toEqual(['version', ...MATCH_RNG_PACKET_FIELDS]);
    expect(rngPacket.route).toBe(values[1]);
    expect(rngPacket.injury).toBe(values.at(-1));
  });

  it('uses a bounded sigmoid rather than treating ratings as percentages', () => {
    expect(actionContestProbability(0)).toBeGreaterThan(.5);
    expect(actionContestProbability(100)).toBeLessThanOrEqual(.85);
    expect(actionContestProbability(-100)).toBeGreaterThanOrEqual(.18);
    expect(actionContestProbability(15)).toBeGreaterThan(actionContestProbability(-15));
  });
});

describe('T3 detailed attribute causality', () => {
  it('makes a fast runner improve pass-into-space execution without changing the passer', () => {
    const defenders = defendingUnit(76);
    const fast = phase(attackingUnit(95), defenders);
    const slow = phase(attackingUnit(58), defenders);

    expect(fast.record.route).toBe('pass_into_space');
    expect(slow.record.route).toBe('pass_into_space');
    expect(fast.record.actorId).toBe('passer');
    expect(fast.record.targetId).toBe('runner');
    expect(fast.record.execution).toBeGreaterThan(slow.record.execution);
    expect(fast.record.successChance).toBeGreaterThan(slow.record.successChance);
  });

  it('makes fast defensive cover reduce the same pass-into-space edge', () => {
    const attackers = attackingUnit(92);
    const slowCover = phase(attackers, defendingUnit(55));
    const fastCover = phase(attackers, defendingUnit(94));

    expect(fastCover.record.counter).toBeGreaterThan(slowCover.record.counter);
    expect(fastCover.record.successChance).toBeLessThan(slowCover.record.successChance);
  });

  it('makes shooting affect finishing after chance creation rather than route selection', () => {
    const defender = player('defender', 'CB', { defending:80, physical:80 }, { tacticalRole:'cover' });
    const keepers = [player('keeper', 'GK', {}, { goalkeeping:80, tacticalRole:'goalkeeper' })];
    const elite = player('elite', 'ST', { shooting:94, physical:78 }, { tacticalRole:'poacher' });
    const average = player('average', 'ST', { shooting:70, physical:78 }, { tacticalRole:'poacher' });
    const shotPacket = packet({ shot:.12, finish:.22 });

    const eliteShot = resolveShotOutcome({ shooter:elite, defender, defenders:[defender, ...keepers], xg:.22, packet:shotPacket });
    const averageShot = resolveShotOutcome({ shooter:average, defender, defenders:[defender, ...keepers], xg:.22, packet:shotPacket });

    expect(eliteShot.shooting).toBeGreaterThan(averageShot.shooting);
    expect(eliteShot.goalChance).toBeGreaterThan(averageShot.goalChance);
  });

  it('routes more carries through the winger and rewards dribbling when carry is selected', () => {
    const defenders = defendingUnit();
    const strong = phase(attackingUnit(76, 94), defenders, packet({ route:.78, actor:.85 }));
    const weak = phase(attackingUnit(76, 60), defenders, packet({ route:.78, actor:.85 }));

    expect(strong.record.route).toBe('carry');
    expect(strong.record.actorId).toBe('winger');
    expect(strong.record.execution).toBeGreaterThan(weak.record.execution);
  });
});

describe('T3 ledger-derived stats', () => {
  it('derives shots, xG, possession and corners from the ledger rather than synthesising them', () => {
    const ledger = [
      { version:MATCH_ACTION_LEDGER_VERSION, phase:1, teamId:'home', outcome:'retain' },
      { version:MATCH_ACTION_LEDGER_VERSION, phase:2, teamId:'home', outcome:'chance_created', shotId:'h9', onTarget:true, finish:'goal', xg:.31 },
      { version:MATCH_ACTION_LEDGER_VERSION, phase:3, teamId:'away', outcome:'corner_won', cornerWon:true },
      { version:MATCH_ACTION_LEDGER_VERSION, phase:4, teamId:'away', outcome:'chance_created', shotId:'a9', onTarget:false, finish:'missed', xg:.12 },
    ];
    const events = [
      { type:'goal', teamId:'home' },
      { type:'yellow', teamId:'away' },
      { type:'sub', teamId:'home' },
    ];
    const stats = deriveStatsFromActionLedger({ ledger, homeTeamId:'home', awayTeamId:'away', events });

    expect(stats.possession).toEqual({ home:50, away:50 });
    expect(stats.shots).toEqual({ home:1, away:1 });
    expect(stats.shotsOnTarget).toEqual({ home:1, away:0 });
    expect(stats.xG).toEqual({ home:.31, away:.12 });
    expect(stats.corners).toEqual({ home:0, away:1 });
    expect(stats.yellowCards).toEqual({ home:0, away:1 });
    expect(stats.substitutions).toEqual({ home:1, away:0 });
  });
});
