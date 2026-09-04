import { describe, expect, it } from 'vitest';
import {
  aggregatesFromEa,
  calculateAge,
  mapTransfermarktPosition,
  normalizePersonName,
} from './playerRefresh.mjs';

describe('current player refresh helpers', () => {
  it('keeps the official overall as Pitch primary rating for Milos Kerkez-style fullback data', () => {
    const ratings = aggregatesFromEa('LB', 81, {
      pace:84, shooting:59, passing:75, dribbling:78, defending:76, physical:79,
    });
    expect(Math.max(ratings.attack, ratings.midfield, ratings.defence)).toBe(81);
    expect(ratings.defence).toBe(81);
  });

  it('keeps the official overall as Pitch primary rating for Antony-style winger data', () => {
    const ratings = aggregatesFromEa('RW', 81, {
      pace:85, shooting:81, passing:79, dribbling:82, defending:48, physical:71,
    });
    expect(Math.max(ratings.attack, ratings.midfield, ratings.defence)).toBe(81);
    expect(ratings.attack).toBe(81);
  });

  it('maps Transfermarkt positions into Pitch positions', () => {
    expect(mapTransfermarktPosition('Left-Back', 'Defender')).toBe('LB');
    expect(mapTransfermarktPosition('Defensive Midfield', 'Midfield')).toBe('CDM');
    expect(mapTransfermarktPosition('Centre-Forward', 'Attack')).toBe('ST');
  });

  it('normalizes names without losing meaningful tokens', () => {
    expect(normalizePersonName('Dušan Vlahović')).toBe('dusan vlahovic');
    expect(normalizePersonName("M'Bala Nzola")).toBe('m bala nzola');
  });

  it('calculates age at the 2026/27 season reference date', () => {
    expect(calculateAge('2003-11-07')).toBe(22);
    expect(calculateAge('2004-08-01')).toBe(22);
  });
});
