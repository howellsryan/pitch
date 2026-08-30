import { describe, expect, it } from 'vitest';

import { calculatePrizeMoney, europeanProgressPrize } from './season.js';

describe('P0 UEFA season finance integration', () => {
  it('does not treat two-leg round indexes as extra prize stages', () => {
    expect(europeanProgressPrize('ucl', {
      status:'eliminated', qualificationRoute:'direct', roundIndex:3,
    })).toBe(25_000_000); // league phase + R16 only

    expect(europeanProgressPrize('ucl', {
      status:'eliminated', qualificationRoute:'direct', roundIndex:5,
    })).toBe(37_000_000); // league phase + R16 + QF
  });

  it('keeps play-off and direct-route rewards distinct in the Europa League', () => {
    expect(europeanProgressPrize('uel', {
      status:'eliminated', qualificationRoute:'playoff', roundIndex:1,
    })).toBe(7_000_000); // league phase + play-off

    expect(europeanProgressPrize('uel', {
      status:'eliminated', qualificationRoute:'direct', roundIndex:3,
    })).toBe(8_000_000); // league phase + R16, no play-off payment

    expect(europeanProgressPrize('uel', {
      status:'eliminated', qualificationRoute:'playoff', roundIndex:3,
    })).toBe(10_000_000); // league phase + play-off + R16
  });

  it('uses the corrected stage calculation in end-of-season prize totals', () => {
    // Bundesliga position 20 contributes the stable £3m non-European league
    // baseline, making the UEFA component easy to assert without mocking DBs.
    expect(calculatePrizeMoney(20, {
      ucl:{ status:'eliminated', qualificationRoute:'direct', roundIndex:3 },
    }, 'Bundesliga')).toBe(28_000_000);

    expect(calculatePrizeMoney(20, {
      uel:{ status:'winner', qualificationRoute:'direct', roundIndex:9 },
    }, 'Bundesliga')).toBe(71_000_000);
  });
});
