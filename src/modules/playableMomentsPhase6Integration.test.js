import { describe, expect, it } from 'vitest';
import {
  MATCH_PHASES,
  buildLiveMatchState,
  resumePlayableMatchPhase,
  simulateMatchSegment,
} from './matchEngine.js';
import { createUserTacticalPlan } from './tactics.js';

const POSITIONS = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RW','LW','ST','GK','CB','CM','RW','ST','LB','CDM'];

function player(id, position, rating = 80) {
  const attacking = ['ST','CF','RW','LW','CAM'].includes(position);
  const midfield = ['CM','CDM','CAM','RM','LM','RW','LW'].includes(position);
  const defending = ['CB','RB','LB','CDM'].includes(position);
  return {
    id, name:id, position, matchPosition:position, age:25,
    attack:attacking ? rating : rating - 9,
    midfield:midfield ? rating : rating - 7,
    defence:defending ? rating : rating - 16,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:94, form:50, individualMorale:50, sharpness:50,
    traits:[], injured:false, suspended:false, inSquad:true,
    positionSuitability:{ [position]:1 },
    attributeProfile:{
      version:1,
      pace:rating,
      shooting:attacking ? rating + 2 : rating - 10,
      passing:midfield || attacking ? rating + 1 : rating - 7,
      dribbling:attacking || midfield ? rating : rating - 8,
      defending:defending ? rating + 1 : rating - 16,
      physical:rating,
    },
  };
}

function squad(prefix, rating) {
  return POSITIONS.map((position, index) => player(`${prefix}_${index}`, position, rating + (index % 3) - 1));
}

function fixture(seed) {
  const home = {
    id:'home', name:'Home', crest:'H', reputation:82,
    tacticalPlan:createUserTacticalPlan({ buildUp:'direct', transition:'counter', tempo:'fast', attackingWidth:'wide' }),
  };
  const away = { id:'away', name:'Away', crest:'A', reputation:80 };
  const state = buildLiveMatchState(
    home, away, squad('h',82), squad('a',80),
    '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed },
  );
  return { home, away, state };
}

function contract(state) {
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

function suspensionAware(seed) {
  const current = fixture(seed);
  let state = current.state;
  const offered = [];
  const events = [];

  for (let phase = 1; phase <= MATCH_PHASES; phase += 1) {
    const step = simulateMatchSegment(
      current.home, current.away, state, phase, phase, current.home.id,
      { suspend:true, controlledTeamId:current.home.id },
    );
    if (step.pendingPlayableMoment) {
      offered.push(step.pendingPlayableMoment);
      const resumed = resumePlayableMatchPhase(
        current.home, current.away, state, step.playableContinuation, null, current.home.id,
      );
      state = resumed.updatedState;
      events.push(...resumed.segEvents);
    } else {
      state = step.updatedState;
      events.push(...step.segEvents);
    }
  }
  return { ...current, state, offered, events };
}

describe('retired contact interactions in real-match integration', () => {
  it('never offers contact or defending moments while the authoritative match keeps progressing', () => {
    const offered = [];
    for (let index = 0; index < 12; index += 1) {
      offered.push(...suspensionAware(`phase6-retired-contact-${index}`).offered);
    }

    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every(moment => moment.mode === 'attack')).toBe(true);
    expect(offered.some(moment => moment.interactionType === 'contact')).toBe(false);
    expect(offered.some(moment => moment.mode === 'goalkeeper')).toBe(false);
  });

  it('keeps suspension-aware null-intent play identical to the unchanged automatic engine', () => {
    const seed = 'phase6-retired-contact-parity';
    const current = fixture(seed);
    const automatic = simulateMatchSegment(current.home, current.away, current.state, 1, MATCH_PHASES, current.home.id);
    const interactiveBoundary = suspensionAware(seed);

    expect(contract(interactiveBoundary.state)).toEqual(contract(automatic.updatedState));
    expect(interactiveBoundary.events).toEqual(automatic.segEvents);
  });
});
