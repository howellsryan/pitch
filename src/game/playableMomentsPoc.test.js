import { describe, expect, it } from 'vitest';
import {
  MATCH_PHASES,
  buildLiveMatchState,
  resumePlayableMatchPhase,
  simulateMatchSegment,
} from '../modules/matchEngine.js';
import { createUserTacticalPlan } from '../modules/tactics.js';
import {
  createSyntheticPlayableMoment,
  gestureToPlayableIntent,
  isSyntheticSpecialFinish,
  resolveSyntheticAttackShot,
  samplePlayablePocMotion,
} from './playableMomentsPocScene.js';
import {
  POC_ATTACKING_SCENARIOS,
  createPocAttackingMoment,
  pocPenaltyDiveDirection,
  resolvePocAttackingMoment,
} from './playableMomentsPocScenarios.js';

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

function findPendingMoment({ boundary = false, requireUnblocked = false, requireTerminalShot = false } = {}) {
  for (let seedIndex = 0; seedIndex < 24; seedIndex += 1) {
    const fixture = freshFixture(`playable-poc-attack-${boundary ? 'boundary' : 'free'}-${seedIndex}`);
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
        expect(part.pendingPlayableMoment.mode).toBe('attack');
        expect(part.pendingPlayableMoment.attackingTeamId).toBe(fixture.home.id);
        const boundaryMatches = !boundary || phase % 10 === 0 || phase % 6 === 0;
        const blockMatches = !requireUnblocked || Number(part.playableContinuation.packet.outcome) > .3;
        const terminalShotMatches = !requireTerminalShot || !part.pendingPlayableMoment.setPiece;
        if (boundaryMatches && blockMatches && terminalShotMatches) {
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
  throw new Error(`Could not find attacking playable moment boundary=${boundary} terminalShot=${requireTerminalShot}`);
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
  it('publishes no phase mutation before the user resolves the pending attacking moment', () => {
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

  it('can resume the same attacking continuation twice without replaying phase effects or changing the answer', () => {
    const found = findPendingMoment({ boundary:true, requireUnblocked:true });
    const intent = { attack:{ aimX:.2, aimY:.48, power:.72, timing:.82 } };

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
    const found = findPendingMoment({ requireUnblocked:true, requireTerminalShot:true });
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

  it('never constructs a defending key moment while opponent attacks continue automatically', () => {
    for (let seedIndex = 0; seedIndex < 10; seedIndex += 1) {
      const fixture = freshFixture(`no-defending-poc-${seedIndex}`);
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
        if (!part.pendingPlayableMoment) {
          state = part.updatedState;
          continue;
        }
        expect(part.pendingPlayableMoment.mode).toBe('attack');
        expect(part.pendingPlayableMoment.attackingTeamId).toBe(fixture.home.id);
        expect(part.pendingPlayableMoment.interactionType).not.toBe('contact');
        expect(part.pendingPlayableMoment.interactionType).not.toBe('continuation');
        const resumed = resumePlayableMatchPhase(
          fixture.home,
          fixture.away,
          state,
          part.playableContinuation,
          null,
          fixture.home.id,
        );
        state = resumed.updatedState;
      }
    }
  });
});

describe('attacking-only Play Key Moments POC scenarios', () => {
  it('exposes open-play, 1v1, long-shot, free-kick and penalty scenarios with no goalkeeper drill', () => {
    expect(POC_ATTACKING_SCENARIOS.map(item => item.id)).toEqual([
      'shot','one_on_one','long_shot','free_kick','penalty',
    ]);
    expect(POC_ATTACKING_SCENARIOS.some(item => /keeper|goalkeeper/i.test(item.id))).toBe(false);
    for (const scenario of POC_ATTACKING_SCENARIOS) {
      const moment = createPocAttackingMoment(scenario.id, 0);
      expect(moment.mode).toBe('attack');
      expect(moment.attackingTeamId).toBe('poc-home');
    }
  });

  it('puts an authoritative wall in the direct-free-kick POC and only rewards a top corner', () => {
    const moment = createPocAttackingMoment('free_kick', 0);
    expect(moment.setPiece.kind).toBe('direct_free_kick');
    expect(moment.geometry.wall.members).toHaveLength(4);
    const goal = resolvePocAttackingMoment(moment, {
      attack:{ aimX:.82, aimY:.84, power:.70, timing:.98 },
    });
    const central = resolvePocAttackingMoment(moment, {
      attack:{ aimX:0, aimY:.60, power:.70, timing:.98 },
    });
    expect(goal.finish).toBe('goal');
    expect(goal.presentation.topCorner).toBe(true);
    expect(central.goal).toBe(false);
  });

  it('varies the POC penalty goalkeeper direction through deterministic RNG attempts', () => {
    const directions = Array.from({ length:12 }, (_, attempt) => (
      pocPenaltyDiveDirection(createPocAttackingMoment('penalty', attempt))
    ));
    expect(new Set(directions).size).toBeGreaterThan(1);
    const moment = createPocAttackingMoment('penalty', 3);
    const shot = resolvePocAttackingMoment(moment, {
      attack:{ aimX:.75, aimY:.62, power:.76, timing:.92 },
    });
    expect(shot.presentation.keeperDiveRng).toBe(true);
  });

  it('marks 1v1s as easier and long shots as top-corner-only through the real resolver', () => {
    const oneOnOne = createPocAttackingMoment('one_on_one', 0);
    const oneOnOneShot = resolvePocAttackingMoment(oneOnOne, {
      attack:{ aimX:.60, aimY:.55, power:.76, timing:.94 },
    });
    expect(oneOnOneShot.presentation.oneOnOne).toBe(true);
    expect(oneOnOneShot.presentation.oneOnOneEasier).toBe(true);

    const longShot = createPocAttackingMoment('long_shot', 0);
    const central = resolvePocAttackingMoment(longShot, {
      attack:{ aimX:0, aimY:.60, power:.78, timing:.98 },
    });
    expect(central.presentation.longShot).toBe(true);
    expect(central.presentation.topCornerRequired).toBe(true);
    expect(central.goal).toBe(false);
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

  it('animates the opponent goalkeeper reacting to an attacking penalty without exposing a defending interaction', () => {
    const moment = createPocAttackingMoment('penalty', 2);
    const shot = resolvePocAttackingMoment(moment, {
      attack:{ aimX:.72, aimY:.60, power:.76, timing:.90 },
    });
    const preContact = samplePlayablePocMotion(moment, { shot }, .40);
    const extension = samplePlayablePocMotion(moment, { shot }, .65);
    const landing = samplePlayablePocMotion(moment, { shot }, .78);

    expect(moment.mode).toBe('attack');
    expect(preContact.keeper.crouch).toBeGreaterThan(0);
    expect(preContact.keeper.dive).toBeCloseTo(0, 6);
    expect(extension.keeper.dive).toBeGreaterThan(.5);
    expect(Math.abs(extension.keeper.roll)).toBeGreaterThan(.1);
    expect(landing.keeper.landing).toBeGreaterThan(.5);
  });

  it('parries a saved attacking shot visibly away from the keeper after contact', () => {
    const attackMoment = createSyntheticPlayableMoment('attack');
    const attackShot = resolveSyntheticAttackShot({ attack:{ aimX:0, aimY:.55, power:.82, timing:.9 } });
    const attackContact = samplePlayablePocMotion(attackMoment, { shot:attackShot }, .70);
    const attackParry = samplePlayablePocMotion(attackMoment, { shot:attackShot }, .88);

    expect(attackShot.finish).toBe('saved');
    expect(attackContact.ball.parry).toBeCloseTo(0, 6);
    expect(attackParry.ball.parry).toBeGreaterThan(.5);
    expect(attackParry.ball.z).toBeGreaterThan(attackContact.ball.z + 1);
    expect(Math.abs(attackParry.ball.x - attackContact.ball.x)).toBeGreaterThan(.3);
  });

  it('returns the shooter and opponent goalkeeper to a neutral pose after strike/dive recovery', () => {
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