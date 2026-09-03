import { describe, expect, it } from 'vitest';
import { normalizePlayerStatus } from './playerStatus.js';
import { settlePlayerDevelopment } from './playerDevelopment.js';

function academy(overrides = {}) {
  return normalizePlayerStatus({
    id:'academy-1', name:'Academy One', position:'CM', age:17,
    attack:48, midfield:56, defence:49, goalkeeping:12,
    potentialRating:82, potentialKnowledge:.4,
    teamId:'club', youthTeamId:'club', isYouth:true, inSquad:false,
    appearances:0, starts:0, minutes:0, goals:0, assists:0,
    ratingTotal:0, ratingApps:0, growthPoints:0, developmentProgress:0,
    sharpness:60, individualMorale:60,
    ...overrides,
  });
}

describe('P9 academy evidence on the canonical P3 clock', () => {
  it('creates deterministic academy evidence without touching senior P1 totals', () => {
    const input = academy();
    const a = settlePlayerDevelopment(input, 2, '2025/26');
    const b = settlePlayerDevelopment(academy(), 2, '2025/26');
    expect(a.academyEvidence).toEqual(b.academyEvidence);
    expect(a.academyEvidence?.lastWeekKey).toBe('2025/26:2');
    expect(a.appearances).toBe(0);
    expect(a.minutes).toBe(0);
    expect(a.ratingApps).toBe(0);
  });

  it('is a strict replay no-op after the same world-week settles', () => {
    const settled = settlePlayerDevelopment(academy(), 2, '2025/26');
    expect(settlePlayerDevelopment(settled, 2, '2025/26')).toBe(settled);
  });

  it('records a non-fixture academy week without inventing an appearance', () => {
    const settled = settlePlayerDevelopment(academy(), 3, '2025/26');
    expect(settled.academyEvidence?.lastWeekKey).toBe('2025/26:3');
    expect(settled.academyEvidence?.appearances ?? 0).toBe(0);
    expect(settled.appearances).toBe(0);
  });
});
