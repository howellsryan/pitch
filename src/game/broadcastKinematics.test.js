import { describe, expect, it } from 'vitest';
import { advanceBroadcastWorld, createBroadcastWorld, retargetBroadcastWorld } from './broadcastKinematics.js';

const frame = (x = 20) => ({ action:'PASSING', markers:[{id:'p1',shirt:1,position:'CM',team:'home',x,y:50}], ball:{x,y:50,to:{id:'p1'}} });

describe('broadcast kinematics', () => {
  it('retargets without teleporting a player', () => { const world = createBroadcastWorld(frame()); retargetBroadcastWorld(world, frame(80)); expect(world.markers[0].x).toBe(20); const next = advanceBroadcastWorld(world, 33); expect(next.markers[0].x).toBeGreaterThan(20); expect(next.markers[0].x).toBeLessThan(21); });
  it('preserves velocity across frames and converges smoothly', () => { const world = createBroadcastWorld(frame()); retargetBroadcastWorld(world, frame(40)); let previous = 20; for (let i = 0; i < 120; i++) { const next = advanceBroadcastWorld(world, 33); expect(next.markers[0].x).toBeGreaterThanOrEqual(previous); previous = next.markers[0].x; } expect(previous).toBeGreaterThan(30); expect(previous).toBeLessThan(40); });
  it('sends a shot towards goal instead of continuing to track its receiver', () => { const world = createBroadcastWorld(frame()); retargetBroadcastWorld(world, { ...frame(20), ball:{x:50,y:3,to:{id:'p1'},shooting:true} }); for (let i = 0; i < 30; i++) advanceBroadcastWorld(world, 33); expect(world.ball.y).toBeLessThan(45); expect(world.ball.targetId).toBeNull(); });
});
