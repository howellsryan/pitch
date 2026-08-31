import { describe, expect, it } from 'vitest';
import {
  PLAYER_TRAIT_DEFS,
  assignDefaultTraits,
  defaultPositionSuitability,
  positionFitLabel,
  settlePositionConversion,
  slotSuitability,
  startPositionConversion,
  traitAttributeModifier,
  traitRecruitmentLabels,
} from './playerPathways.js';

function player(overrides = {}) {
  return {
    id:'p1', name:'Player One', position:'CM', age:20,
    attack:70, midfield:82, defence:68, goalkeeping:10,
    sharpness:80, positionSuitability:{ CM:1 }, traits:[],
    ...overrides,
  };
}

describe('P3 position suitability', () => {
  it('keeps primary position perfect and applies deterministic related-position costs', () => {
    expect(defaultPositionSuitability('CM', 'CM')).toBe(1);
    expect(defaultPositionSuitability('CM', 'CAM')).toBe(.72);
    expect(defaultPositionSuitability('CM', 'RM')).toBe(.72);
    expect(defaultPositionSuitability('CM', 'ST')).toBe(.28);
    expect(defaultPositionSuitability('GK', 'CB')).toBe(0);
    expect(slotSuitability(player(), 'CM')).toBe(1);
    expect(slotSuitability(player(), 'CAM')).toBe(.72);
  });

  it('prefers persisted learned suitability over fallback compatibility', () => {
    const subject = player({ positionSuitability:{ CM:1, CAM:.86 } });
    expect(slotSuitability(subject, 'CAM')).toBe(.86);
    expect(positionFitLabel(.86)).toBe('Comfortable');
    expect(positionFitLabel(.2)).toBe('Emergency');
  });
});

describe('P3 position conversion', () => {
  it('starts a gradual conversion without replacing primary position', () => {
    const started = startPositionConversion(player(), 'CAM', '2025/26', 10);
    expect(started.position).toBe('CM');
    expect(started.positionConversion.targetPosition).toBe('CAM');
    expect(started.positionConversion.progress).toBe(.72);
  });

  it('settles deterministically once per week and completes into persisted suitability', () => {
    let subject = startPositionConversion(player({ positionSuitability:{ CM:1, CAM:.9 } }), 'CAM', '2025/26', 10);
    const first = settlePositionConversion(subject, 11, '2025/26');
    expect(first.position).toBe('CM');
    expect(first.positionSuitability.CM).toBe(1);
    expect(first.positionSuitability.CAM).toBe(1);
    expect(first.positionConversion).toBeNull();

    subject = startPositionConversion(player(), 'CAM', '2025/26', 10);
    const week11 = settlePositionConversion(subject, 11, '2025/26');
    expect(settlePositionConversion(week11, 11, '2025/26')).toBe(week11);
  });

  it('refuses goalkeeper/outfield instant conversions', () => {
    const gk = player({ position:'GK', goalkeeping:80, positionSuitability:{ GK:1 } });
    expect(startPositionConversion(gk, 'CB', '2025/26', 1)).toBe(gk);
    expect(startPositionConversion(player(), 'GK', '2025/26', 1)).toBe(player());
  });
});

describe('P3 configured traits', () => {
  it('keeps the first trait set deliberately small and config driven', () => {
    expect(Object.keys(PLAYER_TRAIT_DEFS).length).toBeLessThanOrEqual(8);
    const traits = assignDefaultTraits(player());
    expect(traits.length).toBeLessThanOrEqual(2);
    for (const trait of traits) expect(PLAYER_TRAIT_DEFS[trait]).toBeTruthy();
  });

  it('provides bounded engine and recruitment projections', () => {
    const subject = player({ traits:['creator','ball_winner','not_real'] });
    expect(traitAttributeModifier(subject, 'midfield')).toBe(1.3);
    expect(traitAttributeModifier(subject, 'defence')).toBe(1.3);
    expect(traitRecruitmentLabels(subject)).toEqual(['Creator','Ball winner']);
  });
});
