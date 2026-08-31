import { describe, expect, it } from 'vitest';
import {
  GROWTH_PROFILE_DEFS,
  assignGrowthProfile,
  durableLevel,
  potentialEstimate,
  settlePlayerDevelopment,
} from './playerDevelopment.js';

function player(id = 'p1', overrides = {}) {
  return {
    id, position:'CM', age:20,
    attack:68, midfield:72, defence:64, goalkeeping:10,
    appearances:0, minutes:0, individualMorale:50, sharpness:50,
    potentialRating:86, growthPoints:0,
    ...overrides,
  };
}

describe('P3 growth profiles', () => {
  it('assigns one deterministic config-driven profile and preserves it', () => {
    const subject = player('profiled');
    const first = assignGrowthProfile(subject);
    const second = assignGrowthProfile(subject);
    expect(first).toEqual(second);
    expect(GROWTH_PROFILE_DEFS[first.id]).toBeTruthy();
    expect(assignGrowthProfile({ ...subject, growthProfile:first })).toEqual(first);
  });

  it('keeps true potential private behind a knowledge-sensitive range', () => {
    const subject = player('scouted', { potentialRating:90 });
    const low = potentialEstimate(subject, .2);
    const high = potentialEstimate(subject, .9);
    expect(low.min).toBeLessThanOrEqual(90);
    expect(low.max).toBeGreaterThanOrEqual(90 - 10);
    expect(high.max - high.min).toBeLessThan(low.max - low.min);
    expect(high.confidence).toBe('High');
  });
});

describe('P3 once-per-week development', () => {
  it('uses cumulative participation once and is replay safe', () => {
    const before = player('weekly', {
      appearances:10, minutes:700,
      developmentAppearances:10, developmentMinutes:700,
      growthProfile:{ id:'normal', peakAge:28 },
      developmentProgress:20,
    });
    const afterMatch = { ...before, appearances:11, minutes:790, lastMatchRating:8.2, sharpness:75, individualMorale:70 };
    const settled = settlePlayerDevelopment(afterMatch, 12, '2025/26');
    expect(settled.developmentSettledKey).toBe('2025/26:12');
    expect(settled.developmentMinutes).toBe(790);
    expect(settlePlayerDevelopment(settled, 12, '2025/26')).toBe(settled);
    expect(durableLevel(settled)).toBeGreaterThanOrEqual(durableLevel(before));
  });

  it('does not invent growth for an unused player before decline age', () => {
    const subject = player('unused', {
      appearances:4, minutes:250,
      developmentAppearances:4, developmentMinutes:250,
      growthProfile:{ id:'normal', peakAge:28 },
      developmentProgress:0,
    });
    expect(settlePlayerDevelopment(subject, 8, '2025/26')).toBe(subject);
  });

  it('uses deterministic decline after a profile peak', () => {
    const subject = player('veteran', {
      age:36, midfield:82, potentialRating:82,
      growthProfile:{ id:'rapid_decline', peakAge:27 },
    });
    const first = settlePlayerDevelopment(subject, 20, '2025/26');
    const second = settlePlayerDevelopment(subject, 20, '2025/26');
    expect(first).toEqual(second);
  });
});

describe('P3 population calibration guard', () => {
  it('does not inflate a seeded youth population beyond its hidden ceilings', () => {
    let population = Array.from({ length:80 }, (_, index) => player(`y${index}`, {
      age:17 + (index % 7),
      midfield:58 + (index % 18),
      potentialRating:72 + (index % 20),
      appearances:0,
      minutes:0,
    }));

    for (let seasonIndex = 0; seasonIndex < 8; seasonIndex++) {
      for (let gw = 1; gw <= 38; gw++) {
        population = population.map((p, index) => {
          const played = index % 3 !== 0;
          const staged = played
            ? { ...p, appearances:(p.appearances ?? 0) + 1, minutes:(p.minutes ?? 0) + 72, lastMatchRating:6.8 + (index % 5) * .2, sharpness:70, individualMorale:60 }
            : p;
          return settlePlayerDevelopment(staged, gw, `${2025 + seasonIndex}/${String(26 + seasonIndex).padStart(2,'0')}`);
        });
      }
      population = population.map(p => ({ ...p, age:p.age + 1, appearances:0, minutes:0 }));
    }

    const overCeiling = population.filter(p => durableLevel(p) > Number(p.potentialRating ?? 99));
    const elite = population.filter(p => durableLevel(p) >= 90);
    expect(overCeiling).toHaveLength(0);
    expect(elite.length).toBeLessThan(population.length * .2);
  });
});
