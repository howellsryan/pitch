import { describe, expect, it } from 'vitest';
import { assignCupsFromPosition, getZoneInfo } from '../modules/promotion.js';

describe('domestic table outcome zones', () => {
  it('shows the League Two promotion path with its current 22-club field', () => {
    expect(getZoneInfo(3, 22, 'League Two').zone).toBe('auto');
    expect(getZoneInfo(4, 22, 'League Two').zone).toBe('playoff');
    expect(getZoneInfo(7, 22, 'League Two').zone).toBe('playoff');
    expect(getZoneInfo(8, 22, 'League Two').zone).toBe('mid');
    expect(getZoneInfo(22, 22, 'League Two').zone).toBe('mid');
  });

  it('distinguishes League One relegation from Championship relegation', () => {
    expect(getZoneInfo(21, 24, 'League One').zone).toBe('rel');
    expect(getZoneInfo(20, 24, 'League One').zone).toBe('mid');
    expect(getZoneInfo(21, 24, 'Championship').zone).toBe('mid');
    expect(getZoneInfo(22, 24, 'Championship').zone).toBe('rel');
  });

  it('shows the same European allocation as season rollover for incomplete club fields', () => {
    for (const league of ['Eredivisie', 'Bundesliga', 'Ligue 1']) {
      for (const position of [1, 4, 5, 6, 7]) {
        const zone = getZoneInfo(position, 15, league).zone;
        expect(assignCupsFromPosition(position, league)).toContain(zone);
      }
      expect(getZoneInfo(15, 15, league).zone).toBe('mid');
    }
    expect(getZoneInfo(18, 20, 'Premier League').zone).toBe('rel');
  });
});
