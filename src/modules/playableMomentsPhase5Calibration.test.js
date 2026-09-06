import { describe, expect, it } from 'vitest';
import { resolveShotOutcome } from './matchActionResolver.js';
import {
  deriveAuthoritativeContinuationAction,
  resolveContinuationAction,
} from './matchContinuationActions.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function player(id, position, rating = 80, profile = {}) {
  return {
    id,
    name:id,
    position,
    matchPosition:position,
    age:25,
    attack:rating,
    midfield:rating,
    defence:rating,
    goalkeeping:position === 'GK' ? rating : 8,
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
      ...profile,
    },
  };
}

function packet(index) {
  const unit = multiplier => (((index * multiplier) % 997) + .5) / 997;
  return {
    version:1,
    possession:unit(17),
    route:unit(29),
    actor:unit(43),
    target:unit(59),
    defender:unit(71),
    execution:unit(83),
    outcome:unit(97),
    chance:unit(109),
    shooter:unit(127),
    shot:unit(149),
    finish:unit(167),
    assist:unit(181),
    discipline:unit(197),
    injury:unit(211),
  };
}

function prepared({ route = 'pass_into_space', phase = 58, passerRating = 82, receiverRating = 84, defenderRating = 80 } = {}) {
  const actor = player('passer', route === 'wide_delivery' ? 'RW' : 'CAM', passerRating, { passing:passerRating + 2 });
  const target = player('receiver', 'ST', receiverRating, { pace:receiverRating + 1, shooting:receiverRating + 2 });
  const defender = player('interceptor', 'CB', defenderRating, { defending:defenderRating + 2 });
  return {
    version:1,
    phase,
    minute:44,
    teamId:'home',
    opponentTeamId:'away',
    attackers:[actor, target],
    defenders:[player('keeper', 'GK', 80), defender],
    packet:packet(1),
    route,
    actor,
    target,
    defender,
    execution:82,
    counter:80,
    context:2,
    successChance:.61,
    mentality:'balanced',
    riskMode:'normal',
  };
}

function preferredWeight(family) {
  if (family === 'through_ball') return .76;
  if (family === 'cutback') return .58;
  if (family === 'cross') return .72;
  return .68;
}

function intentFor(action, quality) {
  const target = action.targetZone;
  const preferred = preferredWeight(action.family);
  if (quality === 'poor') {
    return { continuation:{
      targetX:target.x >= 0 ? -1 : 1,
      targetY:target.y >= .5 ? 0 : 1,
      weight:preferred > .5 ? .05 : .95,
      timing:.08,
    } };
  }
  if (quality === 'average') {
    return { continuation:{
      targetX:clamp(target.x + .24, -1, 1),
      targetY:clamp(target.y + .18, 0, 1),
      weight:clamp(preferred + .16, 0, 1),
      timing:.56,
    } };
  }
  if (quality === 'strong') {
    return { continuation:{
      targetX:clamp(target.x + .05, -1, 1),
      targetY:clamp(target.y + .04, 0, 1),
      weight:clamp(preferred + .04, 0, 1),
      timing:.86,
    } };
  }
  return { continuation:{
    targetX:target.x,
    targetY:target.y,
    weight:preferred,
    timing:1,
  } };
}

function sampleContinuation(context, intent, count = 997) {
  const action = deriveAuthoritativeContinuationAction(context);
  const keeper = context.defenders.find(subject => subject.position === 'GK');
  let successes = 0;
  let chances = 0;
  let goals = 0;
  let xgTotal = 0;
  let successChanceTotal = 0;
  let executionQualityTotal = 0;

  for (let index = 1; index <= count; index += 1) {
    const phasePacket = packet(index);
    const result = resolveContinuationAction({
      action,
      passer:context.actor,
      receiver:context.target,
      defender:context.defender,
      packet:phasePacket,
      intent,
    });
    successChanceTotal += result.successChance;
    executionQualityTotal += result.executionQuality;
    if (result.success) successes += 1;
    if (!result.downstreamChance) continue;
    chances += 1;
    xgTotal += result.downstreamChance.xg;
    const shot = resolveShotOutcome({
      shooter:context.target,
      defender:context.defender,
      defenders:[context.defender, keeper],
      xg:result.downstreamChance.xg,
      packet:phasePacket,
    });
    if (shot.goal) goals += 1;
  }

  return {
    action,
    successRate:successes / count,
    chanceRate:chances / count,
    goalRate:goals / count,
    meanCreatedXg:chances ? xgTotal / chances : 0,
    meanSuccessChance:successChanceTotal / count,
    meanExecutionQuality:executionQualityTotal / count,
  };
}

