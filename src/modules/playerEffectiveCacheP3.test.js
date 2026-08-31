import { describe, expect, it } from 'vitest';

import { currentEffectiveLevel, effectiveLevelBreakdown } from './playerModel.js';

function player() {
  return {
    id:'cache-player',
    name:'Cache Player',
    position:'RW',
    attack:78,
    midfield:74,
    defence:42,
    goalkeeping:8,
    form:50,
    individualMorale:50,
    sharpness:50,
    fitness:100,
    injured:false,
    traits:['finisher'],
    positionSuitability:{ RW:1, ST:.72 },
    rehabilitation:null,
  };
}

describe('P3 effective-level hot selector cache', () => {
  it('stays identical to the canonical breakdown and invalidates on in-place state changes', () => {
    const subject = player();
    const expected = position => effectiveLevelBreakdown(subject, { position }).effectiveLevel;

    expect(currentEffectiveLevel(subject, { position:'ST' })).toBe(expected('ST'));
    expect(currentEffectiveLevel(subject, { position:'ST' })).toBe(expected('ST'));

    const beforeForm = currentEffectiveLevel(subject, { position:'ST' });
    subject.form = 86;
    expect(currentEffectiveLevel(subject, { position:'ST' })).toBe(expected('ST'));
    expect(currentEffectiveLevel(subject, { position:'ST' })).not.toBe(beforeForm);

    subject.positionSuitability.ST = .35;
    expect(currentEffectiveLevel(subject, { position:'ST' })).toBe(expected('ST'));

    subject.traits[0] = 'creator';
    expect(currentEffectiveLevel(subject, { position:'ST' })).toBe(expected('ST'));

    subject.rehabilitation = { status:'available_high_risk', matchReadiness:55 };
    expect(currentEffectiveLevel(subject, { position:'ST' })).toBe(expected('ST'));
    subject.rehabilitation.matchReadiness = 90;
    expect(currentEffectiveLevel(subject, { position:'ST' })).toBe(expected('ST'));

    subject.attack += 3;
    expect(currentEffectiveLevel(subject, { position:'ST' })).toBe(expected('ST'));
  });

  it('shares canonical results across shallow copies with the same stable player id', () => {
    const original = player();
    const first = currentEffectiveLevel(original, { position:'ST' });
    const copy = { ...original };

    expect(currentEffectiveLevel(copy, { position:'ST' })).toBe(first);
    expect(currentEffectiveLevel(copy, { position:'ST' }))
      .toBe(effectiveLevelBreakdown(copy, { position:'ST' }).effectiveLevel);

    copy.form = 20;
    expect(currentEffectiveLevel(copy, { position:'ST' }))
      .toBe(effectiveLevelBreakdown(copy, { position:'ST' }).effectiveLevel);
    expect(currentEffectiveLevel(original, { position:'ST' })).toBe(first);
  });
});
