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

    const patches = buildPersonalStatePatches([participant, unusedNonNeutral, unusedNeutral], 12, '2025/26');

    expect(patches.map(patch => patch.id)).toEqual(['played', 'rested']);
    expect(patches.find(patch => patch.id === 'played')).toMatchObject({
      personalStateAppearances:11,
      personalStateMinutes:890,
      personalStateSettledKey:'2025/26:12',
    });
    expect(patches.find(patch => patch.id === 'rested')).toMatchObject({
      individualMorale:58,
      sharpness:66,
      personalStateSettledKey:'2025/26:12',
    });
  });

  it('is empty when a settled write set is rebuilt for the same world week', () => {
    const participant = {
      ...player('played'),
      appearances:11,
      minutes:890,
      lastMatchRating:8,
    };
    const first = buildPersonalStatePatches([participant], 8, '2025/26');
    expect(first).toHaveLength(1);
    expect(buildPersonalStatePatches(first, 8, '2025/26')).toEqual([]);
  });

  it('does not confuse the same gameweek number in a later season', () => {
    const firstSeason = {
      ...player('rollover'),
      appearances:11,
      minutes:890,
      lastMatchRating:7.5,
    };
    const [settled] = buildPersonalStatePatches([firstSeason], 17, '2025/26');
    const nextSeasonParticipation = {
      ...settled,
      appearances:12,
      minutes:980,
      lastMatchRating:7.2,
    };

    const next = buildPersonalStatePatches([nextSeasonParticipation], 17, '2026/27');
    expect(next).toHaveLength(1);
    expect(next[0].personalStateSettledKey).toBe('2026/27:17');
    expect(next[0].personalStateAppearances).toBe(12);
  });

  it('recognises participation after season statistics reset', () => {
    const priorSeason = normalizePlayerModel({
      ...player('new-season'),
      appearances:21,
      minutes:1674,
      sharpness:50,
      individualMorale:50,
      personalStateAppearances:21,
      personalStateMinutes:1674,
      personalStateSettledKey:'2025/26:38',
    });
    const firstNewSeasonMatch = {
      ...priorSeason,
      appearances:1,
      minutes:90,
      lastMatchRating:7.4,
      form:62,
    };

    const [settled] = buildPersonalStatePatches([firstNewSeasonMatch], 1, '2026/27');
    expect(settled.personalStateAppearances).toBe(1);
    expect(settled.personalStateMinutes).toBe(90);
    expect(settled.personalStateSettledKey).toBe('2026/27:1');
    expect(settled.sharpness).toBeGreaterThan(50);
    expect(settled.individualMorale).toBeGreaterThan(50);
  });

  it('shares the same per-player settlement contract used by the batch planner', () => {
    const participant = {
      ...player('single'),
      appearances:11,
      minutes:845,
      lastMatchRating:6.8,
    };
    expect(buildPersonalStatePatches([participant], 4, '2025/26')[0]).toEqual(
      settlePlayerPersonalState(participant, 4, '2025/26'),
    );
  });
});
