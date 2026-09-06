import { describe, expect, it } from 'vitest';
import {
  SHOOTOUT_PACKET_FIELDS,
  SHOOTOUT_STATE_VERSION,
  assertSupportedShootoutState,
  buildShootoutPlayableMoment,
  commitShootoutKick,
  createShootoutState,
  getNextShootoutKick,
  getShootoutScore,
  resolveAutomaticShootoutKick,
  runAutomaticShootout,
  shootoutSummary,
} from './matchShootout.js';

function player(id, position, rating = 80, overrides = {}) {
  return {
    id,
    name:id,
    teamId:overrides.teamId ?? null,
    position,
    matchPosition:overrides.matchPosition ?? position,
    attack:rating,
    midfield:rating,
    defence:rating,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:95,
    form:50,
    individualMorale:50,
    sharpness:50,
    traits:[],
    positionSuitability:{ [position]:1 },
    attributeProfile:{
      version:1,
      pace:rating,
      shooting:rating,
      passing:rating,
      dribbling:rating,
      defending:rating,
      physical:rating,
      ...(overrides.attributeProfile ?? {}),
    },
    ...overrides,
  };
}

function squad(prefix, ratings = [91, 88, 84, 80, 76, 72]) {
  return [
    player(`${prefix}-gk`, 'GK', 84),
    ...ratings.map((rating, index) => player(`${prefix}-p${index + 1}`, index === 0 ? 'ST' : index < 3 ? 'CM' : 'CB', rating)),
  ];
}

function state(overrides = {}) {
  return createShootoutState({
    seed:'phase-7-seed',
    homeTeamId:'home',
    awayTeamId:'away',
    homePlayers:squad('h'),
    awayPlayers:squad('a'),
    firstTeamId:'home',
    ...overrides,
  });
}

function forcedShot(goal) {
  return {
    setPieceType:'penalty',
    finish:goal ? 'goal' : 'missed',
    onTarget:goal,
    goal,
    shooting:80,
    pressure:0,
    goalkeeping:80,
    restart:goal ? 'kickoff' : 'goal_kick',
    presentation:{
      target:{ x:goal ? .62 : 1.08, y:.54, power:.76, executionQuality:.8 },
      blockerId:null,
      keeper:null,
      contact:goal ? 'goal' : 'miss',
    },
  };
}

function forceNext(current, goal, intent = null) {
  const kick = getNextShootoutKick(current);
  const committed = commitShootoutKick(current, { kick, shot:forcedShot(goal), intent });
  return { ...committed, kick };
}

function forceSequence(initial, goals) {
  let current = initial;
  const receipts = [];
  for (const goal of goals) {
    const step = forceNext(current, goal);
    current = step.state;
    receipts.push(step.receipt);
    if (current.status === 'complete') break;
  }
  return { state:current, receipts };
}

