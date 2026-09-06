import { describe, expect, it } from 'vitest';
import {
  MATCH_CONTINUATION_ACTION_VERSION,
  buildContinuationPlayableGeometry,
  deriveFinalPassContinuation,
  normalizeContinuationIntent,
  resolveContinuationAction,
} from './matchContinuationActions.js';

function player(id, position, rating = 80) {
  const isKeeper = position === 'GK';
  return {
    id,
    name:id,
    position,
    matchPosition:position,
    age:25,
    attack:rating,
    midfield:rating,
    defence:rating,
    goalkeeping:isKeeper ? rating : 8,
    fitness:96,
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
    },
  };
}

function packet(overrides = {}) {
  return {
    version:1,
    possession:.42,
    route:.58,
    actor:.22,
    target:.71,
    defender:.36,
    execution:.30,
    outcome:.52,
    chance:.04,
    shooter:.64,
    shot:.40,
    finish:.30,
    assist:.48,
    discipline:.72,
    injury:.81,
    ...overrides,
  };
}

function prepared(overrides = {}) {
  const passer = overrides.actor ?? player('passer', 'CAM', 84);
  const receiver = overrides.target ?? player('receiver', 'ST', 86);
  const interceptor = overrides.defender ?? player('interceptor', 'CB', 82);
  const goalkeeper = player('keeper', 'GK', 82);
  return {
    version:1,
    phase:58,
    minute:44,
    teamId:'home',
    opponentTeamId:'away',
    attackers:[passer, receiver, player('wing', 'LW', 80), player('mid', 'CM', 78)],
    defenders:[goalkeeper, interceptor, player('cb-2', 'CB', 80), player('dm', 'CDM', 79)],
    packet:packet(),
    route:'pass_into_space',
    actor:passer,
    target:receiver,
    defender:interceptor,
    execution:84,
    counter:82,
    context:2,
    successChance:.61,
    mentality:'balanced',
    riskMode:'normal',
    ...overrides,
  };
}

describe('Phase 5 final-pass continuation authority', () => {
  it('derives the same continuation before execution/chance/shot/finish outcomes are known', () => {
    const first = deriveFinalPassContinuation(prepared({
      packet:packet({ execution:.01, chance:.01, shot:.01, finish:.01 }),
    }));
    const second = deriveFinalPassContinuation(prepared({
      packet:packet({ execution:.99, chance:.99, shot:.99, finish:.99 }),
    }));

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      version:MATCH_CONTINUATION_ACTION_VERSION,
      family:'through_ball',
      sourceRoute:'pass_into_space',
      passerId:'passer',
      receiverId:'receiver',
      interceptorId:'interceptor',
      authorizedReceiverIds:['receiver'],
      receiverOnsideAuthorized:true,
      failureOutcome:'intercepted',
    });
    expect(first.downstream.projectedXg).toBeGreaterThan(0);
    expect(first.downstream.chanceProbability).toBeGreaterThan(0);
  });

  it('uses direct-pass and pass-into-space semantics but rejects unrelated routes', () => {
    expect(deriveFinalPassContinuation(prepared({ route:'pass_into_space' }))?.family).toBe('through_ball');
    expect(deriveFinalPassContinuation(prepared({ route:'direct_pass' }))?.family).toBe('final_pass');
    expect(deriveFinalPassContinuation(prepared({ route:'carry' }))).toBeNull();
    expect(deriveFinalPassContinuation(prepared({ route:'wide_delivery' }))).toBeNull();
  });

  it('keeps the route target as the only authorized receiver in v1', () => {
    const action = deriveFinalPassContinuation(prepared());
    expect(action.authorizedReceiverIds).toEqual(['receiver']);
    expect(action.receiverId).toBe('receiver');
    expect(action.receiverId).not.toBe(action.passerId);
  });

  it('normalizes execution intent without allowing presentation to replace the receiver', () => {
    const intent = normalizeContinuationIntent({
      continuation:{ targetX:4, targetY:-2, weight:1.8, timing:-1, receiverId:'invented-player' },
    });

    expect(intent).toEqual({
      version:1,
      targetX:1,
      targetY:0,
      weight:1,
      timing:0,
    });
    expect(intent.receiverId).toBeUndefined();
  });

  it('resolves automatic failure without manufacturing a downstream chance', () => {
    const context = prepared({ packet:packet({ execution:.99, chance:.01 }) });
    const action = deriveFinalPassContinuation(context);
    const result = resolveContinuationAction({
      action,
      passer:context.actor,
      receiver:context.target,
      defender:context.defender,
      packet:context.packet,
      intent:null,
    });

    expect(result.success).toBe(false);
    expect(result.outcome).toBe('intercepted');
    expect(result.downstreamChance).toBeNull();
    expect(result.receiverId).toBe('receiver');
    expect(result.interceptorId).toBe('interceptor');
  });

  it('can authorize exactly one downstream shot after a successful continuation', () => {
    const context = prepared({ packet:packet({ execution:.01, chance:.01 }) });
    const action = deriveFinalPassContinuation(context);
    const result = resolveContinuationAction({
      action,
      passer:context.actor,
      receiver:context.target,
      defender:context.defender,
      packet:context.packet,
      intent:null,
    });

    expect(result.success).toBe(true);
    expect(result.outcome).toBe('chance_created');
    expect(result.downstreamChance).toMatchObject({
      shooterId:'receiver',
      assistId:'passer',
      pressureDefenderId:'interceptor',
    });
    expect(result.downstreamChance.xg).toBeGreaterThan(0);
    expect(result.finish).toBeUndefined();
  });

  it('keeps canonical player quality material alongside bounded user execution', () => {
    const weak = prepared({ actor:player('passer', 'CAM', 58), target:player('receiver', 'ST', 66), defender:player('interceptor', 'CB', 84) });
    const strong = prepared({ actor:player('passer', 'CAM', 94), target:player('receiver', 'ST', 92), defender:player('interceptor', 'CB', 72) });
    const weakAction = deriveFinalPassContinuation(weak);
    const strongAction = deriveFinalPassContinuation(strong);
    const goodIntent = { continuation:{ targetX:0, targetY:.72, weight:.72, timing:.94 } };

    const weakResult = resolveContinuationAction({ action:weakAction, passer:weak.actor, receiver:weak.target, defender:weak.defender, packet:packet({ execution:.45, chance:.10 }), intent:goodIntent });
    const strongResult = resolveContinuationAction({ action:strongAction, passer:strong.actor, receiver:strong.target, defender:strong.defender, packet:packet({ execution:.45, chance:.10 }), intent:goodIntent });

    expect(strongResult.successChance).toBeGreaterThan(weakResult.successChance);
    expect(strongResult.executionQuality).toBeGreaterThan(weakResult.executionQuality);
  });

  it('projects deterministic pre-outcome pass geometry with no continuous locomotion authority', () => {
    const action = deriveFinalPassContinuation(prepared());
    const geometry = buildContinuationPlayableGeometry(action);

    expect(geometry.staging.variant).toBe('through_ball');
    expect(geometry.legalActions).toEqual(['target', 'weight', 'timing']);
    expect(geometry.continuousLocomotion).toBe(false);
    expect(geometry.passer.id).toBe('passer');
    expect(geometry.receiver.id).toBe('receiver');
    expect(geometry.interceptor.id).toBe('interceptor');
    expect(geometry.ball).toBeTruthy();
  });
});
