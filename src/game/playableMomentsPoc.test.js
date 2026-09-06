import { describe, expect, it } from 'vitest';
import {
  MATCH_PHASES,
  buildLiveMatchState,
  resumePlayableMatchPhase,
  simulateMatchSegment,
} from '../modules/matchEngine.js';
import { createUserTacticalPlan } from '../modules/tactics.js';
import {
  SYNTHETIC_KEEPER_TARGETS,
  createSyntheticPlayableMoment,
  gestureToPlayableIntent,
  isSyntheticSpecialFinish,
  resolveSyntheticAttackShot,
  resolveSyntheticGoalkeeperShot,
  samplePlayablePocMotion,
} from './playableMomentsPocScene.js';

const POSITIONS = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RW','LW','ST','GK','CB','CM','RW','ST','LB','CDM'];

function makePlayer(id, position, rating = 78) {
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
  };
}

function makeSquad(prefix, rating = 78) {
  return POSITIONS.map((position, index) => makePlayer(`${prefix}_${index}`, position, rating + (index % 3) - 1));
}

function userTeam(id) {
  return {
    id,
    name:id,
    crest:'X',
    reputation:80,
    tacticalPlan:createUserTacticalPlan({ buildUp:'direct', transition:'counter', tempo:'fast' }),
  };
}

function aiTeam(id) {
  return { id, name:id, crest:'X', reputation:80 };
}

function freshFixture(seed) {
  const home = userTeam('home');
  const away = aiTeam('away');
  const state = buildLiveMatchState(
    home,
    away,
    makeSquad('h', 80),
    makeSquad('a', 79),
    '4-3-3',
    '4-3-3',
    null,
    null,
    'balanced',
    'balanced',
    { seed },
  );
  return { home, away, state };
}

function findPendingMoment({ mode = null, boundary = false, requireUnblocked = false, requireTerminalShot = false } = {}) {
  for (let seedIndex = 0; seedIndex < 24; seedIndex += 1) {
    const fixture = freshFixture(`playable-poc-${mode ?? 'any'}-${boundary ? 'boundary' : 'free'}-${seedIndex}`);
    let state = fixture.state;
    for (let phase = 1; phase <= MATCH_PHASES; phase += 1) {
      const part = simulateMatchSegment(
        fixture.home,
        fixture.away,
        state,
        phase,
        phase,
        fixture.home.id,
        { suspend:true, controlledTeamId:fixture.home.id },
      );
      if (part.pendingPlayableMoment) {
        const modeMatches = mode == null || part.pendingPlayableMoment.mode === mode;
        const boundaryMatches = !boundary || phase % 10 === 0 || phase % 6 === 0;
        const blockMatches = !requireUnblocked || Number(part.playableContinuation.packet.outcome) > .3;
        const terminalShotMatches = !requireTerminalShot
          || (part.pendingPlayableMoment.interactionType !== 'continuation' && !part.pendingPlayableMoment.setPiece);
        if (modeMatches && boundaryMatches && blockMatches && terminalShotMatches) {
          return { ...fixture, stateBefore:state, phase, pending:part };
        }
        const resumed = resumePlayableMatchPhase(
          fixture.home,
          fixture.away,
          state,
          part.playableContinuation,
          null,
          fixture.home.id,
        );
        state = resumed.updatedState;
      } else {
        state = part.updatedState;
      }
    }
  }
  throw new Error(`Could not find playable moment for mode=${mode ?? 'any'} boundary=${boundary} terminalShot=${requireTerminalShot}`);
}

function stateShape(state) {
  return {
    actionLedger:state.actionLedger,
    hActive:state.hActive,
    aActive:state.aActive,
    hBenchLeft:state.hBenchLeft,
    aBenchLeft:state.aBenchLeft,
    hFitness:[...state.hFitness.entries()],
    aFitness:[...state.aFitness.entries()],
    hSubsLeft:state.hSubsLeft,
    aSubsLeft:state.aSubsLeft,
    hGoals:state.hGoals,
    aGoals:state.aGoals,
    hPhases:state.hPhases,
    aPhases:state.aPhases,
    rngState:state.rngState,
  };
}

