import { describe, expect, it } from 'vitest';
import { decorateGoalkeeperMomentWithRead, goalkeeperReadCue } from './playableGoalkeeperRead.js';

function packet(overrides = {}) {
  return {
    version:1,
    actor:.2,
    target:.4,
    shooter:.7,
    shot:.2,
    finish:.8,
    ...overrides,
  };
}

describe('goalkeeper pre-shot read cue', () => {
  it('is deterministic and coarse rather than an authoritative result', () => {
    const first = goalkeeperReadCue(packet());
    const second = goalkeeperReadCue(packet());
    expect(first).toEqual(second);
    expect(first.kind).toBe('shooter_read');
    expect(first.x).toBeGreaterThanOrEqual(-.82);
    expect(first.x).toBeLessThanOrEqual(.82);
    expect(first.y).toBeGreaterThanOrEqual(.18);
    expect(first.y).toBeLessThanOrEqual(.84);
    expect(first).not.toHaveProperty('goal');
    expect(first).not.toHaveProperty('finish');
  });

  it('moves the visual read with the persisted shot direction', () => {
    const left = goalkeeperReadCue(packet({ shot:.08, finish:.3 }));
    const right = goalkeeperReadCue(packet({ shot:.92, finish:.7 }));
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
    expect(right.y).toBeGreaterThan(left.y);
  });

  it('decorates only goalkeeper moments and reuses the renderer cue contract', () => {
    const keeperMoment = { mode:'goalkeeper', setPiece:{ kind:'penalty' } };
    const decorated = decorateGoalkeeperMomentWithRead(keeperMoment, packet());
    expect(decorated.syntheticTarget).toEqual(decorated.goalkeeperRead);
    expect(decorated.goalkeeperRead.confidence).toBe(.72);

    const attackerMoment = { mode:'attack' };
    expect(decorateGoalkeeperMomentWithRead(attackerMoment, packet())).toBe(attackerMoment);
  });
});
