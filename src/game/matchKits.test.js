import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb } from '../lib/theme.mjs';
import { resolveMatchKits, resolvePlayableAppearance } from './matchKits.js';

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


describe('playable match appearance', () => {
  const home = { id:'home', primaryColor:'#EF0107' };
  const away = { id:'away', primaryColor:'#003399' };
  it('uses the attacking club kit even when the away side takes the penalty', () => {
    const moment = { attackingTeamId:'away', shooterId:'striker' };
    const before = JSON.stringify(moment);
    const look = resolvePlayableAppearance(moment, home, away, [], [{ id:'striker', shirtNumber:11 }]);
    expect(look.attack.color).toBe(resolveMatchKits(home, away).away.color);
    expect(look.attack.number).toBe(11);
    expect(JSON.stringify(moment)).toBe(before);
  });
  it('retains readable numbers on a white kit and resolves a same-colour opponent', () => {
    const look = resolvePlayableAppearance({}, { primaryColor:'#FFFFFF' }, { primaryColor:'#FFFFFF' });
    expect(contrastRatio(hexToRgb(look.attack.color), hexToRgb(look.attack.numberColor))).toBeGreaterThan(4.5);
    expect(look.attack.color).not.toBe(look.defence.color);
  });
  it('supports old moments and invalid shirt numbers without touching gameplay', () => {
    expect(resolvePlayableAppearance(null).attack.number).toBe(9);
    expect(resolvePlayableAppearance({ shooterId:'x' }, home, away, [{ id:'x', shirtNumber:NaN }]).attack.number).toBe(9);
    expect(resolvePlayableAppearance(null).keeper.number).toBe(1);
  });
});