describe('Playable Key Moments POC authoritative continuation', () => {
  it('publishes no phase mutation before the user resolves the pending moment', () => {
    const found = findPendingMoment();

    expect(found.pending.segEvents).toEqual([]);
    expect(found.pending.updatedState.actionLedger).toHaveLength(found.stateBefore.actionLedger.length);
    expect(found.pending.updatedState.hGoals).toBe(found.stateBefore.hGoals);
    expect(found.pending.updatedState.aGoals).toBe(found.stateBefore.aGoals);
    expect(found.pending.updatedState.hPhases).toBe(found.stateBefore.hPhases);
    expect(found.pending.updatedState.aPhases).toBe(found.stateBefore.aPhases);
    expect([...found.pending.updatedState.hFitness.entries()]).toEqual([...found.stateBefore.hFitness.entries()]);
    expect([...found.pending.updatedState.aFitness.entries()]).toEqual([...found.stateBefore.aFitness.entries()]);
  });

  it('resuming with automatic intent is exactly equivalent to the unchanged one-phase automatic path', () => {
    const found = findPendingMoment({ boundary:true });
    const automatic = simulateMatchSegment(
      found.home,
      found.away,
      found.stateBefore,
      found.phase,
      found.phase,
      found.home.id,
    );
    const resumed = resumePlayableMatchPhase(
      found.home,
      found.away,
      found.stateBefore,
      found.pending.playableContinuation,
      null,
      found.home.id,
    );

    expect(resumed.segEvents).toEqual(automatic.segEvents);
    expect(stateShape(resumed.updatedState)).toEqual(stateShape(automatic.updatedState));
  });

  it('can resume the same continuation twice without replaying phase effects or changing the answer', () => {
    const found = findPendingMoment({ boundary:true, requireUnblocked:true });
    const moment = found.pending.pendingPlayableMoment;
    const intent = moment.interactionType === 'continuation'
      ? { continuation:{ targetX:moment.continuationAction.targetZone.x, targetY:moment.continuationAction.targetZone.y, weight:.72, timing:.82 } }
      : moment.mode === 'attack'
        ? { attack:{ aimX:.2, aimY:.48, power:.72, timing:.82 } }
        : { goalkeeper:{ x:.15, y:.5, timing:.82 } };

    const first = resumePlayableMatchPhase(
      found.home,
      found.away,
      found.stateBefore,
      found.pending.playableContinuation,
      intent,
      found.home.id,
    );
    const second = resumePlayableMatchPhase(
      found.home,
      found.away,
      found.stateBefore,
      found.pending.playableContinuation,
      intent,
      found.home.id,
    );

    expect(first.segEvents).toEqual(second.segEvents);
    expect(first.playableResolution).toEqual(second.playableResolution);
    expect(stateShape(first.updatedState)).toEqual(stateShape(second.updatedState));
    expect(first.updatedState.actionLedger).toHaveLength(found.stateBefore.actionLedger.length + 1);
  });

  it('lets attacking shot input create a visibly different authoritative target from the same prepared chance', () => {
    const found = findPendingMoment({ mode:'attack', requireUnblocked:true, requireTerminalShot:true });
    const wide = resumePlayableMatchPhase(
      found.home,
      found.away,
      found.stateBefore,
      found.pending.playableContinuation,
      { attack:{ aimX:1.25, aimY:.5, power:.72, timing:1 } },
      found.home.id,
    );
    const central = resumePlayableMatchPhase(
      found.home,
      found.away,
      found.stateBefore,
      found.pending.playableContinuation,
      { attack:{ aimX:0, aimY:.5, power:.72, timing:1 } },
      found.home.id,
    );

    expect(wide.playableResolution.moment.mode).toBe('attack');
    expect(wide.playableResolution.shot.presentation.target.x)
      .toBeGreaterThan(central.playableResolution.shot.presentation.target.x);
    expect(wide.playableResolution.shot.presentation.target)
      .not.toEqual(central.playableResolution.shot.presentation.target);
    expect(wide.updatedState.actionLedger.at(-1).finish).toBe(wide.playableResolution.shot.finish);
    expect(central.updatedState.actionLedger.at(-1).finish).toBe(central.playableResolution.shot.finish);
  });

  it('threads an explicit goalkeeper decision through an opponent-owned chance', () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const found = findPendingMoment({ mode:'goalkeeper', requireUnblocked:true });
      const resumed = resumePlayableMatchPhase(
        found.home,
        found.away,
        found.stateBefore,
        found.pending.playableContinuation,
        { goalkeeper:{ x:.78, y:.62, timing:.9 } },
        found.home.id,
      );
      const keeperPlan = resumed.playableResolution.shot.presentation.keeper;
      if (!keeperPlan) continue;

      expect(resumed.playableResolution.moment.mode).toBe('goalkeeper');
      expect(keeperPlan.x).toBe(.78);
      expect(keeperPlan.y).toBe(.62);
      expect(keeperPlan.timing).toBe(.9);
      expect(resumed.updatedState.actionLedger.at(-1).finish).toBe(resumed.playableResolution.shot.finish);
      return;
    }
    throw new Error('Could not find an on-target goalkeeper moment');
  });
});

