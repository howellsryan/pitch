import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb } from '../lib/theme.mjs';
import { resolveMatchKits } from './matchKits.js';

describe('resolveMatchKits', () => {
  it('keeps recognisably different club colours', () => {
    const kits = resolveMatchKits({ primaryColor:'#EF0107' }, { primaryColor:'#0057B8' });
    expect(kits.clashResolved).toBe(false);
    expect(kits.home.color).not.toBe(kits.away.color);
  });

  it('gives similar teams a clearly separated change strip', () => {
    const kits = resolveMatchKits({ primaryColor:'#EF0107' }, { primaryColor:'#E2001A' });
    expect(kits.clashResolved).toBe(true);
    expect(contrastRatio(hexToRgb(kits.home.color), hexToRgb(kits.away.color))).toBeGreaterThan(2.5);
  });

  it('uses dark shirt numbers on white kits', () => {
    const kits = resolveMatchKits({ primaryColor:'#FFFFFF' }, { primaryColor:'#003399' });
    expect(kits.home.numberColor).toBe('#070D0A');
  });
});
