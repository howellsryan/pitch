import { describe, expect, it } from 'vitest';
import { primaryRating, positionGroup } from './matchEngine.js';
import { _primaryRating } from './potential.js';
import { _fav_primaryRating } from './transfers.js';
import {
  DEFAULT_INDIVIDUAL_MORALE,
  DEFAULT_SHARPNESS,
  MAX_PLAYER_TRAITS,
  PLAYER_MODEL_VERSION,
  baselineAttribute,
  baselineLevel,
  currentEffectiveLevel,
  normalizePlayerModel,
  normalizePlayerTraits,
  normalizePositionSuitability,
  playerModelNeedsNormalization,
  playerPositionGroup,
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

    // Existing public helpers remain default-equivalent while callers migrate.
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

  it('starts effective level as a default-equivalent derived selector', () => {
    const subject = player('CB');
    const before = { ...subject };
    expect(currentEffectiveLevel(subject)).toBe(baselineLevel(subject));
    expect(currentEffectiveLevel(subject, { position:'CM' })).toBe(subject.midfield);
    expect(subject).toEqual(before);
  });

  it('is safe for a missing player during projections', () => {
    expect(baselineLevel(null)).toBeUndefined();
    expect(currentEffectiveLevel(undefined)).toBeUndefined();
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