function wideContextForFamily(family) {
  for (let phase = 1; phase <= 80; phase += 1) {
    const context = prepared({ route:'wide_delivery', phase });
    const action = deriveAuthoritativeContinuationAction(context);
    if (action?.family === family) return context;
  }
  throw new Error(`Could not derive deterministic ${family} context`);
}

function contextForFamily(family) {
  if (family === 'through_ball') return prepared({ route:'pass_into_space' });
  if (family === 'final_pass') return prepared({ route:'direct_pass' });
  return wideContextForFamily(family);
}

describe('Phase 5 continuation calibration', () => {
  it.each(['through_ball', 'final_pass', 'cutback', 'cross'])('%s keeps user execution ordered without overpowering canonical context', family => {
    const context = contextForFamily(family);
    const action = deriveAuthoritativeContinuationAction(context);
    const poor = sampleContinuation(context, intentFor(action, 'poor'));
    const average = sampleContinuation(context, intentFor(action, 'average'));
    const strong = sampleContinuation(context, intentFor(action, 'strong'));
    const nearPerfect = sampleContinuation(context, intentFor(action, 'near_perfect'));

    expect(action.family).toBe(family);
    expect(average.meanExecutionQuality).toBeGreaterThan(poor.meanExecutionQuality);
    expect(strong.meanExecutionQuality).toBeGreaterThan(average.meanExecutionQuality);
    expect(nearPerfect.meanExecutionQuality).toBeGreaterThan(strong.meanExecutionQuality);
    expect(average.successRate).toBeGreaterThan(poor.successRate);
    expect(strong.successRate).toBeGreaterThan(average.successRate);
    expect(nearPerfect.successRate).toBeGreaterThanOrEqual(strong.successRate);
    expect(nearPerfect.chanceRate).toBeGreaterThan(poor.chanceRate);
    expect(nearPerfect.goalRate).toBeGreaterThanOrEqual(poor.goalRate);
  });

  it('keeps stronger passer and receiver quality materially better for identical execution', () => {
    const weak = prepared({ passerRating:60, receiverRating:64, defenderRating:82 });
    const strong = prepared({ passerRating:94, receiverRating:92, defenderRating:82 });
    const weakAction = deriveAuthoritativeContinuationAction(weak);
    const strongAction = deriveAuthoritativeContinuationAction(strong);
    const weakSample = sampleContinuation(weak, intentFor(weakAction, 'strong'));
    const strongSample = sampleContinuation(strong, intentFor(strongAction, 'strong'));

    expect(strongSample.meanSuccessChance).toBeGreaterThan(weakSample.meanSuccessChance + .10);
    expect(strongSample.successRate).toBeGreaterThan(weakSample.successRate);
    expect(strongSample.chanceRate).toBeGreaterThan(weakSample.chanceRate);
  });

  it('lets stronger interception context suppress the same passer/receiver/user execution', () => {
    const weakDefence = prepared({ passerRating:84, receiverRating:86, defenderRating:58 });
    const strongDefence = prepared({ passerRating:84, receiverRating:86, defenderRating:96 });
    const weakAction = deriveAuthoritativeContinuationAction(weakDefence);
    const strongAction = deriveAuthoritativeContinuationAction(strongDefence);
    const weakSample = sampleContinuation(weakDefence, intentFor(weakAction, 'strong'));
    const strongSample = sampleContinuation(strongDefence, intentFor(strongAction, 'strong'));

    expect(weakSample.meanSuccessChance).toBeGreaterThan(strongSample.meanSuccessChance + .05);
    expect(weakSample.successRate).toBeGreaterThan(strongSample.successRate);
    expect(weakSample.chanceRate).toBeGreaterThan(strongSample.chanceRate);
  });

  it('keeps cutbacks higher-value than crosses without introducing Phase 6 aerial finish semantics', () => {
    const cutback = wideContextForFamily('cutback');
    const cross = wideContextForFamily('cross');
    const cutbackAction = deriveAuthoritativeContinuationAction(cutback);
    const crossAction = deriveAuthoritativeContinuationAction(cross);
    const cutbackSample = sampleContinuation(cutback, intentFor(cutbackAction, 'strong'));
    const crossSample = sampleContinuation(cross, intentFor(crossAction, 'strong'));

    expect(cutbackAction.downstream.projectedXg).toBeGreaterThan(crossAction.downstream.projectedXg);
    expect(cutbackSample.meanCreatedXg).toBeGreaterThan(crossSample.meanCreatedXg);
    expect(crossAction).not.toHaveProperty('contactType');
    expect(crossAction).not.toHaveProperty('header');
    expect(crossAction).not.toHaveProperty('volley');
  });
});
