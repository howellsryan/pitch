import { describe, expect, it } from 'vitest';
import {
  MATCH_ENGINE_VERSION,
  MATCH_PHASES,
  buildLiveMatchState,
  finaliseLiveMatch,
  simulateMatch,
  simulateMatchSegment,
} from '../modules/matchEngine.js';
import {
  MATCH_ACTION_LEDGER_VERSION,
  MATCH_RNG_PACKET_VERSION,
  deriveStatsFromActionLedger,
} from '../modules/matchActionResolver.js';
import { createUserTacticalPlan } from '../modules/tactics.js';

const POSITIONS = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RW','LW','ST','GK','CB','CM','RW','ST','LB','CDM'];

function makePlayer(id, position, rating = 78, overrides = {}) {
  const attacking = ['ST','CF','RW','LW','CAM'].includes(position);
  const midfield = ['CM','CDM','CAM','RM','LM','RW','LW'].includes(position);
  const defending = ['CB','RB','LB','CDM'].includes(position);
  return {
    id,
    name:id,
    position,
    age:25,
    attack:attacking ? rating : rating - 10,
    midfield:midfield ? rating : rating - 8,
    defence:defending ? rating : rating - 18,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:92,
    form:50,
    individualMorale:50,
    sharpness:50,
    traits:[],
    injured:false,
    suspended:false,
    inSquad:true,
    appearances:3,
    goals:0,
    assists:0,
    positionSuitability:{ [position]:1 },
    attributeProfile:{
      version:1,
      pace:rating,
      shooting:attacking ? rating : rating - 12,
      passing:midfield || attacking ? rating : rating - 8,
      dribbling:attacking || midfield ? rating : rating - 8,
      defending:defending ? rating : rating - 18,
      physical:rating,
    },
    ...overrides,
  };
}

function makeSquad(prefix, rating = 78, strikerProfile = {}) {
  return POSITIONS.map((position, index) => makePlayer(
    `${prefix}_${index}`,
    position,
    rating + (index % 3) - 1,
    position === 'ST' && index === 10
      ? { attributeProfile:{ ...makePlayer('tmp','ST',rating).attributeProfile, ...strikerProfile } }
      : {},
  ));
}

function team(id, instructions = {}) {
  return {
    id,
    name:id,
    crest:'X',
    reputation:80,
    tacticalPlan:createUserTacticalPlan(instructions),
  };
}

function clonePlayers(players) {
  return players.map(player => structuredClone(player));
}

function finalShape(result) {
  return {
    matchEngineVersion:result.matchEngineVersion,
    actionResolverVersion:result.actionResolverVersion,
    actionLedgerVersion:result.actionLedgerVersion,
    rngPacketVersion:result.rngPacketVersion,
    homeGoals:result.homeGoals,
    awayGoals:result.awayGoals,
    events:result.events,
    stats:result.stats,
    fitnessUpdates:result.fitnessUpdates,
    seed:result.seed,
    homeFormation:result.homeFormation,
    awayFormation:result.awayFormation,
    homeTactics:result.homeTactics,
    awayTactics:result.awayTactics,
  };
}