describe('Playable Key Moments synthetic drills', () => {
  it('saves ordinary on-target synthetic shots', () => {
    const shot = resolveSyntheticAttackShot({ attack:{ aimX:0, aimY:.55, power:.82, timing:.9 } });
    expect(shot.finish).toBe('saved');
    expect(shot.goal).toBe(false);
    expect(shot.syntheticSpecial).toBe(false);
    expect(shot.presentation.contact).toBe('save');
  });

  it.each([-1, 1])('scores every synthetic finish that lands in either visible gold top-corner zone (%s)', side => {
    const intent = { attack:{ aimX:side * .79, aimY:.82, power:.24, timing:.25 } };
    expect(isSyntheticSpecialFinish(intent)).toBe(true);
    const shot = resolveSyntheticAttackShot(intent);
    expect(shot.finish).toBe('goal');
    expect(shot.goal).toBe(true);
    expect(shot.syntheticSpecial).toBe(true);
    expect(shot.presentation.contact).toBe('goal');
  });

  it('keeps powerful well-timed attempts outside the visible gold zone saveable', () => {
    expect(resolveSyntheticAttackShot({ attack:{ aimX:.58, aimY:.82, power:1, timing:1 } }).finish).toBe('saved');
    expect(resolveSyntheticAttackShot({ attack:{ aimX:-.79, aimY:.60, power:1, timing:1 } }).finish).toBe('saved');
  });

  it('cycles goalkeeper training shots through visible non-centre targets', () => {
    const targets = SYNTHETIC_KEEPER_TARGETS.map((_, index) => createSyntheticPlayableMoment('goalkeeper', index).syntheticTarget);
    expect(targets).toHaveLength(6);
    expect(new Set(targets.map(target => target.label)).size).toBe(6);
    expect(targets.every(target => Math.abs(target.x) >= .5)).toBe(true);
    expect(createSyntheticPlayableMoment('goalkeeper', 6).syntheticTarget).toEqual(targets[0]);
  });

  it('makes the goalkeeper drill forgiving for a correct cue read but punishes the wrong side', () => {
    const moment = createSyntheticPlayableMoment('goalkeeper', 0);
    const target = moment.syntheticTarget;
    const correct = resolveSyntheticGoalkeeperShot(moment, {
      goalkeeper:{ x:target.x, y:target.y, timing:.7 },
    });
    const wrong = resolveSyntheticGoalkeeperShot(moment, {
      goalkeeper:{ x:-target.x, y:target.y, timing:1 },
    });

    expect(correct.finish).toBe('saved');
    expect(correct.syntheticCue).toBe(target.label);
    expect(wrong.finish).toBe('goal');
  });

  it('allows renderer goal-plane coordinates to override whole-canvas gesture approximation', () => {
    const intent = gestureToPlayableIntent({
      mode:'attack',
      start:{ x:100, y:500 },
      end:{ x:300, y:120 },
      bounds:{ left:0, top:0, width:400, height:600 },
      durationMs:480,
      goalTarget:{ x:.82, y:.84 },
    });
    expect(intent.attack.aimX).toBe(.82);
    expect(intent.attack.aimY).toBe(.84);
    expect(intent.attack.power).toBeGreaterThan(.68);
    expect(intent.attack.timing).toBe(1);
    expect(isSyntheticSpecialFinish(intent)).toBe(true);
  });
});

