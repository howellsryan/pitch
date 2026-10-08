import { describe, expect, it } from 'vitest';
import { fmt } from '../ui/helpers.js';

describe('money presentation', () => {
  it('formats spending and debt as signed amounts rather than free transactions', () => {
    expect(fmt.money(-4_200_000)).toBe('-£4.2M');
    expect(fmt.money(-23_000)).toBe('-£23K');
    expect(fmt.money(-750)).toBe('-£750');
    expect(fmt.money(-2_000_000_000)).toBe('-£2.0B');
  });

  it('preserves existing positive fee and weekly wage formatting', () => {
    expect(fmt.money(0)).toBe('Free');
    expect(fmt.money(4_200_000)).toBe('£4.2M');
    expect(fmt.wage(23_000)).toBe('£23K/w');
  });
});