describe('T3 authoritative action ledger', () => {
  it('owns one compact football record per phase and derives score/core stats from it', () => {
    const home = team('home', { buildUp:'direct', tempo:'fast', transition:'counter' });
    const away = team('away', { defensiveLine:'high', pressing:'aggressive' });
    const initial = buildLiveMatchState(
      home, away, makeSquad('h'), makeSquad('a'),
      '4-3-3', '4-3-3', null, null, 'balanced', 'balanced',
      { seed:'t3-ledger-contract' },
    );

    expect(initial.matchEngineVersion).toBe(MATCH_ENGINE_VERSION);
    expect(initial.actionLedgerVersion).toBe(MATCH_ACTION_LEDGER_VERSION);
    expect(initial.rngPacketVersion).toBe(MATCH_RNG_PACKET_VERSION);
    expect(initial.actionLedger).toEqual([]);

    const segment = simulateMatchSegment(home, away, initial, 1, MATCH_PHASES);
    const state = segment.updatedState;
    expect(state.actionLedger).toHaveLength(MATCH_PHASES);
    expect(state.actionLedger.map(record => record.phase)).toEqual(Array.from({ length:MATCH_PHASES }, (_, index) => index + 1));
    expect(state.actionLedger.every(record => record.version === MATCH_ACTION_LEDGER_VERSION)).toBe(true);

    const ledgerHomeGoals = state.actionLedger.filter(record => record.teamId === home.id && record.finish === 'goal').length;
    const ledgerAwayGoals = state.actionLedger.filter(record => record.teamId === away.id && record.finish === 'goal').length;
    expect(state.hGoals).toBe(ledgerHomeGoals);
    expect(state.aGoals).toBe(ledgerAwayGoals);

    const result = finaliseLiveMatch(home, away, state, segment.segEvents);
    expect(result.homeGoals).toBe(ledgerHomeGoals);
    expect(result.awayGoals).toBe(ledgerAwayGoals);
    expect(result.stats).toEqual(deriveStatsFromActionLedger({
      ledger:state.actionLedger,
      homeTeamId:home.id,
      awayTeamId:away.id,
      events:result.events,
    }));
    expect(result).not.toHaveProperty('actionLedger');
  });

  it.each([1, 7, 10, 30, 120])('keeps Quick Sim and %i-phase segmented Watch exactly identical', (segmentSize) => {
    const home = team('home', { buildUp:'direct', transition:'counter', tempo:'fast', width:'wide' });
    const away = team('away', { defensiveLine:'high', pressing:'aggressive', defensiveApproach:'front_foot' });
    const homePlayers = makeSquad('h', 80);
    const awayPlayers = makeSquad('a', 80);

    const quick = simulateMatch(
      home, away, clonePlayers(homePlayers), clonePlayers(awayPlayers),
      '4-3-3', '4-3-3', null, null, 'balanced', 'balanced',
      { seed:'t3-quick-watch-parity' },
    );

    let state = buildLiveMatchState(
      home, away, clonePlayers(homePlayers), clonePlayers(awayPlayers),
      '4-3-3', '4-3-3', null, null, 'balanced', 'balanced',
      { seed:'t3-quick-watch-parity' },
    );
    const events = [];
    for (let start = 1; start <= MATCH_PHASES; start += segmentSize) {
      const part = simulateMatchSegment(home, away, state, start, Math.min(MATCH_PHASES, start + segmentSize - 1));
      state = part.updatedState;
      events.push(...part.segEvents);
    }
    const watched = finaliseLiveMatch(home, away, state, events);

    expect(finalShape(watched)).toEqual(finalShape(quick));
    expect(state.actionLedger).toHaveLength(MATCH_PHASES);
  });

  it('keeps the public event stream compatible while the richer action ledger stays internal', () => {
    const home = team('home');
    const away = team('away');
    const initial = buildLiveMatchState(
      home, away, makeSquad('h'), makeSquad('a'),
      '4-3-3', '4-3-3', null, null, 'balanced', 'balanced',
      { seed:'t3-event-contract' },
    );
    const { segEvents, updatedState } = simulateMatchSegment(home, away, initial, 1, MATCH_PHASES);
    const legacyTypes = new Set(['goal','yellow','injury','sub']);

    expect(segEvents.every(event => legacyTypes.has(event.type))).toBe(true);
    expect(updatedState.actionLedger.some(record => record.route && record.outcome)).toBe(true);
  });

  it('makes detailed pace change authoritative chance creation with identical headline ratings and seed packets', () => {
    const home = team('home', { buildUp:'direct', tempo:'fast', transition:'counter' });
    const away = team('away', { defensiveLine:'high', defensiveApproach:'front_foot' });
    let fastXG = 0;
    let slowXG = 0;

    for (let index = 0; index < 40; index += 1) {
      const seed = `t3-pace-pair-${index}`;
      const fast = simulateMatch(
        home, away,
        makeSquad('h', 78, { pace:96, shooting:80, passing:76, dribbling:78, physical:78 }),
        makeSquad('a', 78),
        '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed },
      );
      const slow = simulateMatch(
        home, away,
        makeSquad('h', 78, { pace:54, shooting:80, passing:76, dribbling:78, physical:78 }),
        makeSquad('a', 78),
        '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed },
      );
      fastXG += fast.stats.xG.home;
      slowXG += slow.stats.xG.home;
    }

    expect(fastXG).toBeGreaterThan(slowXG);
  });
});
