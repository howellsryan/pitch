import { serialize } from 'node:v8';
import { describe, expect, it } from 'vitest';
import { decodeStoredSeason, encodeStoredSeason } from './seasonStorageCodec.js';

describe('season archive storage codec', () => {
  it('retains full detailed world history and supplied archive IDs with smaller wire data', () => {
    const season = { id:14, season:'2039/40', userTeamId:'club', world:{ players:Array.from({ length:100 }, (_, index) => ({
      id:`player-${index}`, name:`Player ${index}`, teamId:'club', position:'CM', appearances:30, minutes:2500,
      goals:5, assists:7, registrationSpells:[{ id:`spell-${index}`, status:'first_team', contractTeamId:'club',
        registeredTeamId:'club', startSeason:'2039/40', startGameweek:1, endSeason:'2039/40', endGameweek:46,
        startStats:{ appearances:0, minutes:0 }, endStats:{ appearances:30, minutes:2500 } }],
    })) }, future:{ awards:['one','two'] } };
    const wire = encodeStoredSeason(season);
    expect(wire.id).toBe(14);
    const decoded = decodeStoredSeason(structuredClone(wire));
    expect(decoded).toEqual(season);
    expect(JSON.stringify(decoded)).toBe(JSON.stringify(season));
    expect(serialize(wire).length).toBeLessThan(serialize(season).length * .8);
  });
  it('preserves native auto-increment IDs and their canonical insertion order', () => {
    const season = { season:'2039/40', world:{ leagues:[] } };
    const wire = encodeStoredSeason(season);
    expect(Object.hasOwn(wire, 'id')).toBe(false);
    expect(decodeStoredSeason(wire)).toEqual(season);
    wire.id = 15; // Native add() injects the generated inline key into the row.
    expect(JSON.stringify(decodeStoredSeason(structuredClone(wire)))).toBe(JSON.stringify({ ...season, id:15 }));
  });
  it('keeps legacy rows readable and rejects future or mismatched archive formats', () => {
    const season = { id:1, season:'2026/27' };
    expect(decodeStoredSeason(season)).toBe(season);
    expect(() => decodeStoredSeason({ __pitchSeasonStorage:3 })).toThrow('newer');
    expect(() => decodeStoredSeason({ ...encodeStoredSeason(season), id:2 })).toThrow('index');
  });
});
