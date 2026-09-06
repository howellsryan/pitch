import { describe, expect, it } from 'vitest';
import {
  derivePlayableContactAction,
  resolveContactShotOutcome,
} from './matchContactActions.js';

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
    possession:unit(17), route:unit(29), actor:unit(43), target:unit(59), defender:unit(71),
    execution:unit(83), outcome:unit(97), chance:unit(109), shooter:unit(127), shot:unit(149),
    finish:unit(167), assist:unit(181), discipline:unit(197), injury:unit(211),
  };
}

function preparedFor(family, phase, attackerRating = 82, defenderRating = 80, keeperRating = 80) {
  const shooter = player('receiver', 'ST', attackerRating);
  const passer = player('passer', family === 'cross' || family === 'cutback' ? 'RW' : 'CAM', 84);
  const defender = player('defender', 'CB', defenderRating);
  const keeper = player('keeper', 'GK', keeperRating);
  return {
    version:1,
    phase,
    minute:Math.ceil(phase * .75),
    teamId:'home',
    opponentTeamId:'away',
    packet:packet(1),
    attackers:[passer, shooter],
    defenders:[defender, keeper],
    actor:passer,
    target:shooter,
    defender,
    continuationAction:{
      version:1,
      family,
      phase,
      attackingTeamId:'home',
      defendingTeamId:'away',
      passerId:passer.id,
      receiverId:shooter.id,
    },
  };
}

function continuation(prepared, xg = .24) {
  return {
    version:1,
    family:prepared.continuationAction.family,
    success:true,
    outcome:'chance_created',
    passerId:prepared.actor.id,
    receiverId:prepared.target.id,
    interceptorId:prepared.defender.id,
    downstreamChance:{
      shooterId:prepared.target.id,
      assistId:prepared.actor.id,
      pressureDefenderId:prepared.defender.id,
      xg,
      chanceProbability:.32,
    },
  };
}

function findContact(family, type) {
  for (let phase = 1; phase <= 260; phase += 1) {
    const context = preparedFor(family, phase);
    const action = derivePlayableContactAction(context, continuation(context));
    if (action?.type === type) return { phase, action };
  }
  throw new Error(`Unable to find ${type}`);
}

function sample({ family, type, attackerRating = 82, defenderRating = 80, keeperRating = 80, timing = .82, count = 257 } = {}) {
  const found = findContact(family, type);
  const context = preparedFor(family, found.phase, attackerRating, defenderRating, keeperRating);
  const action = derivePlayableContactAction(context, continuation(context));
  let execution = 0;
  let saves = 0;
  let goals = 0;
  let targetError = 0;
  const aim = { x:.34, y:.56 };

  for (let index = 1; index <= count; index += 1) {
    const result = resolveContactShotOutcome({
      action,
      shooter:context.target,
      defender:context.defender,
      defenders:context.defenders,
      packet:packet(index),
      intent:{ attack:{ aimX:aim.x, aimY:aim.y, power:action.preferredPower, timing } },
    });
    execution += result.presentation.target.executionQuality ?? 0;
    targetError += Math.abs(result.presentation.target.x - aim.x) + Math.abs(result.presentation.target.y - aim.y);
    if (result.finish === 'saved') saves += 1;
    if (result.finish === 'goal') goals += 1;
  }

  return {
    meanExecution:execution / count,
    meanTargetError:targetError / count,
    saveRate:saves / count,
    goalRate:goals / count,
  };
}

const CONTACT_CASES = [
  ['cross','standing_header'],
  ['cross','running_header'],
  ['cutback','volley'],
  ['cutback','half_volley'],
];

describe('Phase 6 contact calibration', () => {
  it.each(CONTACT_CASES)('%s / %s keeps canonical attacker quality materially causal', (family, type) => {
    const weak = sample({ family, type, attackerRating:52, timing:.90 });
    const elite = sample({ family, type, attackerRating:94, timing:.90 });

    expect(elite.meanExecution).toBeGreaterThan(weak.meanExecution + .15);
    expect(elite.meanTargetError).toBeLessThan(weak.meanTargetError);
  });

  it.each(CONTACT_CASES)('%s / %s does not let perfect weak-player timing erase elite ability', (family, type) => {
    const weakPerfect = sample({ family, type, attackerRating:52, timing:1 });
    const eliteOrdinary = sample({ family, type, attackerRating:94, timing:.72 });

    expect(eliteOrdinary.meanExecution).toBeGreaterThan(weakPerfect.meanExecution + .08);
    expect(eliteOrdinary.meanTargetError).toBeLessThan(weakPerfect.meanTargetError);
  });

  it.each(CONTACT_CASES)('%s / %s makes stronger pressure widen execution error', (family, type) => {
    const lightPressure = sample({ family, type, defenderRating:55, timing:.86 });
    const heavyPressure = sample({ family, type, defenderRating:96, timing:.86 });

    expect(heavyPressure.meanTargetError).toBeGreaterThan(lightPressure.meanTargetError);
  });

  it.each(CONTACT_CASES)('%s / %s preserves goalkeeper quality across the same deterministic shots', (family, type) => {
    const weakKeeper = sample({ family, type, keeperRating:42, timing:.84 });
    const eliteKeeper = sample({ family, type, keeperRating:96, timing:.84 });

    expect(eliteKeeper.saveRate).toBeGreaterThan(weakKeeper.saveRate);
    expect(eliteKeeper.goalRate).toBeLessThan(weakKeeper.goalRate);
  });
});
