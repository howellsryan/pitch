import { describe, expect, it } from 'vitest';
import { generateStubPlayers } from './opponents.js';

describe('generateStubPlayers', () => {
  it('generates 16 players (11 starters + 5 bench)', () => {
    const stubs = generateStubPlayers({ id: 'stub_test', name: 'StubFC', crest: 'S' }, 75);
    expect(stubs).toHaveLength(16);
  });

  it('gives every player a realistic name, not "Player N"', () => {
    const stubs = generateStubPlayers({ id: 'stub_test', name: 'StubFC', crest: 'S' }, 75);
    expect(stubs.some(p => p.name === 'Player 1')).toBe(false);
    expect(stubs.every(p => p.name.includes('.') || p.name.includes(' '))).toBe(true);
    expect(new Set(stubs.map(p => p.name)).size).toBe(stubs.length);
  });

  it('scales attack roughly with the requested strength', () => {
    const weak   = generateStubPlayers({ id: 'w', name: 'Weak',   crest: 'W' }, 40);
    const strong = generateStubPlayers({ id: 's', name: 'Strong', crest: 'S' }, 95);
    const weakST   = weak.find(p => p.position === 'ST');
    const strongST = strong.find(p => p.position === 'ST');
    expect(weakST.attack).toBeLessThanOrEqual(strongST.attack + 35);
  });

  it('caps goalkeeping in a sane range for the GK slot', () => {
    const stubs = generateStubPlayers({ id: 'w', name: 'Weak', crest: 'W' }, 40);
    const gk = stubs.find(p => p.position === 'GK');
    expect(gk.goalkeeping).toBeGreaterThanOrEqual(0);
    expect(gk.goalkeeping).toBeLessThanOrEqual(99);
  });

  it('ids every stub with the team id and a _stub_ marker', () => {
    const stubs = generateStubPlayers({ id: 'w', name: 'Weak', crest: 'W' }, 40);
    expect(stubs.every(p => p.id.includes('_stub_'))).toBe(true);
    expect(stubs.every(p => p.id.startsWith('w_stub_'))).toBe(true);
  });
});
