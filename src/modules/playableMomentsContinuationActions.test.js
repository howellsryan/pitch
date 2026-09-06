import { describe, expect, it } from 'vitest';
import {
  MATCH_CONTINUATION_ACTION_VERSION,
  buildContinuationPlayableGeometry,
  deriveAuthoritativeContinuationAction,
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

describe('Phase 5 continuation authority', () => {
  it('derives the same final-pass continuation before execution/chance/shot/finish outcomes are known', () => {
    const first = deriveAuthoritativeContinuationAction(prepared({
      packet:packet({ execution:.01, chance:.01, shot:.01, finish:.01 }),
    }));
    const second = deriveAuthoritativeContinuationAction(prepared({
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

  it('maps progression routes into final-pass families and keeps carry out of the continuation seam', () => {
    expect(deriveAuthoritativeContinuationAction(prepared({ route:'pass_into_space' }))?.family).toBe('through_ball');
    expect(deriveAuthoritativeContinuationAction(prepared({ route:'direct_pass' }))?.family).toBe('final_pass');
    expect(deriveAuthoritativeContinuationAction(prepared({ route:'carry' }))).toBeNull();
    expect(deriveFinalPassContinuation(prepared({ route:'wide_delivery' }))).toBeNull();
  });

  it('derives wide delivery as a cutback or cross without consulting terminal shot outcomes', () => {
    let cutback = null;
    let cross = null;
    for (let phase = 1; phase <= 40 && (!cutback || !cross); phase += 1) {
      const candidate = prepared({ route:'wide_delivery', phase });
      const first = deriveAuthoritativeContinuationAction({
        ...candidate,
        packet:packet({ execution:.01, chance:.01, shot:.01, finish:.01 }),
      });
      const second = deriveAuthoritativeContinuationAction({
        ...candidate,
        packet:packet({ execution:.99, chance:.99, shot:.99, finish:.99 }),
      });
      expect(first).toEqual(second);
      if (first?.family === 'cutback') cutback = first;
      if (first?.family === 'cross') cross = first;
    }

    expect(cutback).toMatchObject({ sourceRoute:'wide_delivery', failureOutcome:'cleared', receiverId:'receiver' });
    expect(cross).toMatchObject({ sourceRoute:'wide_delivery', failureOutcome:'cleared', receiverId:'receiver' });
    expect(cutback.downstream.projectedXg).toBeGreaterThan(cross.downstream.projectedXg);
    expect(cutback.targetZone.y).toBeLessThan(cross.targetZone.y);
  });

  it('keeps the route target as the only authorized receiver in v1', () => {
    for (const route of ['pass_into_space','direct_pass','wide_delivery']) {
      const action = deriveAuthoritativeContinuationAction(prepared({ route }));
      expect(action.authorizedReceiverIds).toEqual(['receiver']);
      expect(action.receiverId).toBe('receiver');
      expect(action.receiverId).not.toBe(action.passerId);
    }
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
    const action = deriveAuthoritativeContinuationAction(context);
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
    const action = deriveAuthoritativeContinuationAction(context);
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
    const weakAction = deriveAuthoritativeContinuationAction(weak);
    const strongAction = deriveAuthoritativeContinuationAction(strong);
    const goodIntent = { continuation:{ targetX:0, targetY:.72, weight:.72, timing:.94 } };

    const weakResult = resolveContinuationAction({ action:weakAction, passer:weak.actor, receiver:weak.target, defender:weak.defender, packet:packet({ execution:.45, chance:.10 }), intent:goodIntent });
    const strongResult = resolveContinuationAction({ action:strongAction, passer:strong.actor, receiver:strong.target, defender:strong.defender, packet:packet({ execution:.45, chance:.10 }), intent:goodIntent });

    expect(strongResult.successChance).toBeGreaterThan(weakResult.successChance);
    expect(strongResult.executionQuality).toBeGreaterThan(weakResult.executionQuality);
  });

  it('projects distinct deterministic pass geometry with no continuous locomotion authority', () => {
    const through = buildContinuationPlayableGeometry(deriveAuthoritativeContinuationAction(prepared()));
    expect(through.staging.variant).toBe('through_ball');
    expect(through.legalActions).toEqual(['target', 'weight', 'timing']);
    expect(through.continuousLocomotion).toBe(false);
    expect(through.passer.id).toBe('passer');
    expect(through.receiver.id).toBe('receiver');
    expect(through.interceptor.id).toBe('interceptor');
    expect(through.ball).toBeTruthy();

    let cutback = null;
    let cross = null;
    for (let phase = 1; phase <= 40 && (!cutback || !cross); phase += 1) {
      const geometry = buildContinuationPlayableGeometry(deriveAuthoritativeContinuationAction(prepared({ route:'wide_delivery', phase })));
      if (geometry?.staging.variant === 'cutback') cutback = geometry;
      if (geometry?.staging.variant === 'cross') cross = geometry;
    }
    expect(Math.abs(cutback.passer.x)).toBeGreaterThan(Math.abs(cutback.receiver.x));
    expect(Math.abs(cross.passer.x)).toBeGreaterThan(Math.abs(cross.receiver.x));
    expect(cutback.receiver.z).toBeGreaterThan(cutback.passer.z);
    expect(cross.receiver.z).toBeLessThan(cross.passer.z);
  });
});
