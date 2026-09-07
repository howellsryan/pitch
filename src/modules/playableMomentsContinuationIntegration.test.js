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
      dribbling:attacking || midfield ? rating : rating - 8,
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

function stateContract(state) {
  return {
    actionLedger:state.actionLedger,
    hGoals:state.hGoals,
    aGoals:state.aGoals,
    hPhases:state.hPhases,
    aPhases:state.aPhases,
    rngState:state.rngState,
    hFitness:[...state.hFitness.entries()],
    aFitness:[...state.aFitness.entries()],
  };
}

function runAutomatic(seed) {
  const current = fixture(seed);
  const result = simulateMatchSegment(current.home, current.away, current.liveState, 1, 120, current.home.id);
  return { ...current, result };
}

function runSuspensionAware(seed) {
  const current = fixture(seed);
  let state = current.liveState;
  let events = [];
  const offered = [];

  for (let phase = 1; phase <= 120; phase += 1) {
    const step = simulateMatchSegment(
      current.home,
      current.away,
      state,
      phase,
      phase,
      current.home.id,
      { suspend:true, controlledTeamId:current.home.id },
    );

    if (step.pendingPlayableMoment) {
      offered.push(step.pendingPlayableMoment);
      const resumed = resumePlayableMatchPhase(
        current.home,
        current.away,
        state,
        step.playableContinuation,
        null,
        current.home.id,
      );
      state = resumed.updatedState;
      events = [...events, ...resumed.segEvents];
    } else {
      state = step.updatedState;
      events = [...events, ...step.segEvents];
    }
  }

  return { ...current, state, events, offered };
}

describe('retired continuation interactions in the authoritative match engine', () => {
  it('keeps whole-match and suspension-aware automatic simulation identical', () => {
    const seed = 'phase5-retired-continuations';
    const automatic = runAutomatic(seed);
    const suspensionAware = runSuspensionAware(seed);

    expect(stateContract(suspensionAware.state)).toEqual(stateContract(automatic.result.updatedState));
    expect(suspensionAware.events).toEqual(automatic.result.segEvents);
  });

  it('never surfaces final-pass continuations as user-playable moments', () => {
    const seen = [];
    for (let index = 0; index < 12; index += 1) {
      seen.push(...runSuspensionAware(`phase5-no-continuation-${index}`).offered);
    }

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(moment => moment.mode === 'attack')).toBe(true);
    expect(seen.some(moment => moment.interactionType === 'continuation')).toBe(false);
    expect(seen.some(moment => moment.interactionType === 'contact')).toBe(false);
  });
});
