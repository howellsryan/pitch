import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  LIVE_BROADCAST_BALL_SPEED,
  LIVE_BROADCAST_PLAYER_SPEED,
  stepBroadcastCoordinate,
  stepBroadcastPoint,
} from './liveBroadcastMotionSmoother.js';

const here = dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(resolve(here, '../main.js'), 'utf8');

describe('continuous live broadcast screen motion', () => {
  it('hard-caps a player frame even when the simulation target teleports across the pitch', () => {
    const elapsedMs = 33;
    const start = { x:10, y:10 };
    const target = { x:90, y:90 };
    const next = stepBroadcastPoint(start, target, elapsedMs, LIVE_BROADCAST_PLAYER_SPEED);
    const travelled = Math.hypot(next.x - start.x, next.y - start.y);

    expect(travelled).toBeGreaterThan(0);
    expect(travelled).toBeLessThanOrEqual(LIVE_BROADCAST_PLAYER_SPEED * elapsedMs / 1000 + 1e-9);
    expect(next).not.toEqual(target);
  });

  it('moves continuously over repeated frames instead of accepting a large coordinate jump', () => {
    let current = { x:18, y:75 };
    const target = { x:78, y:20 };
    const frames = [];
    for (let frame = 0; frame < 20; frame += 1) {
      const next = stepBroadcastPoint(current, target, 33, LIVE_BROADCAST_PLAYER_SPEED);
      frames.push(Math.hypot(next.x - current.x, next.y - current.y));
      current = next;
    }
    expect(Math.max(...frames)).toBeLessThanOrEqual(LIVE_BROADCAST_PLAYER_SPEED * .033 + 1e-9);
    expect(Math.hypot(current.x - 18, current.y - 75)).toBeGreaterThan(10);
  });

  it('allows the ball to travel faster than players while retaining a per-frame ceiling', () => {
    const player = stepBroadcastCoordinate(5, 95, 33, LIVE_BROADCAST_PLAYER_SPEED);
    const ball = stepBroadcastCoordinate(5, 95, 33, LIVE_BROADCAST_BALL_SPEED);
    expect(ball - 5).toBeGreaterThan(player - 5);
    expect(ball - 5).toBeLessThanOrEqual(LIVE_BROADCAST_BALL_SPEED * .033 + 1e-9);
  });

  it('is installed once at app boot rather than changing authoritative match timing', () => {
    expect(mainSource).toContain("import { installLiveBroadcastMotionSmoother } from './game/liveBroadcastMotionSmoother.js';");
    expect(mainSource).toContain('installLiveBroadcastMotionSmoother();');
    expect(mainSource).not.toContain('WATCH_TICK_MS');
    expect(mainSource).not.toContain('simulateMatchSegment');
  });
});
