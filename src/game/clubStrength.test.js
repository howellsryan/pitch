import { describe, expect, it } from 'vitest';
import { difficultyBand, keyPlayer, squadStrength, STARTING_XI } from './clubStrength.js';

/** Minimal player: only the four attributes primaryRating() reads. */
const p = (position, { attack = 0, midfield = 0, defence = 0, goalkeeping = 0 } = {}, extra = {}) =>
  ({ position, attack, midfield, defence, goalkeeping, ...extra });

const outfield = (n) => Array.from({ length: n }, (_, i) => p('ST', { attack: 50 + i }));

describe('squadStrength', () => {
  it('is 0 for a missing or empty roster', () => {
    expect(squadStrength(undefined)).toBe(0);
    expect(squadStrength(null)).toBe(0);
    expect(squadStrength([])).toBe(0);
    expect(squadStrength('not an array')).toBe(0);
  });

  it('rates each player on the attribute his position actually uses', () => {
    // A keeper rated 90 in goal and 5 everywhere else is a 90, not a 5.
    expect(squadStrength([p('GK', { goalkeeping: 90, attack: 5 })])).toBe(90);
    expect(squadStrength([p('CB', { defence: 80, attack: 5 })])).toBe(80);
    expect(squadStrength([p('CM', { midfield: 70, attack: 5 })])).toBe(70);
    expect(squadStrength([p('ST', { attack: 60, defence: 5 })])).toBe(60);
  });

  it('averages the best XI only, so a weak tail does not drag a good side down', () => {
    const good = Array.from({ length: STARTING_XI }, () => p('ST', { attack: 80 }));
    const deadwood = Array.from({ length: 19 }, () => p('ST', { attack: 20 }));
    expect(squadStrength([...good, ...deadwood])).toBe(80);
    // Order must not matter — the tail comes first here.
    expect(squadStrength([...deadwood, ...good])).toBe(80);
  });

  it('averages over what exists when a squad is thinner than eleven', () => {
    // Mansfield-style single-row squads survived Phase 6; dividing by 11
    // would report a 70-rated lone player as a 6.
    expect(squadStrength([p('ST', { attack: 70 })])).toBe(70);
    expect(squadStrength(outfield(3))).toBe(Math.round((50 + 51 + 52) / 3));
  });

  it('rounds to a whole number', () => {
    expect(Number.isInteger(squadStrength(outfield(5)))).toBe(true);
  });

  it('skips holes in the roster rather than counting them as zeroes', () => {
    expect(squadStrength([p('ST', { attack: 80 }), null, undefined])).toBe(80);
  });
});

describe('keyPlayer', () => {
  it('returns the best-rated player across differing positions', () => {
    const gk = p('GK', { goalkeeping: 88 }, { name: 'Keeper' });
    const st = p('ST', { attack: 91 }, { name: 'Striker' });
    const cb = p('CB', { defence: 84 }, { name: 'Defender' });
    expect(keyPlayer([gk, st, cb])?.name).toBe('Striker');
    expect(keyPlayer([st, gk, cb])?.name).toBe('Striker');
  });

  it('keeps the first of equally rated players rather than the last', () => {
    const a = p('ST', { attack: 80 }, { name: 'A' });
    const b = p('ST', { attack: 80 }, { name: 'B' });
    expect(keyPlayer([a, b])?.name).toBe('A');
  });

  it('is null for a missing or empty roster', () => {
    expect(keyPlayer(undefined)).toBeNull();
    expect(keyPlayer([])).toBeNull();
    expect(keyPlayer([null])).toBeNull();
  });
});

describe('difficultyBand', () => {
  it('bands by reputation, inclusive at each floor', () => {
    expect(difficultyBand(96).key).toBe('elite');
    expect(difficultyBand(85).key).toBe('elite');
    expect(difficultyBand(84).key).toBe('contender');
    expect(difficultyBand(74).key).toBe('contender');
    expect(difficultyBand(73).key).toBe('established');
    expect(difficultyBand(62).key).toBe('established');
    expect(difficultyBand(61).key).toBe('underdog');
    expect(difficultyBand(48).key).toBe('underdog');
    expect(difficultyBand(47).key).toBe('minnows');
    expect(difficultyBand(0).key).toBe('minnows');
  });

  it('never returns undefined for a nonsense reputation', () => {
    expect(difficultyBand(undefined).key).toBe('minnows');
    expect(difficultyBand(NaN).key).toBe('minnows');
    expect(difficultyBand(-5).key).toBe('minnows');
  });

  it('always carries a label and a note for the UI to render', () => {
    for (const rep of [96, 80, 70, 55, 20]) {
      const b = difficultyBand(rep);
      expect(b.label).toBeTruthy();
      expect(b.note).toBeTruthy();
    }
  });
});
