import { describe, expect, it } from 'vitest';
import {
  buildLiveMatchState,
  resumePlayableMatchPhase,
  simulateMatchSegment,
} from './matchEngine.js';
import { createUserTacticalPlan } from './tactics.js';

const POSITIONS = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RW','LW','ST','GK','CB','CM','RW','ST','LB','CDM'];

function player(id, position, rating = 80) {
  const attacking = ['ST','RW','LW','CAM'].includes(position);
  const midfield = ['CDM','CM','CAM','RW','LW'].includes(position);
  const defending = ['CB','RB','LB','CDM'].includes(position);
  return {
    id, name:id, position, age:25, fitness:94, form:50, individualMorale:50, sharpness:50,
    attack:attacking ? rating : rating - 10,
    midfield:midfield ? rating : rating - 8,
    defence:defending ? rating : rating - 18,
    goalkeeping:position === 'GK' ? rating : 8,
    traits:[], injured:false, suspended:false, inSquad:true,
    positionSuitability:{ [position]:1 },
    attributeProfile:{
      version:1,
      pace:rating,
      shooting:attacking ? rating + 2 : rating - 12,
      passing:midfield || attacking ? rating : rating - 8,
      dribbling:midfield || attacking ? rating : rating - 8,
      defending:defending ? rating : rating - 18,
      physical:rating,
    },
  };
}

function squad(prefix, rating) {
  return POSITIONS.map((position, index) => player(`${prefix}_${index}`, position, rating + (index % 3) - 1));
}

function fixture(seed) {
  const home = {
    id:'home', name:'Home', reputation:82,
    tacticalPlan:createUserTacticalPlan({ buildUp:'direct', transition:'counter', tempo:'fast' }),
  };
  const away = { id:'away', name:'Away', reputation:80 };
  const liveState = buildLiveMatchState(
    home, away, squad('h',82), squad('a',80),
    '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed },
  );
  return { home, away, liveState };
}

function fullAutomatic(seed) {
  const state = fixture(seed);
  const result = simulateMatchSegment(state.home, state.away, state.liveState, 1, 120, 'home');
  return { ...state, result };
}

function findAutomaticSetPiece() {
  for (let index = 0; index < 48; index += 1) {
    const candidate = fullAutomatic(`phase4-set-piece-${index}`);
    if (candidate.result.updatedState.actionLedger.some(record => record.setPieceType)) return candidate;
  }
  throw new Error('No deterministic Phase 4 set piece found in seeded search');
}

function runAutomaticOnePhaseAtATime(seed) {
  const state = fixture(seed);
  let liveState = state.liveState;
  let events = [];
  for (let phase = 1; phase <= 120; phase += 1) {
    const step = simulateMatchSegment(state.home, state.away, liveState, phase, phase, 'home');
    liveState = step.updatedState;
    events = [...events, ...step.segEvents];
  }
  return { ...state, liveState, events };
}

function findSuspendedSetPiece(seed) {
  const state = fixture(seed);
  let liveState = state.liveState;
  for (let phase = 1; phase <= 120; phase += 1) {
    const step = simulateMatchSegment(
      state.home,
      state.away,
      liveState,
      phase,
      phase,
      'home',
      { suspend:true, controlledTeamId:'home' },
    );
    if (step.pendingPlayableMoment) {
      if (step.pendingPlayableMoment.setPiece) {
        return { ...state, liveState, phase, step };
      }
      const resumed = resumePlayableMatchPhase(
        state.home,
        state.away,
        liveState,
        step.playableContinuation,
        null,
        'home',
      );
      liveState = resumed.updatedState;
      continue;
    }
    liveState = step.updatedState;
  }
  throw new Error('Seed containing an automatic set piece did not expose a playable set-piece continuation');
}

describe('Phase 4 set pieces in the authoritative match engine', () => {
  it('keeps whole-match and one-phase-at-a-time automatic simulation identical when set pieces occur', () => {
    const found = findAutomaticSetPiece();
    const segmented = runAutomaticOnePhaseAtATime(found.liveState.seed);

    expect(found.result.updatedState.actionLedger.some(record => record.setPieceType)).toBe(true);
    expect(segmented.liveState.actionLedger).toEqual(found.result.updatedState.actionLedger);
    expect(segmented.liveState.rngState).toBe(found.result.updatedState.rngState);
    expect(segmented.liveState.hGoals).toBe(found.result.updatedState.hGoals);
    expect(segmented.liveState.aGoals).toBe(found.result.updatedState.aGoals);
  });

  it('stores a set piece as one foul phase with one authoritative shot and explicit restart', () => {
    const found = findAutomaticSetPiece();
    const records = found.result.updatedState.actionLedger.filter(record => record.setPieceType);

    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.outcome).toBe('foul_won');
      expect(record.shotId).toBeTruthy();
      expect(record.xg).toBeGreaterThan(0);
      expect(record.finish).toBeTruthy();
      expect(record.restart).toBeTruthy();
      expect(record.cornerWon).not.toBe(true);
      expect(['penalty','direct_free_kick']).toContain(record.setPieceType);
    }
  });

  it('suspends before the same set-piece finish and null-intent resume exactly matches automatic resolution', () => {
    const automatic = findAutomaticSetPiece();
    const suspended = findSuspendedSetPiece(automatic.liveState.seed);
    const pending = suspended.step.pendingPlayableMoment;
    const autoPhase = simulateMatchSegment(
      suspended.home,
      suspended.away,
      suspended.liveState,
      suspended.phase,
      suspended.phase,
      'home',
    );
    const resumed = resumePlayableMatchPhase(
      suspended.home,
      suspended.away,
      suspended.liveState,
      suspended.step.playableContinuation,
      null,
      'home',
    );

    expect(pending.setPiece.kind).toMatch(/penalty|direct_free_kick/);
    expect(suspended.step.playableContinuation.preparedAction.setPiece).toEqual(pending.setPiece);
    expect(resumed.playableResolution.moment.setPiece).toEqual(pending.setPiece);
    expect(resumed.playableResolution.record).toEqual(autoPhase.updatedState.actionLedger.at(-1));
    expect(resumed.updatedState.actionLedger).toEqual(autoPhase.updatedState.actionLedger);
    expect(resumed.updatedState.rngState).toBe(autoPhase.updatedState.rngState);
  });
});
