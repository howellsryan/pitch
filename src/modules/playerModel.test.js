import { describe, expect, it } from 'vitest';
import { primaryRating, positionGroup } from './matchEngine.js';
import { _primaryRating } from './potential.js';
import { _fav_primaryRating } from './transfers.js';
import {
  DEFAULT_INDIVIDUAL_MORALE,
  DEFAULT_SHARPNESS,
  EFFECTIVE_LEVEL_LIMITS,
  MAX_PLAYER_TRAITS,
  PLAYER_MODEL_VERSION,
  baselineAttribute,
  baselineLevel,
  currentEffectiveLevel,
  effectiveAttribute,
  effectiveLevelBreakdown,
  normalizePlayerModel,
  normalizePlayerTraits,
  normalizePositionSuitability,
  playerModelNeedsNormalization,
  playerPositionGroup,
  positionSuitabilityFor,
  rehabilitationReadiness,
} from './playerModel.js';

const RATINGS = { attack:91, midfield:82, defence:73, goalkeeping:64 };

function player(position) {
  return { id:`p_${position}`, position, ...RATINGS };
}

const CASES = [
  ['ST', 'ATT', 'attack'], ['CF', 'ATT', 'attack'], ['RW', 'ATT', 'attack'],
  ['LW', 'ATT', 'attack'], ['CAM', 'ATT', 'attack'],
  ['CM', 'MID', 'midfield'], ['CDM', 'MID', 'midfield'], ['RM', 'MID', 'midfield'], ['LM', 'MID', 'midfield'],
  ['CB', 'DEF', 'defence'], ['RB', 'DEF', 'defence'], ['LB', 'DEF', 'defence'],
  ['GK', 'GK', 'goalkeeping'],
];

describe('P3 canonical player-model baseline selectors', () => {
  it('versions the canonical player-model contract', () => {
    expect(PLAYER_MODEL_VERSION).toBe(1);
  });

  it.each(CASES)('preserves established %s grouping and baseline rating', (position, group, attribute) => {
    const subject = player(position);
    expect(playerPositionGroup(position)).toBe(group);
    expect(baselineAttribute(position)).toBe(attribute);
    expect(baselineLevel(subject)).toBe(RATINGS[attribute]);

    // Existing public helpers stay baseline-compatible until their caller is
    // intentionally migrated to the effective selector.
    expect(positionGroup(position)).toBe(group);
    expect(primaryRating(subject)).toBe(RATINGS[attribute]);
    expect(_primaryRating(subject)).toBe(RATINGS[attribute]);
    expect(_fav_primaryRating(subject)).toBe(RATINGS[attribute]);
  });

  it('keeps the historical midfield fallback for unknown positions', () => {
    const subject = player('UNKNOWN');
    expect(playerPositionGroup(subject.position)).toBe('MID');
    expect(baselineAttribute(subject.position)).toBe('midfield');
    expect(baselineLevel(subject)).toBe(subject.midfield);
  });

  it('can project a target position without mutating primary identity', () => {
    const subject = player('ST');
    expect(baselineLevel(subject, 'CM')).toBe(subject.midfield);
    expect(subject.position).toBe('ST');
  });

  it('keeps neutral or absent P3 state default-equivalent', () => {
    const subject = player('CB');
    const before = { ...subject };
    expect(currentEffectiveLevel(subject)).toBe(baselineLevel(subject));
    expect(currentEffectiveLevel(subject, { position:'CM' })).toBe(subject.midfield);
    expect(subject).toEqual(before);
  });

  it('is safe for a missing player during projections', () => {
    expect(baselineLevel(null)).toBeUndefined();
    expect(currentEffectiveLevel(undefined)).toBeUndefined();
    expect(effectiveLevelBreakdown(null)).toBeUndefined();
    expect(effectiveAttribute(undefined, 'attack')).toBeUndefined();
  });
});

