import { describe, expect, it } from 'vitest';
import { sceneWorldFromMoment } from '../game/playableMomentsPocScene.js';
import {
  buildPlayableMoment,
  derivePlayableMomentStaging,
  resolveInteractiveShotOutcome,
} from './matchActionResolver.js';
import { PLAYABLE_CALIBRATION_POLICIES } from './playableMomentsCareer.js';

function player(id, position, rating = 76) {
  return {
    id,
    name:id,
    position,
    matchPosition:position,
    age:25,
    attack:rating,
    midfield:rating,
    defence:rating,
    goalkeeping:position === 'GK' ? rating : 10,
    fitness:100,
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

function packet(target = .5) {
  return {
    version:1,
    possession:.4,
    route:.5,
    actor:.4,
    target,
    defender:.4,
    execution:.2,
    outcome:.92,
    chance:.01,
    shooter:.2,
    shot:.50,
    finish:.90,
    assist:.8,
    discipline:.8,
    injury:.8,
  };
}

function prepared({ xg = .20, route = 'carry', target = .5, shooterRating = 82, defenderRating = 76, keeperRating = 80 } = {}) {
  const shooter = player('shooter', 'ST', shooterRating);
  const pressureDefender = player('cover', 'CB', defenderRating);
  const keeper = player('keeper', 'GK', keeperRating);
  return {
    version:1,
    phase:42,
    minute:32,
    teamId:'home',
    opponentTeamId:'away',
    attackers:[shooter],
    defenders:[keeper, pressureDefender],
    packet:packet(target),
    route,
    actor:shooter,
    target:null,
    defender:pressureDefender,
    execution:80,
    counter:75,
    context:0,
    successChance:.6,
    mentality:'balanced',
    riskMode:'normal',
    outcome:'chance_created',
    xg,
    chance:xg >= .28 ? 'high_quality_chance' : xg >= .14 ? 'medium_quality_chance' : 'low_quality_chance',
    shooter,
    assistId:null,
    pressureDefender,
  };
}

const SCENARIOS = Object.freeze([
  Object.freeze({ name:'central', args:{ xg:.20, route:'carry', target:.50 }, variant:'central_snapshot' }),
  Object.freeze({ name:'left channel', args:{ xg:.20, route:'carry', target:.12 }, variant:'left_channel_snapshot' }),
  Object.freeze({ name:'right channel', args:{ xg:.20, route:'carry', target:.88 }, variant:'right_channel_snapshot' }),
  Object.freeze({ name:'edge of box', args:{ xg:.09, route:'circulation', target:.50 }, variant:'edge_of_box_attempt' }),
  Object.freeze({ name:'close range', args:{ xg:.36, route:'carry', target:.50 }, variant:'close_range_attempt' }),
  Object.freeze({ name:'one on one deep', args:{ xg:.24, route:'pass_into_space', target:.38 }, variant:'one_on_one_deep_keeper' }),
  Object.freeze({ name:'one on one advancing', args:{ xg:.36, route:'pass_into_space', target:.62 }, variant:'one_on_one_advancing_keeper' }),
]);

function interactive(preparedPhase, intent, overrides = {}) {
  return resolveInteractiveShotOutcome({
    shooter:preparedPhase.shooter,
    defender:preparedPhase.pressureDefender,
    defenders:preparedPhase.defenders,
    xg:preparedPhase.xg,
    packet:{ ...preparedPhase.packet, ...overrides },
    intent,
  });
}

describe('Phase 3 representative geometry and calibration', () => {
  it('projects representative staging variants into visibly distinct world geometry', () => {
    const worlds = SCENARIOS.map(scenario => {
      const preparedPhase = prepared(scenario.args);
      expect(derivePlayableMomentStaging(preparedPhase).variant).toBe(scenario.variant);
      const moment = buildPlayableMoment(preparedPhase, 'home');
      const world = sceneWorldFromMoment(moment);
      return {
        variant:scenario.variant,
        signature:[world.shooter.x, world.shooter.z, world.keeper.z, world.defender.x, world.defender.z].join('|'),
      };
    });

    expect(new Set(worlds.map(item => item.signature)).size).toBe(SCENARIOS.length);
  });

  it.each(SCENARIOS)('$name keeps poor < average < strong < near-perfect attack execution', ({ args }) => {
    const preparedPhase = prepared(args);
    const qualities = ['poor', 'average', 'strong', 'nearPerfect'].map(policy => (
      interactive(preparedPhase, PLAYABLE_CALIBRATION_POLICIES[policy].attack).presentation.target.executionQuality
    ));

    expect(qualities[1]).toBeGreaterThan(qualities[0]);
    expect(qualities[2]).toBeGreaterThan(qualities[1]);
    expect(qualities[3]).toBeGreaterThan(qualities[2]);
  });

  it.each(SCENARIOS)('$name keeps shooter quality material for the same user input', ({ args }) => {
    const weak = prepared({ ...args, shooterRating:58 });
    const strong = prepared({ ...args, shooterRating:94 });
    const intent = PLAYABLE_CALIBRATION_POLICIES.strong.attack;

    expect(interactive(strong, intent).presentation.target.executionQuality)
      .toBeGreaterThan(interactive(weak, intent).presentation.target.executionQuality);
  });

  it.each(SCENARIOS)('$name keeps defensive pressure material to placement error', ({ args }) => {
    const low = prepared({ ...args, defenderRating:54 });
    const high = prepared({ ...args, defenderRating:94 });
    const intent = { attack:{ aimX:.25, aimY:.58, power:.74, timing:.84 } };
    const lowTarget = interactive(low, intent).presentation.target;
    const highTarget = interactive(high, intent).presentation.target;

    expect(Math.abs(highTarget.x - .25)).toBeGreaterThan(Math.abs(lowTarget.x - .25));
  });

  it.each(SCENARIOS)('$name keeps goalkeeper quality material to reachable save area', ({ args }) => {
    const weak = prepared({ ...args, keeperRating:55, defenderRating:60 });
    const strong = prepared({ ...args, keeperRating:94, defenderRating:60 });
    const intent = {
      attack:{ aimX:.30, aimY:.56, power:.72, timing:.90 },
      goalkeeper:{ x:.30, y:.56, timing:.80 },
    };
    const weakResolution = interactive(weak, intent, { finish:.50 });
    const strongResolution = interactive(strong, intent, { finish:.50 });

    expect(weakResolution.presentation.keeper).not.toBeNull();
    expect(strongResolution.presentation.keeper).not.toBeNull();
    expect(strongResolution.presentation.keeper.reach).toBeGreaterThan(weakResolution.presentation.keeper.reach);
  });
});