describe('Playable Key Moments POC motion contract', () => {
  it('keeps the ball planted until foot contact and sequences backswing before follow-through', () => {
    const moment = createSyntheticPlayableMoment('attack');
    const resolution = {
      shot:{
        finish:'goal',
        presentation:{
          target:{ x:.79, y:.82, power:.8 },
          keeper:{ x:.38, y:.42, timing:.74, reach:.42 },
          contact:'goal',
        },
      },
    };
    const backswing = samplePlayablePocMotion(moment, resolution, .28);
    const preContact = samplePlayablePocMotion(moment, resolution, .38);
    const afterContact = samplePlayablePocMotion(moment, resolution, .52);

    expect(backswing.shooter.kick).toBeLessThan(0);
    expect(preContact.ball.x).toBeCloseTo(moment.geometry.ball.x, 6);
    expect(preContact.ball.y).toBeCloseTo(moment.geometry.ball.y, 6);
    expect(preContact.ball.z).toBeCloseTo(moment.geometry.ball.z, 6);
    expect(afterContact.shooter.kick).toBeGreaterThan(0);
    expect(afterContact.ball.z).toBeLessThan(moment.geometry.ball.z);
    expect(afterContact.ball.spinX).toBeGreaterThan(0);
  });

  it('makes the keeper set, push, extend and land after the strike instead of sliding early', () => {
    const moment = createSyntheticPlayableMoment('goalkeeper', 1);
    const shot = resolveSyntheticGoalkeeperShot(moment, {
      goalkeeper:{ x:moment.syntheticTarget.x, y:moment.syntheticTarget.y, timing:.85 },
    });
    const preContact = samplePlayablePocMotion(moment, { shot }, .40);
    const extension = samplePlayablePocMotion(moment, { shot }, .65);
    const landing = samplePlayablePocMotion(moment, { shot }, .78);

    expect(preContact.keeper.crouch).toBeGreaterThan(0);
    expect(preContact.keeper.dive).toBeCloseTo(0, 6);
    expect(extension.keeper.dive).toBeGreaterThan(.5);
    expect(Math.abs(extension.keeper.roll)).toBeGreaterThan(.1);
    expect(landing.keeper.landing).toBeGreaterThan(.5);
  });

  it('parries every saved synthetic shot visibly away from the keeper after contact', () => {
    const attackMoment = createSyntheticPlayableMoment('attack');
    const attackShot = resolveSyntheticAttackShot({ attack:{ aimX:0, aimY:.55, power:.82, timing:.9 } });
    const attackContact = samplePlayablePocMotion(attackMoment, { shot:attackShot }, .70);
    const attackParry = samplePlayablePocMotion(attackMoment, { shot:attackShot }, .88);

    expect(attackShot.finish).toBe('saved');
    expect(attackContact.ball.parry).toBeCloseTo(0, 6);
    expect(attackParry.ball.parry).toBeGreaterThan(.5);
    expect(attackParry.ball.z).toBeGreaterThan(attackContact.ball.z + 1);
    expect(Math.abs(attackParry.ball.x - attackContact.ball.x)).toBeGreaterThan(.3);

    const keeperMoment = createSyntheticPlayableMoment('goalkeeper', 1);
    const keeperShot = resolveSyntheticGoalkeeperShot(keeperMoment, {
      goalkeeper:{ x:keeperMoment.syntheticTarget.x, y:keeperMoment.syntheticTarget.y, timing:.85 },
    });
    const keeperContact = samplePlayablePocMotion(keeperMoment, { shot:keeperShot }, .70);
    const keeperParry = samplePlayablePocMotion(keeperMoment, { shot:keeperShot }, .88);

    expect(keeperShot.finish).toBe('saved');
    expect(keeperContact.ball.parry).toBeCloseTo(0, 6);
    expect(keeperParry.ball.parry).toBeGreaterThan(.5);
    expect(keeperParry.ball.z).toBeGreaterThan(keeperContact.ball.z + 1);
    expect(Math.abs(keeperParry.ball.x - keeperContact.ball.x)).toBeGreaterThan(.3);
  });

  it('returns the shooter and goalkeeper to a neutral pose after strike/dive recovery', () => {
    const moment = createSyntheticPlayableMoment('attack');
    const resolution = {
      shot:{
        finish:'saved',
        presentation:{
          target:{ x:.72, y:.62, power:.72 },
          keeper:{ x:.72, y:.62, timing:.9, reach:.5 },
          contact:'save',
        },
      },
    };
    const contact = samplePlayablePocMotion(moment, resolution, .62);
    const recovered = samplePlayablePocMotion(moment, resolution, 1);

    expect(Math.abs(contact.keeper.x)).toBeGreaterThan(.2);
    expect(Math.abs(contact.keeper.roll)).toBeGreaterThan(.1);
    expect(recovered.shooter.lean).toBeCloseTo(0, 6);
    expect(recovered.shooter.kick).toBeCloseTo(0, 6);
    expect(recovered.keeper.x).toBeCloseTo(moment.geometry.goalkeeper.x, 6);
    expect(recovered.keeper.y).toBeCloseTo(0, 6);
    expect(recovered.keeper.roll).toBeCloseTo(0, 6);
    expect(recovered.keeper.dive).toBeCloseTo(0, 6);
    expect(recovered.shooter.recovery).toBe(1);
    expect(recovered.keeper.recovery).toBe(1);
  });
});