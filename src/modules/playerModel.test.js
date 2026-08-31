import { describe, expect, it } from 'vitest';
import { primaryRating, positionGroup } from './matchEngine.js';
import { _primaryRating } from './potential.js';
import { _fav_primaryRating } from './transfers.js';
import {
  PLAYER_MODEL_VERSION,
  baselineAttribute,
  baselineLevel,
  currentEffectiveLevel,
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
