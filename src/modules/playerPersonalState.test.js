import { describe, expect, it } from 'vitest';
import {
  buildPersonalStatePatches,
  normalizePlayerModel,
  settlePlayerPersonalState,
} from './playerModel.js';

function player(id, overrides = {}) {
  return normalizePlayerModel({
    id,
    name:`Player ${id}`,
    position:'CM',
    attack:70,
    midfield:78,
    defence:65,
    goalkeeping:10,
    appearances:10,
    minutes:800,
    form:50,
    ...overrides,
  });
}

describe('P3 bounded personal-state write set', () => {
  it('returns only participants and non-neutral unused players', () => {
    const participant = {
      ...player('played'),
      appearances:11,
      minutes:890,
      lastMatchRating:7.4,
      form:68,
    };
    const unusedNonNeutral = player('rested', { individualMorale:60, sharpness:70 });
    const unusedNeutral = player('neutral');

    const patches = buildPersonalStatePatches([participant, unusedNonNeutral, unusedNeutral], 12);

    expect(patches.map(patch => patch.id)).toEqual(['played', 'rested']);
    expect(patches.find(patch => patch.id === 'played')).toMatchObject({
      personalStateAppearances:11,
      personalStateMinutes:890,
      personalStateSettledGameweek:12,
    });
    expect(patches.find(patch => patch.id === 'rested')).toMatchObject({
      individualMorale:58,
      sharpness:66,
      personalStateSettledGameweek:12,
    });
  });

  it('is empty when a settled write set is rebuilt for the same world gameweek', () => {
    const participant = {
      ...player('played'),
      appearances:11,
      minutes:890,
      lastMatchRating:8,
    };
    const first = buildPersonalStatePatches([participant], 8);
    expect(first).toHaveLength(1);
    expect(buildPersonalStatePatches(first, 8)).toEqual([]);
  });

  it('shares the same per-player settlement contract used by the batch planner', () => {
    const participant = {
      ...player('single'),
      appearances:11,
      minutes:845,
      lastMatchRating:6.8,
    };
    expect(buildPersonalStatePatches([participant], 4)[0]).toEqual(
      settlePlayerPersonalState(participant, 4),
    );
  });
});
