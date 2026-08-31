import { describe, expect, it } from 'vitest';
import {
  GROWTH_PROFILE_DEFS,
  assignGrowthProfile,
  durableLevel,
  potentialEstimate,
  settlePlayerDevelopment,
} from './playerDevelopment.js';

const POSITIONS = ['GK','CB','RB','LB','CDM','CM','CAM','RM','LM','RW','LW','CF','ST'];

function populationPlayer(index, overrides = {}) {
  const position = POSITIONS[index % POSITIONS.length];
  const groupRating = 55 + (index % 29);
  return {
    id:`balance-${index}`,
    name:`Balance ${index}`,
    position,
    age:17 + (index % 18),
    attack:position === 'GK' ? 20 : groupRating,
    midfield:['CM','CDM','CAM','RM','LM'].includes(position) ? groupRating : Math.max(35, groupRating - 6),
    defence:['CB','RB','LB'].includes(position) ? groupRating : Math.max(35, groupRating - 8),
    goalkeeping:position === 'GK' ? groupRating : 10,
    potentialRating:Math.min(94, groupRating + 4 + (index % 12)),
    potentialKnowledge:.35,
    individualMorale:50,
    sharpness:50,
    form:50,
    appearances:0,
    minutes:0,
    ...overrides,
  };
}

function runSeasons(seedPlayer, seasons = 6) {
  let player = structuredClone(seedPlayer);
  let seasonStart = 2025;
  for (let seasonIndex = 0; seasonIndex < seasons; seasonIndex++) {
    const season = `${seasonStart + seasonIndex}/${String((seasonStart + seasonIndex + 1) % 100).padStart(2, '0')}`;
    for (let gw = 1; gw <= 38; gw++) {
      const playing = (gw + seasonIndex + Number(String(player.id).replace(/\D/g, '') || 0)) % 5 !== 0;
      if (playing) {
        player = {
          ...player,
          appearances:(player.appearances ?? 0) + 1,
          minutes:(player.minutes ?? 0) + (gw % 4 === 0 ? 62 : 90),
          lastMatchRating:6.2 + ((gw + seasonIndex) % 8) * .22,
          individualMorale:48 + ((gw + seasonIndex) % 7) * 4,
          sharpness:55 + ((gw + seasonIndex) % 6) * 6,
        };
      }
      player = settlePlayerDevelopment(player, gw, season);
    }
    player = { ...player, age:(player.age ?? 24) + 1, appearances:0, minutes:0 };
  }
  return player;
}

describe('P3 seeded population balance', () => {
  it('keeps configured growth profiles diverse without a dominant special archetype', () => {
    const counts = new Map(Object.keys(GROWTH_PROFILE_DEFS).map(id => [id, 0]));
    const sample = Array.from({ length:1000 }, (_, index) => populationPlayer(index));
    for (const player of sample) {
      const profile = assignGrowthProfile(player);
      counts.set(profile.id, (counts.get(profile.id) ?? 0) + 1);
    }

    const share = id => (counts.get(id) ?? 0) / sample.length;
    expect(share('normal')).toBeGreaterThan(.32);
    expect(share('normal')).toBeLessThan(.55);
    for (const id of ['early_peak','late_developer','extended_peak','rapid_decline']) {
      expect(share(id)).toBeGreaterThan(.07);
      expect(share(id)).toBeLessThan(.27);
    }
  });

  it('narrows observed potential as knowledge rises without exposing impossible values', () => {
    const subject = populationPlayer(77, { age:18, midfield:71, potentialRating:90 });
    const low = potentialEstimate(subject, .2);
    const high = potentialEstimate(subject, .9);

    expect(low.min).toBeGreaterThanOrEqual(durableLevel(subject));
    expect(low.max).toBeLessThanOrEqual(99);
    expect(high.max - high.min).toBeLessThan(low.max - low.min);
    expect(low.confidence).toBe('Low');
    expect(high.confidence).toBe('High');
  });

  it('is reproducible across multi-season runs and keeps world quality bounded', () => {
    const sample = Array.from({ length:120 }, (_, index) => populationPlayer(index));
    const first = sample.map(player => runSeasons(player, 8));
    const second = sample.map(player => runSeasons(player, 8));

    expect(second).toEqual(first);
    const finalRatings = first.map(durableLevel);
    expect(Math.max(...finalRatings)).toBeLessThanOrEqual(99);
    expect(Math.min(...finalRatings)).toBeGreaterThanOrEqual(1);
    const eliteShare = finalRatings.filter(rating => rating >= 90).length / finalRatings.length;
    expect(eliteShare).toBeLessThan(.18);
    const average = finalRatings.reduce((sum, rating) => sum + rating, 0) / finalRatings.length;
    expect(average).toBeGreaterThan(52);
    expect(average).toBeLessThan(82);
  });

  it('does not allow a young player to jump beyond the hidden durable ceiling', () => {
    const subject = populationPlayer(9, { age:18, attack:68, potentialRating:82 });
    const result = runSeasons(subject, 5);
    expect(durableLevel(result)).toBeLessThanOrEqual(82);
    expect(durableLevel(result) - durableLevel(subject)).toBeLessThanOrEqual(14);
  });
});