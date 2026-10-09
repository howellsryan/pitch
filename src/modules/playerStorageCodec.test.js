import { serialize } from 'node:v8';
import { describe, expect, it } from 'vitest';
import { normalizePlayerModel } from './playerModel.js';
import { ensureOpenRegistrationSpell } from './playerStatus.js';
import { decodeStoredPlayer, encodeStoredPlayer } from './playerStorageCodec.js';

function sample() {
  return ensureOpenRegistrationSpell(normalizePlayerModel({
    id:'p1', name:'Career Player', teamId:'club', position:'CM', age:24,
    attack:65, midfield:74, defence:63, goalkeeping:10, fitness:90, form:58,
    appearances:3, starts:2, minutes:200, goals:1, assists:2,
    wage:30000, value:8000000, potentialRating:80,
  }), { season:'2026/27', gameweek:1 });
}

describe('player storage codec', () => {
  it('preserves complete canonical values and index fields with materially smaller wire data', () => {
    const player = sample();
    const encoded = encodeStoredPlayer(player);
    expect(encoded).toMatchObject({ id:player.id, teamId:player.teamId });
    expect(encoded.__pitchPlayerStorage).toBe(2);
    const decoded = decodeStoredPlayer(structuredClone(encoded));
    expect(decoded).toEqual(player);
    expect(JSON.stringify(decoded)).toBe(JSON.stringify(player));
    expect(serialize(encoded).length).toBeLessThan(serialize(player).length * .8);
  });
  it('retains unknown keys, primitive types and array/object distinctions safely', () => {
    const player = { ...sample(), future:JSON.parse('{"__proto__":{"polluted":true},"odd-key":[0,1,null,false,"",{"extra":42}]}') };
    expect(decodeStoredPlayer(encodeStoredPlayer(player))).toEqual(player);
    expect({}.polluted).toBeUndefined();
  });
  it('preserves shared immutable snapshot references through native structured cloning', () => {
    const stats = { appearances:3, minutes:200 };
    const player = { ...sample(), registrationSpells:[{ id:'one', startStats:stats, endStats:stats }] };
    const decoded = decodeStoredPlayer(structuredClone(encodeStoredPlayer(player)));
    expect(decoded.registrationSpells[0].startStats).toBe(decoded.registrationSpells[0].endStats);
  });
  it('reads legacy rows directly and rejects future codecs before any data can be rewritten', () => {
    const player = sample();
    expect(decodeStoredPlayer(player)).toBe(player);
    expect(() => decodeStoredPlayer({ id:'p1', __pitchPlayerStorage:3, payload:[] })).toThrow('newer');
  });
  it('reads the published V1 dictionary and upgrades it without changing canonical values', () => {
    const stored = { id:'p', teamId:'club', __pitchPlayerStorage:1,
      payload:[0,53,'p',132,'club',83,'Keeper',95,'GK',105,[3,[0,53,'s',127,[0,82,90,18,1]]]] };
    const expected = { id:'p', teamId:'club', name:'Keeper', position:'GK', registrationSpells:[{ id:'s', startStats:{ minutes:90, appearances:1 } }] };
    const decoded = decodeStoredPlayer(structuredClone(stored));
    expect(JSON.stringify(decoded)).toBe(JSON.stringify(expected));
    const upgraded = encodeStoredPlayer(decoded);
    expect(upgraded.__pitchPlayerStorage).toBe(2);
    expect(JSON.stringify(decodeStoredPlayer(structuredClone(upgraded)))).toBe(JSON.stringify(expected));
    expect(serialize(upgraded).length).toBeLessThan(serialize(stored).length);
  });
  it('retains sparse arrays, cycles, null prototypes and native structured-clone values', () => {
    const player = sample();
    player.future = Object.create(null);
    player.future.values = new Array(3);
    player.future.values[2] = new Date('2026-10-08T00:00:00Z');
    player.future.self = player.future;
    const decoded = decodeStoredPlayer(structuredClone(encodeStoredPlayer(player)));
    expect(Object.getPrototypeOf(decoded.future)).toBeNull();
    expect(decoded.future.self).toBe(decoded.future);
    expect(decoded.future.values).toHaveLength(3);
    expect(0 in decoded.future.values).toBe(false);
    expect(decoded.future.values[2]).toEqual(player.future.values[2]);
  });
  it('rejects malformed payloads and mismatched club indexes', () => {
    const encoded = encodeStoredPlayer(sample());
    expect(() => decodeStoredPlayer({ ...encoded, teamId:'other' })).toThrow('index fields');
    expect(() => decodeStoredPlayer({ ...encoded, i:1 })).toThrow('index fields');
    expect(() => decodeStoredPlayer({ ...encoded, payload:sample() })).toThrow('Invalid stored player');
    expect(() => decodeStoredPlayer({ ...encoded, payload:[5,String.fromCharCode(254),[],5] })).toThrow('Invalid stored player field');
  });
});
