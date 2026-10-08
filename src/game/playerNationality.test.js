import { describe, expect, it } from 'vitest';
import { nationalityCode } from '../lib/nationality.mjs';
import { playerNationality } from '../ui/helpers.js';

describe('player nationality presentation', () => {
  it('uses canonical player nationality ahead of club location or legacy IDs', () => {
    expect(playerNationality({ id:'man_city_donnarumma', nationality:'🇮🇹' }, 'Premier League')).toBe('IT');
    expect(playerNationality({ id:'arsenal_gyokeres', nationality:'🇸🇪' }, 'Premier League')).toBe('SE');
    expect(playerNationality({ id:'ars_saka', nationality:'🇫🇷' }, 'Premier League')).toBe('FR');
  });

  it('normalizes source country aliases and demonyms without guessing a club country', () => {
    for (const value of ['Holland', 'Netherlands', 'Dutch']) expect(nationalityCode(value)).toBe('NL');
    for (const value of ['United States', 'USA', 'American']) expect(nationalityCode(value)).toBe('US');
    expect(nationalityCode('Korea Republic')).toBe('KR');
    expect(nationalityCode('Congo DR')).toBe('CD');
    expect(nationalityCode('Cape Verde Islands')).toBe('CV');
    expect(nationalityCode("Côte d’Ivoire")).toBe('CI');
  });

  it('retains home-nation subdivisions and compatibility for missing legacy data', () => {
    expect(nationalityCode('🏴󠁧󠁢󠁥󠁮󠁧󠁿')).toBe('ENG');
    expect(nationalityCode('Scottish')).toBe('SCO');
    expect(playerNationality({ id:'ars_saka' }, 'La Liga')).toBe('ENG');
    expect(playerNationality({ id:'generated', nationality:'🌍' }, 'Eredivisie')).toBe('INT');
    expect(playerNationality({ id:'generated' }, 'Eredivisie')).toBe('NED');
    expect(playerNationality(null, null)).toBe('INT');
  });
});
