import { describe, expect, it } from 'vitest';

import { MATCH_INJURY_CHECK_INTERVAL, matchInjuryIntervalRate } from '../modules/matchEngine.js';

describe('fast match injury cadence', () => {
  it('preserves the 120-phase injury probability when checks are batched', () => {
    for (const perPhaseRate of [0.000120, 0.000333]) {
      const legacyFullMatch = 1 - ((1 - perPhaseRate) ** 120);
      const intervalRate = matchInjuryIntervalRate(perPhaseRate);
      const checks = 120 / MATCH_INJURY_CHECK_INTERVAL;
      const batchedFullMatch = 1 - ((1 - intervalRate) ** checks);

      expect(MATCH_INJURY_CHECK_INTERVAL).toBe(6);
      expect(batchedFullMatch).toBeCloseTo(legacyFullMatch, 12);
    }
  });
});
