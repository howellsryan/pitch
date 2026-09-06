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
    tacticalPlan:createUserTacticalPlan({ buildUp:'direct', useOfSpace:'pass_into_space', transition:'counter', tempo:'fast' }),
  };
  const away = { id:'away', name:'Away', reputation:80 };
  const liveState = buildLiveMatchState(
    home, away, squad('h',83), squad('a',80),
    '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed },
  );
  return { home, away, liveState };
}

function fullAutomatic(seed) {
  const state = fixture(seed);
  const result = simulateMatchSegment(state.home, state.away, state.liveState, 1, 120, 'home');
  return { ...state, result };
}

function findAutomaticContinuation() {
  for (let index = 0; index < 32; index += 1) {
    const candidate = fullAutomatic(`phase5-continuation-${index}`);
    if (candidate.result.updatedState.actionLedger.some(record => record.continuationType)) return candidate;
  }
  throw new Error('No deterministic Phase 5 continuation found in seeded search');
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

function findSuspendedContinuation(seed, { favorable = false } = {}) {
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
      const prepared = step.playableContinuation.preparedAction;
      const isContinuation = step.pendingPlayableMoment.interactionType === 'continuation';
      const packet = prepared?.packet;
      const suitable = isContinuation && (!favorable || (packet.execution < .26 && packet.chance < .12));
      if (suitable) return { ...state, liveState, phase, step };

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
  return null;
}

function findFavorableSuspendedContinuation() {
  for (let index = 0; index < 48; index += 1) {
    const found = findSuspendedContinuation(`phase5-interactive-${index}`, { favorable:true });
    if (found) return found;
  }
  throw new Error('No deterministic favorable Phase 5 continuation found');
}

describe('Phase 5 continuation actions in the authoritative match engine', () => {
  it('keeps whole-match and one-phase automatic simulation identical when continuation actions occur', () => {
    const found = findAutomaticContinuation();
    const segmented = runAutomaticOnePhaseAtATime(found.liveState.seed);

    expect(found.result.updatedState.actionLedger.some(record => record.continuationType)).toBe(true);
    expect(segmented.liveState.actionLedger).toEqual(found.result.updatedState.actionLedger);
    expect(segmented.liveState.rngState).toBe(found.result.updatedState.rngState);
    expect(segmented.liveState.hGoals).toBe(found.result.updatedState.hGoals);
    expect(segmented.liveState.aGoals).toBe(found.result.updatedState.aGoals);
  });

  it('suspends before pass execution and null-intent resume exactly matches the automatic phase', () => {
    const automatic = findAutomaticContinuation();
    const suspended = findSuspendedContinuation(automatic.liveState.seed);
    expect(suspended).toBeTruthy();

    const pending = suspended.step.pendingPlayableMoment;
    const prepared = suspended.step.playableContinuation.preparedAction;
    expect(pending.interactionType).toBe('continuation');
    expect(prepared.outcome).toBeNull();
    expect(prepared.chance).toBeNull();
    expect(prepared.shooter).toBeNull();

    const autoPhase = simulateMatchSegment(
      suspended.home, suspended.away, suspended.liveState,
      suspended.phase, suspended.phase, 'home',
    );
    const resumed = resumePlayableMatchPhase(
      suspended.home, suspended.away, suspended.liveState,
      suspended.step.playableContinuation, null, 'home',
    );

    expect(resumed.playableResolution.moment.continuationAction).toEqual(pending.continuationAction);
    expect(resumed.playableResolution.record).toEqual(autoPhase.updatedState.actionLedger.at(-1));
    expect(resumed.updatedState.actionLedger).toEqual(autoPhase.updatedState.actionLedger);
    expect(resumed.updatedState.rngState).toBe(autoPhase.updatedState.rngState);
  });

  it('commits one interactive continuation phase and only the authorized receiver can become its downstream shooter', () => {
    const suspended = findFavorableSuspendedContinuation();
    const pending = suspended.step.pendingPlayableMoment;
    const zone = pending.continuationAction.targetZone;
    const beforeCount = suspended.liveState.actionLedger.length;
    const resumed = resumePlayableMatchPhase(
      suspended.home,
      suspended.away,
      suspended.liveState,
      suspended.step.playableContinuation,
      {
        continuation:{
          targetX:zone.x,
          targetY:zone.y,
          weight:pending.continuationType === 'through_ball' ? .76 : .68,
          timing:.96,
          receiverId:'invented-player',
        },
      },
      'home',
    );

    const record = resumed.playableResolution.record;
    expect(resumed.updatedState.actionLedger).toHaveLength(beforeCount + 1);
    expect(record.continuation.receiverId).toBe(pending.receiverId);
    expect(record.continuation.receiverId).not.toBe('invented-player');
    expect(record.continuation.success).toBe(true);
    if (record.shotId) {
      expect(record.shotId).toBe(pending.receiverId);
      expect(record.assistId).toBe(pending.actorId);
      expect(record.xg).toBeGreaterThan(0);
    }
    expect(resumed.updatedState.rngState).toBe(suspended.step.playableContinuation.rngState);
  });
});
