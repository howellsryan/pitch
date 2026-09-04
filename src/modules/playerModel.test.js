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
  settlePlayerPersonalState,
} from './playerModel.js';

const RATINGS = { attack:91, midfield:82, defence:73, goalkeeping:64 };
const CASES = [
  ['ST', 'ATT', 'attack'], ['CF', 'ATT', 'attack'], ['RW', 'ATT', 'attack'],
  ['LW', 'ATT', 'attack'], ['CAM', 'ATT', 'attack'],
  ['CM', 'MID', 'midfield'], ['CDM', 'MID', 'midfield'], ['RM', 'MID', 'midfield'], ['LM', 'MID', 'midfield'],
  ['CB', 'DEF', 'defence'], ['RB', 'DEF', 'defence'], ['LB', 'DEF', 'defence'],
  ['GK', 'GK', 'goalkeeping'],
];

function player(position, overrides = {}) {
  return { id:`p_${position}`, position, ...RATINGS, ...overrides };
}

describe('P3 canonical player-model selectors', () => {
  it('versions the final additive player-model contract', () => {
    expect(PLAYER_MODEL_VERSION).toBe(5);
  });

  it.each(CASES)('preserves established %s grouping and neutral baseline parity', (position, group, attribute) => {
    const subject = player(position);
    expect(playerPositionGroup(position)).toBe(group);
    expect(baselineAttribute(position)).toBe(attribute);
    expect(baselineLevel(subject)).toBe(RATINGS[attribute]);
    expect(positionGroup(position)).toBe(group);
    expect(primaryRating(subject)).toBe(RATINGS[attribute]);
    expect(_primaryRating(subject)).toBe(RATINGS[attribute]);
    expect(_fav_primaryRating(subject)).toBe(RATINGS[attribute]);
  });

  it('keeps the historical midfield fallback and supports target-position projection', () => {
    const unknown = player('UNKNOWN');
    expect(playerPositionGroup('UNKNOWN')).toBe('MID');
    expect(baselineLevel(unknown)).toBe(unknown.midfield);
    const striker = player('ST');
    expect(baselineLevel(striker, 'CM')).toBe(striker.midfield);
    expect(striker.position).toBe('ST');
  });

  it('keeps neutral primary-position state baseline-equivalent while target slots pay explicit fit costs', () => {
    const subject = player('CB');
    const before = { ...subject };
    expect(currentEffectiveLevel(subject)).toBe(baselineLevel(subject));
    expect(positionSuitabilityFor(subject, 'CM')).toBe(.28);
    expect(currentEffectiveLevel(subject, { position:'CM' })).toBe(76.2);
    expect(subject).toEqual(before);
    expect(currentEffectiveLevel(undefined)).toBeUndefined();
    expect(effectiveLevelBreakdown(null)).toBeUndefined();
    expect(effectiveAttribute(undefined, 'attack')).toBeUndefined();
  });
});

describe('P3 bounded effective level', () => {
  it('applies explicit persisted and deterministic fallback position fit', () => {
    const subject = normalizePlayerModel(player('CM', { positionSuitability:{ CM:1, CDM:.5 } }));
    expect(positionSuitabilityFor(subject, 'CM')).toBe(1);
    expect(positionSuitabilityFor(subject, 'CDM')).toBe(.5);
    expect(positionSuitabilityFor(subject, 'CAM')).toBe(.72);
    expect(currentEffectiveLevel(subject, { position:'CDM' })).toBeGreaterThanOrEqual(78);
  });

  it('bounds each short-term contribution and the combined swing', () => {
    const base = baselineLevel(player('CB'));
    expect(currentEffectiveLevel(player('CB', { form:100 }))).toBe(base + EFFECTIVE_LEVEL_LIMITS.formSwing);
    expect(currentEffectiveLevel(player('CB', { individualMorale:100 }))).toBe(base + EFFECTIVE_LEVEL_LIMITS.moraleSwing);
    expect(currentEffectiveLevel(player('CB', { sharpness:100 }))).toBe(base + EFFECTIVE_LEVEL_LIMITS.sharpnessSwing);
    expect(currentEffectiveLevel(player('CB', { fitness:0 }))).toBe(base - EFFECTIVE_LEVEL_LIMITS.fitnessPenalty);
    expect(currentEffectiveLevel(player('CB', { rehabilitation:{ matchReadiness:0 } }))).toBe(base - EFFECTIVE_LEVEL_LIMITS.rehabilitationPenalty);

    const boosted = player('CM', { form:100, individualMorale:100, sharpness:100, fitness:100 });
    const depleted = player('CM', {
      positionSuitability:{ CM:1, CDM:0 }, form:0, individualMorale:0, sharpness:0, fitness:0,
      rehabilitation:{ readiness:0 },
    });
    expect(currentEffectiveLevel(boosted)).toBe(RATINGS.midfield + EFFECTIVE_LEVEL_LIMITS.maxUplift);
    expect(currentEffectiveLevel(depleted, { position:'CDM' })).toBe(RATINGS.midfield - EFFECTIVE_LEVEL_LIMITS.maxDrop);
  });

  it('exposes one explainable breakdown and reuses non-positional state for raw attributes', () => {
    const subject = player('CM', { form:100, sharpness:100, fitness:100 });
    const before = structuredClone(subject);
    const breakdown = effectiveLevelBreakdown(subject);
    expect(Object.keys(breakdown.contributions)).toEqual([
      'positionFit', 'form', 'morale', 'sharpness', 'fitness', 'rehabilitation', 'traits',
    ]);
    expect(breakdown.contributions.traits).toBe(0);
    expect(breakdown.effectiveLevel).toBe(currentEffectiveLevel(subject));
    const delta = currentEffectiveLevel(subject) - baselineLevel(subject);
    expect(effectiveAttribute(subject, 'attack')).toBe(RATINGS.attack + delta);
    expect(effectiveAttribute(subject, 'defence')).toBe(RATINGS.defence + delta);
    expect(subject).toEqual(before);
  });

  it('keeps rehabilitation readiness bounded for WP6', () => {
    expect(rehabilitationReadiness(player('ST'))).toBe(100);
    expect(rehabilitationReadiness(player('ST', { injured:true }))).toBe(0);
    expect(rehabilitationReadiness(player('ST', { rehabilitation:{ readiness:145 } }))).toBe(100);
    expect(rehabilitationReadiness(player('ST', { rehabilitation:{ matchReadiness:-20 } }))).toBe(0);
  });
});

