import { describe, expect, it } from 'vitest';
import { resolveInteractiveShotOutcome } from './matchActionResolver.js';
import { PLAYABLE_CALIBRATION_POLICIES } from './playableMomentsCareer.js';

function player(id, position, rating) {
  return {
    id,
    name:id,
    position,
    matchPosition:position,
    age:25,
    fitness:94,
    form:50,
    individualMorale:50,
    sharpness:50,
    attack:rating,
    midfield:rating,
    defence:rating,
    goalkeeping:position === 'GK' ? rating : 8,
    injured:false,
    suspended:false,
    inSquad:true,
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
    possession:.5,
    route:.5,
    actor:.5,
    target:.5,
    defender:.5,
    execution:.5,
    outcome:.9,
    chance:.5,
    shooter:.5,
    shot:.5,
    finish:.5,
    assist:.5,
    discipline:.9,
    injury:.9,
    ...overrides,
  };
}

function resolve({
  shooterRating = 80,
  defenderRating = 75,
  keeperRating = 80,
  xg = .24,
  rng = packet(),
  intent,
} = {}) {
  const shooter = player('shooter', 'ST', shooterRating);
  const defender = player('defender', 'CB', defenderRating);
  const keeper = player('keeper', 'GK', keeperRating);
  return resolveInteractiveShotOutcome({
    shooter,
    defender,
    defenders:[defender, keeper],
    xg,
    packet:rng,
    intent,
  });
}

function targetError(result, intended) {
  const target = result.presentation.target;
  return Math.hypot(target.x - intended.aimX, target.y - intended.aimY);
}

describe('Phase 2 interactive calibration contracts', () => {
  it('turns progressively better attack timing/control into progressively better execution quality', () => {
    const qualities = ['poor', 'average', 'strong', 'nearPerfect'].map(policy => {
      const intent = PLAYABLE_CALIBRATION_POLICIES[policy].attack;
      const result = resolve({ rng:packet({ outcome:.95, shot:.82, finish:.71 }), intent });
      return result.presentation.target.executionQuality;
    });

    expect(qualities[0]).toBeLessThan(qualities[1]);
    expect(qualities[1]).toBeLessThan(qualities[2]);
    expect(qualities[2]).toBeLessThan(qualities[3]);
  });

  it('keeps player ability authoritative even with the same near-perfect user input', () => {
    const intent = PLAYABLE_CALIBRATION_POLICIES.nearPerfect.attack;
    const rng = packet({ outcome:.95, shot:.86, finish:.76 });
    const weak = resolve({ shooterRating:58, rng, intent });
    const elite = resolve({ shooterRating:93, rng, intent });

    expect(elite.shooting).toBeGreaterThan(weak.shooting);
    expect(elite.presentation.target.executionQuality).toBeGreaterThan(weak.presentation.target.executionQuality);
    expect(targetError(elite, intent.attack)).toBeLessThan(targetError(weak, intent.attack));
  });

  it('makes defensive pressure degrade placement without changing the submitted intent', () => {
    const intent = PLAYABLE_CALIBRATION_POLICIES.strong.attack;
    const rng = packet({ outcome:.95, shot:.84, finish:.82 });
    const lightPressure = resolve({ defenderRating:55, rng, intent });
    const heavyPressure = resolve({ defenderRating:94, rng, intent });

    expect(heavyPressure.pressure).toBeGreaterThan(lightPressure.pressure);
    expect(targetError(heavyPressure, intent.attack)).toBeGreaterThan(targetError(lightPressure, intent.attack));
  });

  it('preserves xG context by making higher-quality chances no easier to block than low-xG chances', () => {
    const intent = PLAYABLE_CALIBRATION_POLICIES.average.attack;
    const blocked = xg => {
      let count = 0;
      for (let index = 0; index < 100; index += 1) {
        const result = resolve({
          xg,
          defenderRating:82,
          rng:packet({ outcome:(index + .5) / 100, shot:.68, finish:.63 }),
          intent,
        });
        if (result.finish === 'blocked') count += 1;
      }
      return count;
    };

    const lowQuality = blocked(.06);
    const highQuality = blocked(.44);
    expect(highQuality).toBeLessThan(lowQuality);
  });

  it('rewards a well-read goalkeeper input without turning the renderer into the authority', () => {
    const attack = { attack:{ aimX:.78, aimY:.78, power:.72, timing:.9 } };
    const rng = packet({ outcome:.95, shot:.5, finish:.5 });
    const poor = resolve({ intent:{ ...attack, ...PLAYABLE_CALIBRATION_POLICIES.poor.goalkeeper }, rng });
    const nearPerfect = resolve({ intent:{ ...attack, ...PLAYABLE_CALIBRATION_POLICIES.nearPerfect.goalkeeper }, rng });

    expect(poor.finish).toBe('goal');
    expect(nearPerfect.finish).toBe('saved');
    expect(poor.presentation.contact).toBe('goal');
    expect(nearPerfect.presentation.contact).toBe('save');
  });

  it('keeps goalkeeper ability material for the same positioning and timing input', () => {
    const intent = {
      attack:{ aimX:.60, aimY:.60, power:.72, timing:.9 },
      goalkeeper:{ x:.16, y:.60, timing:.70 },
    };
    const rng = packet({ outcome:.95, shot:.5, finish:.5 });
    const weakKeeper = resolve({ keeperRating:50, intent, rng });
    const eliteKeeper = resolve({ keeperRating:94, intent, rng });

    expect(eliteKeeper.goalkeeping).toBeGreaterThan(weakKeeper.goalkeeping);
    expect(weakKeeper.finish).toBe('goal');
    expect(eliteKeeper.finish).toBe('saved');
  });
});
