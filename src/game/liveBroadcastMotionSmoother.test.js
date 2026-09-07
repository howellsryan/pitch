import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  LIVE_BROADCAST_BALL_SPEED,
  LIVE_BROADCAST_KEEPER_EDGE,
  LIVE_BROADCAST_PLAYER_SPEED,
  LIVE_BROADCAST_SCENE_CUT_DISTANCE,
  separateBroadcastPoints,
  shouldCutBroadcastTransition,
  stabiliseBroadcastTarget,
  stepBroadcastCoordinate,
  stepBroadcastPoint,
} from './liveBroadcastMotionSmoother.js';

const here = dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(resolve(here, '../main.js'), 'utf8');

describe('FM-style live broadcast presentation motion', () => {
  it('keeps ordinary player travel continuous while catching the simulation up inside one phase', () => {
    const elapsedMs = 33;
    const start = { x:10, y:10 };
    const target = { x:90, y:90 };
    const next = stepBroadcastPoint(start, target, elapsedMs, LIVE_BROADCAST_PLAYER_SPEED);
    const travelled = Math.hypot(next.x - start.x, next.y - start.y);

    expect(travelled).toBeGreaterThan(0);
    expect(travelled).toBeLessThanOrEqual(LIVE_BROADCAST_PLAYER_SPEED * elapsedMs / 1000 + 1e-9);
    expect(LIVE_BROADCAST_PLAYER_SPEED).toBeGreaterThan(60);
    expect(next).not.toEqual(target);
  });

  it('lets the ball move faster than players without turning a disconnected phase into a fake long pass', () => {
    const player = stepBroadcastCoordinate(5, 95, 33, LIVE_BROADCAST_PLAYER_SPEED);
    const ball = stepBroadcastCoordinate(5, 95, 33, LIVE_BROADCAST_BALL_SPEED);
    expect(ball - 5).toBeGreaterThan(player - 5);
    expect(shouldCutBroadcastTransition(
      { x:50, y:92 },
      { x:50, y:8 },
      { ball:true, shooting:false },
    )).toBe(true);
    expect(LIVE_BROADCAST_SCENE_CUT_DISTANCE).toBeLessThan(35);
  });

  it('keeps goalkeepers in their own goal zone even if a bad presentation target points upfield', () => {
    const top = stabiliseBroadcastTarget(
      { x:90, y:67 },
      { x:50, y:8 },
      { keeper:true, keeperSide:'top' },
    );
    const bottom = stabiliseBroadcastTarget(
      { x:10, y:33 },
      { x:50, y:92 },
      { keeper:true, keeperSide:'bottom' },
    );

    expect(top.x).toBeGreaterThanOrEqual(41);
    expect(top.x).toBeLessThanOrEqual(59);
    expect(top.y).toBeLessThanOrEqual(LIVE_BROADCAST_KEEPER_EDGE);
    expect(bottom.y).toBeGreaterThanOrEqual(100 - LIVE_BROADCAST_KEEPER_EDGE);
  });

  it('retains formation width for routine movement instead of collapsing every player onto the ball', () => {
    const leftWide = stabiliseBroadcastTarget(
      { x:50, y:45 },
      { x:15, y:55 },
      { engaged:false },
    );
    const rightWide = stabiliseBroadcastTarget(
      { x:50, y:45 },
      { x:85, y:55 },
      { engaged:false },
    );

    expect(leftWide.x).toBeLessThan(45);
    expect(rightWide.x).toBeGreaterThan(55);
    expect(rightWide.x - leftWide.x).toBeGreaterThan(10);
  });

  it('preserves readable spacing when several markers converge on the same tactical point', () => {
    const separated = separateBroadcastPoints([
      { id:'a', x:50, y:50, keeper:false },
      { id:'b', x:50.2, y:50.1, keeper:false },
      { id:'c', x:49.9, y:49.8, keeper:false },
    ]);
    let minimum = Number.POSITIVE_INFINITY;
    for (let i = 0; i < separated.length; i += 1) {
      for (let j = i + 1; j < separated.length; j += 1) {
        minimum = Math.min(minimum, Math.hypot(
          separated[i].x - separated[j].x,
          separated[i].y - separated[j].y,
        ));
      }
    }
    expect(minimum).toBeGreaterThan(1.5);
  });

  it('treats a real shot differently from an impossible phase handoff', () => {
    expect(shouldCutBroadcastTransition(
      { x:50, y:28 },
      { x:50, y:3 },
      { ball:true, shooting:true },
    )).toBe(false);
    expect(shouldCutBroadcastTransition(
      { x:50, y:92 },
      { x:50, y:8 },
      { ball:true, shooting:false },
    )).toBe(true);
  });

  it('stays a presentation-only boot adapter rather than changing match authority or timing', () => {
    expect(mainSource).toContain("import { installLiveBroadcastMotionSmoother } from './game/liveBroadcastMotionSmoother.js';");
    expect(mainSource).toContain('installLiveBroadcastMotionSmoother();');
    expect(mainSource).not.toContain('simulateMatchSegment');
  });
});
