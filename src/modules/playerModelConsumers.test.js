import { describe, expect, it } from 'vitest';
import { primaryRating, selectBench, teamStrength } from './matchEngine.js';
import { currentEffectiveLevel, normalizePlayerModel } from './playerModel.js';
import { roleSuitability } from './tactics.js';

function midfielder(id, overrides = {}) {
  return normalizePlayerModel({
    id,
    name:`Player ${id}`,
    position:'CM',
    attack:68,
    midfield:78,
    defence:70,
    goalkeeping:10,
    form:50,
    fitness:100,
    individualMorale:50,
    sharpness:50,
    ...overrides,
  });
}

describe('P3 effective player model consumer parity', () => {
  it('keeps the public rating seam identical to the canonical effective selector', () => {
    const ready = midfielder('ready', { form:82, individualMorale:78, sharpness:84 });
    const depleted = midfielder('depleted', { form:35, individualMorale:35, sharpness:30, fitness:58 });

    expect(primaryRating(ready)).toBe(Math.round(currentEffectiveLevel(ready)));
    expect(primaryRating(depleted)).toBe(Math.round(currentEffectiveLevel(depleted)));
    expect(primaryRating(ready)).toBeGreaterThan(primaryRating(depleted));
  });

  it('uses effective readiness when ranking bench players with equal durable ability', () => {
    const ready = midfielder('ready', { form:78, sharpness:82 });
    const depleted = midfielder('depleted', { form:32, sharpness:30, fitness:55 });
    const eleven = Array.from({ length:11 }, (_, index) => ({ id:`starter_${index}`, position:index === 0 ? 'GK' : 'CM' }));

    const bench = selectBench([depleted, ready], eleven);
    expect(bench.map(player => player.id)).toEqual(['ready', 'depleted']);
  });

  it('feeds the same short-term state into match strength without changing durable attributes', () => {
    const ready = midfielder('ready', { form:80, individualMorale:75, sharpness:85 });
    const depleted = midfielder('depleted', { form:30, individualMorale:30, sharpness:25, fitness:55 });
    const beforeReady = { attack:ready.attack, midfield:ready.midfield, defence:ready.defence };
    const beforeDepleted = { attack:depleted.attack, midfield:depleted.midfield, defence:depleted.defence };

    expect(teamStrength([ready]).midfield).toBeGreaterThan(teamStrength([depleted]).midfield);
    expect({ attack:ready.attack, midfield:ready.midfield, defence:ready.defence }).toEqual(beforeReady);
    expect({ attack:depleted.attack, midfield:depleted.midfield, defence:depleted.defence }).toEqual(beforeDepleted);
  });

  it('makes tactical role fit respond to the same effective readiness inputs', () => {
    const ready = midfielder('ready', { form:82, sharpness:82, individualMorale:75 });
    const depleted = midfielder('depleted', { form:30, sharpness:25, individualMorale:30, fitness:55 });

    expect(roleSuitability(ready, 'box_to_box')).toBeGreaterThan(roleSuitability(depleted, 'box_to_box'));
  });
});