describe('P3 bounded effective level', () => {
  it('applies an explicit secondary-position cost without penalising missing WP4 data', () => {
    const subject = normalizePlayerModel({
      ...player('CM'),
      positionSuitability:{ CM:1, CDM:0.5 },
    });
    expect(positionSuitabilityFor(subject, 'CM')).toBe(1);
    expect(positionSuitabilityFor(subject, 'CDM')).toBe(0.5);
    expect(positionSuitabilityFor(subject, 'CAM')).toBe(1);
    expect(currentEffectiveLevel(subject, { position:'CDM' })).toBe(78);
  });

  it('gives every short-term state input an independently bounded contribution', () => {
    const baseline = baselineLevel(player('CB'));
    expect(currentEffectiveLevel({ ...player('CB'), form:100 })).toBe(baseline + EFFECTIVE_LEVEL_LIMITS.formSwing);
    expect(currentEffectiveLevel({ ...player('CB'), individualMorale:100 })).toBe(baseline + EFFECTIVE_LEVEL_LIMITS.moraleSwing);
    expect(currentEffectiveLevel({ ...player('CB'), sharpness:100 })).toBe(baseline + EFFECTIVE_LEVEL_LIMITS.sharpnessSwing);
    expect(currentEffectiveLevel({ ...player('CB'), fitness:0 })).toBe(baseline - EFFECTIVE_LEVEL_LIMITS.fitnessPenalty);
    expect(currentEffectiveLevel({ ...player('CB'), rehabilitation:{ matchReadiness:0 } })).toBe(baseline - EFFECTIVE_LEVEL_LIMITS.rehabilitationPenalty);
  });

  it('caps combined uplift and drop so transient state cannot become another overall rating', () => {
    const boosted = {
      ...player('CM'),
      form:100,
      individualMorale:100,
      sharpness:100,
      fitness:100,
    };
    const depleted = {
      ...player('CM'),
      positionSuitability:{ CM:1, CDM:0 },
      form:0,
      individualMorale:0,
      sharpness:0,
      fitness:0,
      rehabilitation:{ readiness:0 },
    };
    expect(currentEffectiveLevel(boosted)).toBe(RATINGS.midfield + EFFECTIVE_LEVEL_LIMITS.maxUplift);
    expect(currentEffectiveLevel(depleted, { position:'CDM' })).toBe(RATINGS.midfield - EFFECTIVE_LEVEL_LIMITS.maxDrop);
  });

  it('exposes one explainable breakdown and does not mutate the player', () => {
    const subject = normalizePlayerModel({
      ...player('ST'),
      form:75,
      individualMorale:60,
      sharpness:80,
      fitness:75,
    });
    const before = structuredClone(subject);
    const breakdown = effectiveLevelBreakdown(subject);

    expect(breakdown.baseline).toBe(RATINGS.attack);
    expect(Object.keys(breakdown.contributions)).toEqual([
      'positionFit', 'form', 'morale', 'sharpness', 'fitness', 'rehabilitation',
    ]);
    expect(breakdown.effectiveLevel).toBe(currentEffectiveLevel(subject));
    expect(subject).toEqual(before);
  });

  it('uses the same non-positional state delta when projecting concrete simulation attributes', () => {
    const subject = normalizePlayerModel({ ...player('CM'), form:100, sharpness:100, fitness:100 });
    const delta = currentEffectiveLevel(subject) - baselineLevel(subject);
    expect(effectiveAttribute(subject, 'attack')).toBe(RATINGS.attack + delta);
    expect(effectiveAttribute(subject, 'defence')).toBe(RATINGS.defence + delta);
  });

  it('reserves rehabilitation readiness as a bounded compatibility seam for WP6', () => {
    expect(rehabilitationReadiness(player('ST'))).toBe(100);
    expect(rehabilitationReadiness({ ...player('ST'), injured:true })).toBe(0);
    expect(rehabilitationReadiness({ ...player('ST'), rehabilitation:{ readiness:145 } })).toBe(100);
    expect(rehabilitationReadiness({ ...player('ST'), rehabilitation:{ matchReadiness:-20 } })).toBe(0);
  });
});

describe('P3 canonical player-model normalisation', () => {
  it('adds neutral P3 state without changing durable or career fields', () => {
    const legacy = {
      ...player('CM'),
      teamId:'club',
      onLoan:true,
      loanOriginalTeamId:'parent',
      appearances:19,
      minutes:1211,
      potentialRating:88,
      injuryName:'Hamstring strain',
      transferHistory:[{ from:'a', to:'b' }],
    };
    const migrated = normalizePlayerModel(legacy);

    expect(migrated).toMatchObject(legacy);
    expect(migrated.positionSuitability).toEqual({ CM:1 });
    expect(migrated.traits).toEqual([]);
    expect(migrated.individualMorale).toBe(DEFAULT_INDIVIDUAL_MORALE);
    expect(migrated.sharpness).toBe(DEFAULT_SHARPNESS);
    expect(migrated.squadRole).toBeNull();
    expect(migrated.playingTimeAgreement).toBeNull();
    expect(migrated.growthProfile).toBeNull();
    expect(migrated.rehabilitation).toBeNull();
    expect(baselineLevel(migrated)).toBe(baselineLevel(legacy));
    expect(legacy.positionSuitability).toBeUndefined();
  });

  it('preserves valid secondary suitability while forcing the primary position to full fit', () => {
    expect(normalizePositionSuitability({ CM:0.7, CAM:0.84, RW:2, GK:-1, BAD:'x' }, 'CM')).toEqual({
      CM:1,
      CAM:0.84,
      RW:1,
      GK:0,
    });
  });

  it('bounds personal state and sanitises the bounded trait list', () => {
    const traits = [' creator ', 'creator', '', null, ...Array.from({ length:20 }, (_, index) => `t${index}`)];
    const migrated = normalizePlayerModel({
      ...player('ST'),
      individualMorale:200,
      sharpness:-25,
      traits,
    });

    expect(migrated.individualMorale).toBe(100);
    expect(migrated.sharpness).toBe(0);
    expect(migrated.traits[0]).toBe('creator');
    expect(migrated.traits).toHaveLength(MAX_PLAYER_TRAITS);
    expect(normalizePlayerTraits(migrated.traits)).toEqual(migrated.traits);
  });

  it('is idempotent and can detect an already-normalised row', () => {
    const once = normalizePlayerModel(player('CB'));
    const twice = normalizePlayerModel(once);

    expect(twice).toEqual(once);
    expect(playerModelNeedsNormalization(player('CB'))).toBe(true);
    expect(playerModelNeedsNormalization(once)).toBe(false);
  });
});
