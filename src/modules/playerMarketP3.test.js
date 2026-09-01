import { describe, expect, it } from 'vitest';
import { baselineLevel, currentEffectiveLevel } from './playerModel.js';
import { _fav_primaryRating, formAdjustedValue, playerMinRepToSign } from './transfers.js';

function player(overrides = {}) {
  return {
    id:'market-player', name:'Market Player', position:'CM', age:24,
    attack:70, midfield:78, defence:66, goalkeeping:10,
    value:20_000_000, potentialRating:86, form:50,
    individualMorale:50, sharpness:50, fitness:100,
    ...overrides,
  };
}

describe('P3 transfer-market selector parity', () => {
  it('keeps neutral current quality equal to durable baseline', () => {
    const subject = player();
    expect(_fav_primaryRating(subject)).toBe(baselineLevel(subject));
    expect(_fav_primaryRating(subject)).toBe(currentEffectiveLevel(subject));
  });

  it('uses the same readiness-aware current quality as the rest of P3', () => {
    const ready = player({ form:82, individualMorale:76, sharpness:85 });
    const depleted = player({ form:25, individualMorale:25, sharpness:20, fitness:45 });

    expect(_fav_primaryRating(ready)).toBe(currentEffectiveLevel(ready));
    expect(_fav_primaryRating(depleted)).toBe(currentEffectiveLevel(depleted));
    expect(_fav_primaryRating(ready)).toBeGreaterThan(_fav_primaryRating(depleted));
    expect(playerMinRepToSign(ready)).toBeGreaterThanOrEqual(playerMinRepToSign(depleted));
  });

  it('keeps transfer valuation bounded while responding to current state', () => {
    const neutral = formAdjustedValue(player());
    const hot = formAdjustedValue(player({ form:85, individualMorale:80, sharpness:85 }));
    const cold = formAdjustedValue(player({ form:25, individualMorale:25, sharpness:20, fitness:45 }));

    expect(hot).toBeGreaterThan(neutral);
    expect(cold).toBeLessThan(neutral);
    expect(cold).toBeGreaterThanOrEqual(500_000);
    expect(hot).toBeLessThanOrEqual(80_000_000);
  });
});