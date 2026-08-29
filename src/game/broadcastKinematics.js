function clamp(value) { return Math.max(3, Math.min(97, value)); }

function maxSpeed(marker) {
  if (marker.position === 'GK') return 2.2;
  if (['CB', 'RB', 'LB'].includes(marker.position)) return 4.2;
  return marker.receiving || marker.pressing ? 6.4 : 5.2;
}

/** Create one persistent movement world. Target frames may change; positions do not reset. */
export function createBroadcastWorld(frame) {
  return {
    action: frame.action,
    markers: frame.markers.map(marker => ({ ...marker, vx: 0, vy: 0, targetX: marker.x, targetY: marker.y })),
    ball: { ...frame.ball, vx: 0, vy: 0, targetX: frame.ball.x, targetY: frame.ball.y, targetId: frame.ball.shooting ? null : (frame.ball.to?.id ?? null) },
  };
}

/** Feed a new abstract match phase into the existing world without teleporting it. */
export function retargetBroadcastWorld(world, frame) {
  const targets = new Map(frame.markers.map(marker => [marker.id, marker]));
  const existing = new Map(world.markers.map(marker => [marker.id, marker]));
  world.markers = frame.markers.map(target => existing.get(target.id) ?? { ...target, vx: 0, vy: 0, targetX: target.x, targetY: target.y });
  for (const marker of world.markers) {
    const target = targets.get(marker.id);
    if (!target) continue;
    marker.targetX = target.x;
    marker.targetY = target.y;
    marker.pressing = target.pressing;
    marker.receiving = target.receiving;
    marker.rushing = target.rushing;
    marker.team = target.team;
    marker.shirt = target.shirt;
  }
  world.action = frame.action;
  world.ball.targetX = frame.ball.x;
  world.ball.targetY = frame.ball.y;
  world.ball.targetId = frame.ball.shooting ? null : (frame.ball.to?.id ?? null);
  world.ball.shooting = frame.ball.shooting;
  return world;
}

function steer(body, dt, speed, response = 2.25) {
  const dx = body.targetX - body.x;
  const dy = body.targetY - body.y;
  const distance = Math.hypot(dx, dy);
  const arrival = Math.min(1, distance / 6);
  const desiredX = distance > .001 ? (dx / distance) * speed * arrival : 0;
  const desiredY = distance > .001 ? (dy / distance) * speed * arrival : 0;
  const blend = Math.min(1, response * dt);
  body.vx += (desiredX - body.vx) * blend;
  body.vy += (desiredY - body.vy) * blend;
}

/** Advance by real elapsed time. This is deliberately independent of match-result maths. */
export function advanceBroadcastWorld(world, elapsedMs) {
  const dt = Math.min(50, Math.max(0, elapsedMs)) / 1000;
  if (!dt) return snapshotBroadcastWorld(world);

  for (const marker of world.markers) steer(marker, dt, maxSpeed(marker));

  // Soft separation prevents the stacked discs that make motion read as a jump.
  for (let i = 0; i < world.markers.length; i++) {
    for (let j = i + 1; j < world.markers.length; j++) {
      const a = world.markers[i]; const b = world.markers[j];
      const dx = a.x - b.x; const dy = a.y - b.y; const distance = Math.hypot(dx, dy);
      const minimum = a.pressing || b.pressing ? 2.8 : 3.8;
      if (distance >= minimum) continue;
      const force = (minimum - distance) * 1.8;
      const nx = distance > .001 ? dx / distance : (i % 2 ? 1 : -1);
      const ny = distance > .001 ? dy / distance : (j % 2 ? .25 : -.25);
      a.vx += nx * force * dt; a.vy += ny * force * dt;
      b.vx -= nx * force * dt; b.vy -= ny * force * dt;
    }
  }

  for (const marker of world.markers) {
    marker.x = clamp(marker.x + marker.vx * dt);
    marker.y = clamp(marker.y + marker.vy * dt);
  }

  const receiver = world.ball.targetId && world.markers.find(marker => marker.id === world.ball.targetId);
  if (receiver) { world.ball.targetX = receiver.x; world.ball.targetY = receiver.y; }
  steer(world.ball, dt, world.ball.shooting ? 30 : 20, world.ball.shooting ? 8 : 4.5);
  world.ball.x = clamp(world.ball.x + world.ball.vx * dt);
  world.ball.y = clamp(world.ball.y + world.ball.vy * dt);
  return snapshotBroadcastWorld(world);
}

export function snapshotBroadcastWorld(world) {
  return {
    action: world.action,
    markers: world.markers.map(marker => ({ id: marker.id, shirt: marker.shirt, position: marker.position, team: marker.team, x: marker.x, y: marker.y, pressing: marker.pressing, receiving: marker.receiving, rushing: marker.rushing })),
    ball: { x: world.ball.x, y: world.ball.y, shooting: world.ball.shooting },
  };
}