describe('Phase 7 authoritative shootout domain', () => {
  it('creates a versioned deterministic state with ranked outfield takers and an explicit goalkeeper', () => {
    const created = state();
    expect(created.version).toBe(SHOOTOUT_STATE_VERSION);
    expect(created.status).toBe('active');
    expect(created.phase).toBe('normal');
    expect(created.kicks).toEqual([]);
    expect(created.sides[0].goalkeeperId).toBe('h-gk');
    expect(created.sides[0].takerIds[0]).toBe('h-p1');
    expect(created.sides[0].takerIds).not.toContain('h-gk');
    expect(assertSupportedShootoutState(created)).toBe(created);
  });

  it('deduplicates eligible participant IDs and rejects a side without a goalkeeper or outfield taker', () => {
    const duplicate = player('same', 'ST', 88);
    const created = state({
      homePlayers:[player('h-gk', 'GK', 84), duplicate, { ...duplicate }],
    });
    expect(created.sides[0].takerIds).toEqual(['same']);

    expect(() => state({ homePlayers:[player('only-outfield', 'ST', 90)] }))
      .toThrow('SHOOTOUT_GOALKEEPER_REQUIRED:home');
    expect(() => state({ homePlayers:[player('only-keeper', 'GK', 90)] }))
      .toThrow('SHOOTOUT_TAKERS_REQUIRED:home');
  });

  it('derives the same immutable next kick and fixed 14-field packet from the same state', () => {
    const created = state();
    const left = getNextShootoutKick(created);
    const right = getNextShootoutKick(JSON.parse(JSON.stringify(created)));
    expect(right).toEqual(left);
    expect(left.index).toBe(0);
    expect(left.teamId).toBe('home');
    expect(left.takerId).toBe('h-p1');
    expect(left.goalkeeperId).toBe('a-gk');
    expect(Object.keys(left.packet).sort()).toEqual(['version', ...SHOOTOUT_PACKET_FIELDS].sort());
    expect(SHOOTOUT_PACKET_FIELDS.every(field => left.packet[field] > 0 && left.packet[field] < 1)).toBe(true);
  });

  it('alternates teams through the normal five and cycles takers only after the eligible order is exhausted', () => {
    let current = state({
      homePlayers:[player('h-gk', 'GK', 84), player('h-a', 'ST', 90), player('h-b', 'CM', 80)],
      awayPlayers:[player('a-gk', 'GK', 84), player('a-a', 'ST', 90), player('a-b', 'CM', 80)],
    });
    const seen = [];
    for (let index = 0; index < 10; index += 1) {
      const kick = getNextShootoutKick(current);
      seen.push([kick.teamId, kick.takerId, kick.phase, kick.round]);
      current = forceNext(current, true).state;
    }

    expect(seen.map(row => row[0])).toEqual(['home','away','home','away','home','away','home','away','home','away']);
    expect(seen.filter(row => row[0] === 'home').map(row => row[1])).toEqual(['h-a','h-b','h-a','h-b','h-a']);
    expect(current.phase).toBe('sudden_death');
    const eleventh = getNextShootoutKick(current);
    expect(eleventh.teamId).toBe('home');
    expect(eleventh.takerId).toBe('h-b');
    expect(eleventh.phase).toBe('sudden_death');
    expect(eleventh.round).toBe(1);
  });

  it('ends the normal phase as soon as the trailing side is mathematically unable to catch up', () => {
    const result = forceSequence(state(), [true, false, true, false, true, false]);
    expect(result.state.status).toBe('complete');
    expect(result.state.winnerTeamId).toBe('home');
    expect(result.state.kicks).toHaveLength(6);
    expect(getShootoutScore(result.state)).toEqual({ home:3, away:0 });
    expect(getNextShootoutKick(result.state)).toBeNull();
  });

  it('can conclude after the first team takes its fifth normal kick when the reply cannot restore equality', () => {
    const result = forceSequence(state(), [true,true, true,false, true,true, false,false, true]);
    expect(result.state.status).toBe('complete');
    expect(result.state.kicks).toHaveLength(9);
    expect(result.state.winnerTeamId).toBe('home');
    expect(getShootoutScore(result.state)).toEqual({ home:4, away:2 });
  });

  it('never concludes sudden death after only the first kick of a pair', () => {
    let current = forceSequence(state(), Array(10).fill(true)).state;
    expect(current.phase).toBe('sudden_death');

    current = forceNext(current, true).state;
    expect(current.status).toBe('active');
    expect(current.phase).toBe('sudden_death');
    expect(getShootoutScore(current)).toEqual({ home:6, away:5 });

    current = forceNext(current, false).state;
    expect(current.status).toBe('complete');
    expect(current.winnerTeamId).toBe('home');
    expect(current.kicks).toHaveLength(12);
  });

  it('continues sudden death after an equal pair and decides immediately after a later unequal pair', () => {
    let current = forceSequence(state(), Array(10).fill(true)).state;
    current = forceNext(current, false).state;
    expect(current.status).toBe('active');
    current = forceNext(current, false).state;
    expect(current.status).toBe('active');
    expect(getShootoutScore(current)).toEqual({ home:5, away:5 });

    current = forceNext(current, true).state;
    expect(current.status).toBe('active');
    current = forceNext(current, false).state;
    expect(current.status).toBe('complete');
    expect(current.winnerTeamId).toBe('home');
    expect(current.kicks.at(-1).round).toBe(2);
  });

  it('commits a kick once and treats an identical replay as idempotent', () => {
    const created = state();
    const kick = getNextShootoutKick(created);
    const shot = forcedShot(true);
    const intent = { attack:{ aimX:.6, aimY:.55, power:.76, timing:.82 } };
    const first = commitShootoutKick(created, { kick, shot, intent });
    const replay = commitShootoutKick(first.state, { kick, shot, intent });

    expect(first.idempotent).toBe(false);
    expect(replay.idempotent).toBe(true);
    expect(replay.state.kicks).toHaveLength(1);
    expect(replay.receipt.kickId).toBe(first.receipt.kickId);

    expect(() => commitShootoutKick(first.state, {
      kick,
      shot,
      intent:{ attack:{ aimX:-.6, aimY:.55, power:.76, timing:.82 } },
    })).toThrow('SHOOTOUT_KICK_ALREADY_COMMITTED_DIFFERENT_INTENT');
    expect(() => commitShootoutKick(first.state, { kick, shot:forcedShot(false), intent }))
      .toThrow('SHOOTOUT_KICK_ALREADY_COMMITTED_DIFFERENT_RESULT');
  });

  it('rejects corrupted kick order and derived winner state instead of silently repairing a saved shootout', () => {
    const committed = forceNext(state(), true).state;
    const wrongTeam = JSON.parse(JSON.stringify(committed));
    wrongTeam.kicks[0].teamId = 'away';
    expect(() => assertSupportedShootoutState(wrongTeam)).toThrow('SHOOTOUT_KICK_ORDER_CORRUPT');

    const fakeWinner = JSON.parse(JSON.stringify(committed));
    fakeWinner.status = 'complete';
    fakeWinner.phase = 'complete';
    fakeWinner.winnerTeamId = 'home';
    fakeWinner.loserTeamId = 'away';
    expect(() => assertSupportedShootoutState(fakeWinner)).toThrow('SHOOTOUT_DERIVED_STATE_CORRUPT');
  });

  it('survives JSON save/resume without changing the next kick or packet', () => {
    let current = state();
    current = forceNext(current, true).state;
    current = forceNext(current, false).state;
    const before = getNextShootoutKick(current);
    const restored = JSON.parse(JSON.stringify(current));
    expect(assertSupportedShootoutState(restored)).toBe(restored);
    expect(getNextShootoutKick(restored)).toEqual(before);
  });

  it('runs automatic shootouts deterministically and every committed kick is an existing penalty-resolver result', () => {
    const left = runAutomaticShootout(state());
    const right = runAutomaticShootout(state());
    expect(right).toEqual(left);
    expect(left.status).toBe('complete');
    expect(left.winnerTeamId === 'home' || left.winnerTeamId === 'away').toBe(true);
    expect(left.kicks.length).toBeGreaterThanOrEqual(6);
    for (const receipt of left.kicks) {
      expect(receipt.shot.setPieceType).toBe('penalty');
      expect(['goal','saved','missed']).toContain(receipt.finish);
    }
  });

  it('resolves one automatic kick without consuming or relabelling the regulation match RNG packet', () => {
    const created = state();
    const step = resolveAutomaticShootoutKick(created);
    expect(step.state.kicks).toHaveLength(1);
    expect(step.kick.packet.version).toBe(1);
    expect(step.receipt.shot.setPieceType).toBe('penalty');
    expect(created.kicks).toEqual([]);
  });

  it('builds attack and goalkeeper playable moments from the exact same pending kick', () => {
    const created = state();
    const attack = buildShootoutPlayableMoment(created, 'home');
    const keeper = buildShootoutPlayableMoment(created, 'away');
    const outside = buildShootoutPlayableMoment(created, 'other');

    expect(attack.mode).toBe('attack');
    expect(keeper.mode).toBe('goalkeeper');
    expect(attack.kickId).toBe(keeper.kickId);
    expect(attack.setPiece.kind).toBe('penalty');
    expect(attack.geometry.staging.variant).toBe('penalty');
    expect(outside).toBeNull();
  });

  it('produces a compact completed summary without persisted player snapshots or penalty presentation payloads', () => {
    const complete = forceSequence(state(), [true,false, true,false, true,false]).state;
    const summary = shootoutSummary(complete);
    expect(summary.status).toBe('complete');
    expect(summary.winnerTeamId).toBe('home');
    expect(summary.kicks).toHaveLength(6);
    expect(summary).not.toHaveProperty('sides');
    expect(summary.kicks[0]).not.toHaveProperty('shot');
    expect(summary.kicks[0]).not.toHaveProperty('intent');
  });
});
