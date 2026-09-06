import { describe, expect, it } from 'vitest';
import {
  MATCH_PHASES,
  buildLiveMatchState,
  resumePlayableMatchPhase,
  simulateMatchSegment,
} from './matchEngine.js';
import { preparePlayableContactContinuation } from './matchContactPhase.js';
import { createUserTacticalPlan } from './tactics.js';

const POSITIONS = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RW','LW','ST','GK','CB','CM','RW','ST','LB','CDM'];

function player(id, position, rating = 80) {
  const attacking = ['ST','CF','RW','LW','CAM'].includes(position);
  const midfield = ['CM','CDM','CAM','RM','LM','RW','LW'].includes(position);
  const defending = ['CB','RB','LB','CDM'].includes(position);
  return {
    id,
    name:id,
    position,
    matchPosition:position,
    age:25,
    attack:attacking ? rating : rating - 9,
    midfield:midfield ? rating : rating - 7,
    defence:defending ? rating : rating - 16,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:94,
    form:50,
    individualMorale:50,
    sharpness:50,
    traits:[],
    injured:false,
    suspended:false,
    inSquad:true,
    appearances:0,
    goals:0,
    assists:0,
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
    home, away, squad('h', 82), squad('a', 80),
    '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed },
  );
  return { home, away, state };
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

function findContactMoment() {
  for (let seedIndex = 0; seedIndex < 32; seedIndex += 1) {
    const current = fixture(`phase6-contact-${seedIndex}`);
    let state = current.state;
    for (let phase = 1; phase <= MATCH_PHASES; phase += 1) {
      const suspended = simulateMatchSegment(
        current.home,
        current.away,
        state,
        phase,
        phase,
        current.home.id,
        { suspend:true, controlledTeamId:current.home.id },
      );
      if (suspended.pendingPlayableMoment?.interactionType === 'contact') {
        return { ...current, stateBefore:state, phase, suspended };
      }
      if (suspended.pendingPlayableMoment) {
        state = resumePlayableMatchPhase(
          current.home,
          current.away,
          state,
          suspended.playableContinuation,
          null,
          current.home.id,
        ).updatedState;
      } else {
        state = suspended.updatedState;
      }
    }
  }
  throw new Error('Could not find a deterministic Phase 6 contact moment');
}

describe('Phase 6 real-match authoritative integration', () => {
  it('keeps the original automatic phase isolated while a selected contact commits exactly once', () => {
    const found = findContactMoment();
    const originalAutomatic = simulateMatchSegment(
      found.home,
      found.away,
      found.stateBefore,
      found.phase,
      found.phase,
      found.home.id,
    );
    const originalResumed = resumePlayableMatchPhase(
      found.home,
      found.away,
      found.stateBefore,
      found.suspended.playableContinuation,
      null,
      found.home.id,
    );

    expect(originalResumed.segEvents).toEqual(originalAutomatic.segEvents);
    expect(stateContract(originalResumed.updatedState)).toEqual(stateContract(originalAutomatic.updatedState));

    const selected = preparePlayableContactContinuation(
      found.suspended.playableContinuation,
      found.home.id,
      found.suspended.pendingPlayableMoment.version,
    );
    expect(selected).toBeTruthy();
    expect(selected.moment.interactionType).toBe('contact');
    expect(selected.continuation.preparedAction.contactAction.type).toBe(selected.moment.contactType);

    const intent = selected.moment.mode === 'attack'
      ? { attack:{ aimX:.22, aimY:.52, power:selected.moment.contactAction.preferredPower, timing:.88 } }
      : { goalkeeper:{ x:.22, y:.52, timing:.88 } };
    const committed = resumePlayableMatchPhase(
      found.home,
      found.away,
      found.stateBefore,
      selected.continuation,
      intent,
      found.home.id,
    );

    expect(committed.updatedState.actionLedger).toHaveLength(found.stateBefore.actionLedger.length + 1);
    const record = committed.updatedState.actionLedger.at(-1);
    expect(record.outcome).toBe('chance_created');
    expect(record.contactType).toBe(selected.moment.contactType);
    expect(record.continuation?.success).toBe(true);
    expect(record.shotId).toBe(selected.moment.shooterId);
    expect(record.xg).toBe(selected.moment.xg);
    expect(record.finish).toBe(committed.playableResolution.shot.finish);
    expect(committed.segEvents.filter(event => event.type === 'goal')).toHaveLength(committed.playableResolution.shot.goal ? 1 : 0);
  });

  it('replaying the same enriched continuation and intent is deterministic and cannot duplicate phase effects', () => {
    const found = findContactMoment();
    const selected = preparePlayableContactContinuation(
      found.suspended.playableContinuation,
      found.home.id,
      found.suspended.pendingPlayableMoment.version,
    );
    const intent = selected.moment.mode === 'attack'
      ? { attack:{ aimX:-.18, aimY:.48, power:selected.moment.contactAction.preferredPower, timing:.84 } }
      : { goalkeeper:{ x:-.18, y:.48, timing:.84 } };

    const first = resumePlayableMatchPhase(
      found.home, found.away, found.stateBefore, selected.continuation, intent, found.home.id,
    );
    const second = resumePlayableMatchPhase(
      found.home, found.away, found.stateBefore, selected.continuation, intent, found.home.id,
    );

    expect(first.segEvents).toEqual(second.segEvents);
    expect(first.playableResolution).toEqual(second.playableResolution);
    expect(stateContract(first.updatedState)).toEqual(stateContract(second.updatedState));
    expect(first.updatedState.actionLedger).toHaveLength(found.stateBefore.actionLedger.length + 1);
  });
});