describe('P3 once-per-world-week personal state', () => {
  it('uses canonical cumulative participation deltas and is idempotent per season-scoped week', () => {
    const baseline = normalizePlayerModel(player('CM', {
      appearances:10, minutes:800, form:72, individualMorale:50, sharpness:50,
    }));
    const afterMatch = { ...baseline, appearances:11, minutes:890, lastMatchRating:8.1 };
    const settled = settlePlayerPersonalState(afterMatch, 17, '2025/26');
    expect(settled.individualMorale).toBe(55);
    expect(settled.sharpness).toBe(55);
    expect(settled.personalStateAppearances).toBe(11);
    expect(settled.personalStateMinutes).toBe(890);
    expect(settled.personalStateSettledKey).toBe('2025/26:17');
    expect(settlePlayerPersonalState(settled, 17, '2025/26')).toBe(settled);
  });

  it('decays unused non-neutral state, leaves neutral rows untouched and handles season resets', () => {
    const unused = normalizePlayerModel(player('ST', {
      appearances:5, minutes:450, individualMorale:60, sharpness:70,
    }));
    const settled = settlePlayerPersonalState(unused, 9, '2025/26');
    expect(settled.individualMorale).toBe(58);
    expect(settled.sharpness).toBe(66);

    const neutral = normalizePlayerModel(player('ST', { appearances:5, minutes:450 }));
    expect(settlePlayerPersonalState(neutral, 9, '2025/26')).toBe(neutral);

    const endOfSeason = normalizePlayerModel(player('GK', { appearances:34, minutes:3060 }));
    const reset = settlePlayerPersonalState({ ...endOfSeason, appearances:0, minutes:0 }, 1, '2026/27');
    expect(reset.personalStateAppearances).toBe(0);
    expect(reset.personalStateMinutes).toBe(0);
    expect(reset.individualMorale).toBe(DEFAULT_INDIVIDUAL_MORALE);
    expect(reset.sharpness).toBe(DEFAULT_SHARPNESS);
  });
});

describe('P3 player-model normalisation', () => {
  it('adds final P3 state without changing durable/career fields', () => {
    const legacy = player('CM', {
      teamId:'club', onLoan:true, loanOriginalTeamId:'parent', appearances:19, minutes:1211,
      potentialRating:88, injuryName:'Hamstring strain', transferHistory:[{ from:'a', to:'b' }],
    });
    const migrated = normalizePlayerModel(legacy);
    expect(migrated).toMatchObject(legacy);
    expect(migrated.positionSuitability).toEqual({ CM:1 });
    expect(migrated.traits.length).toBeGreaterThan(0);
    expect(migrated.traits.length).toBeLessThanOrEqual(MAX_PLAYER_TRAITS);
    expect(migrated.individualMorale).toBe(DEFAULT_INDIVIDUAL_MORALE);
    expect(migrated.sharpness).toBe(DEFAULT_SHARPNESS);
    expect(migrated.squadRole).toBeNull();
    expect(migrated.squadRoleSource).toBeNull();
    expect(migrated.squadRoleTeamId).toBeNull();
    expect(migrated.playingTimeAgreement).toBeNull();
    expect(migrated.growthProfile).toBeTruthy();
    expect(migrated.potentialKnowledge).toBeGreaterThan(0);
    expect(migrated.personalStateAppearances).toBe(19);
    expect(migrated.personalStateMinutes).toBe(1211);
    expect(baselineLevel(migrated)).toBe(baselineLevel(legacy));
  });

  it('preserves valid position suitability and keeps only configured traits', () => {
    expect(normalizePositionSuitability({ CM:.7, CAM:.84, RW:2, GK:-1, BAD:'x' }, 'CM')).toEqual({
      CM:1, CAM:.84, RW:1, GK:0,
    });
    const traits = [' creator ', 'creator', '', null, ...Array.from({ length:20 }, (_, index) => `t${index}`)];
    const migrated = normalizePlayerModel(player('ST', { individualMorale:200, sharpness:-25, traits }));
    expect(migrated.individualMorale).toBe(100);
    expect(migrated.sharpness).toBe(0);
    expect(migrated.traits).toEqual(['creator']);
    expect(migrated.traits.length).toBeLessThanOrEqual(MAX_PLAYER_TRAITS);
    expect(normalizePlayerTraits(migrated.traits)).toEqual(migrated.traits);
  });

  it('is idempotent and detects an already-normalised row', () => {
    const once = normalizePlayerModel(player('CB'));
    expect(normalizePlayerModel(once)).toEqual(once);
    expect(playerModelNeedsNormalization(player('CB'))).toBe(true);
    expect(playerModelNeedsNormalization(once)).toBe(false);
  });
});