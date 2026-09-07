// Presentation-only direction for the currently shipped attacking key moments.
// Everything here is derived from an already-authoritative moment/result. It may
// change staging, camera composition and the visual path between fixed contacts;
// it must never change the official target, finish, scorer or match state.

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value)));
const smooth = value => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

function phase(progress, start, end) {
  return smooth((Number(progress) - start) / Math.max(.0001, end - start));
}

function numeric(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function playableShotPresentationScenario(moment = {}) {
  if (moment?.interactionType === 'continuation') return 'legacy_continuation';
  if (moment?.interactionType === 'contact') return 'legacy_contact';
  if (
    moment?.interactionType === 'shootout'
    || moment?.kickId
    || moment?.shootoutId
    || moment?.route === 'competition_shootout'
    || moment?.route === 'penalty_shootout'
  ) return 'shootout';
  if (moment?.setPiece?.kind === 'direct_free_kick') return 'direct_free_kick';
  if (moment?.setPiece?.kind === 'penalty') return 'penalty';
  return 'open_play';
}

/**
 * Whole-body pre-contact direction. The transform is guaranteed to return to
 * zero at the strike marker, so the generated boot/contact contract remains the
 * source of truth. Penalties deliberately retain the polished workshop run-up.
 */
export function playableShooterDirection(moment = {}, progress = 0) {
  const scenario = playableShotPresentationScenario(moment);
  const beforeContact = 1 - phase(progress, .05, .43);
  if (scenario !== 'open_play' && scenario !== 'direct_free_kick') {
    return { offsetX:0, offsetY:0, offsetZ:0, yaw:0 };
  }

  const channel = clamp(numeric(moment?.geometry?.channel, 0), -1, 1);
  if (scenario === 'direct_free_kick') {
    // Central free kicks use a recognisable angled approach; wide free kicks
    // approach from the open side. No curl control or football outcome is added.
    const side = channel < -.08 ? 1 : -1;
    return {
      offsetX:side * (.62 + Math.abs(channel) * .22) * beforeContact,
      offsetY:0,
      offsetZ:(.52 + Math.abs(channel) * .14) * beforeContact,
      yaw:-side * (.24 + Math.abs(channel) * .05) * beforeContact,
    };
  }

  // Open-play chances keep forward momentum rather than looking like a placed
  // dead ball. Channel only affects presentation direction, never the shot data.
  return {
    offsetX:-channel * .18 * beforeContact,
    offsetY:0,
    offsetZ:.24 * beforeContact,
    yaw:channel * .10 * beforeContact,
  };
}

/** A closing open-play defender moves into the authoritative block point. */
export function playableDefenderDirection(moment = {}, progress = 0) {
  if (playableShotPresentationScenario(moment) !== 'open_play') {
    return { offsetX:0, offsetY:0, offsetZ:0, yaw:0 };
  }
  const relationship = moment?.geometry?.staging?.defenderRelationship ?? 'closing';
  if (relationship === 'trailing') return { offsetX:0, offsetY:0, offsetZ:0, yaw:0 };
  const beforeContact = 1 - phase(progress, .08, .43);
  const channel = clamp(numeric(moment?.geometry?.channel, 0), -1, 1);
  return {
    offsetX:channel * .08 * beforeContact,
    offsetY:0,
    offsetZ:-.58 * beforeContact,
    yaw:0,
  };
}

/**
 * Scenario-aware fixed camera composition. It remains fixed during input/reveal,
 * so pointer-to-goal raycasting stays stable. Penalty/shootout and compatibility
 * values intentionally match the accepted workshop/legacy framing.
 */
export function playableShotCameraComposition(moment = {}, world = {}, aspect = 1) {
  const scenario = playableShotPresentationScenario(moment);
  const safeAspect = Math.max(.35, numeric(aspect, 1));
  const distance = Math.max(1, numeric(world?.distance, 11));
  const shooterX = numeric(world?.shooter?.x, 0);
  const channel = clamp(numeric(moment?.geometry?.channel, 0), -1, 1);

  if (scenario === 'direct_free_kick') {
    const fov = 46;
    const fit = 5.25 / (Math.tan(fov * Math.PI / 360) * safeAspect);
    const approachSide = channel < -.08 ? 1 : -1;
    return {
      fov,
      position:{ x:shooterX * .18 - approachSide * 1.05, y:4.25, z:Math.max(distance + 7.4, fit) },
      lookAt:{ x:channel * .18, y:1.02, z:Math.max(2.5, distance * .34) },
    };
  }

  if (scenario === 'open_play') {
    const close = distance <= 9.5;
    const fov = close ? 45 : 44;
    const fit = 4.85 / (Math.tan(fov * Math.PI / 360) * safeAspect);
    return {
      fov,
      position:{
        x:shooterX * .24 + .48 + channel * .34,
        y:close ? 3.15 : 3.45,
        z:Math.max(distance + (close ? 5.1 : 5.8), fit),
      },
      lookAt:{ x:channel * .12, y:.92, z:Math.max(1.6, distance * .30) },
    };
  }

  const fov = 43;
  const fit = 5.0 / (Math.tan(fov * Math.PI / 360) * safeAspect);
  return {
    fov,
    position:{ x:shooterX * .22 + .65, y:3.9, z:Math.max(distance + 6.4, fit) },
    lookAt:{ x:0, y:.95, z:Math.max(1, distance * .27) },
  };
}

/**
 * Give direct free kicks a readable rise/bend between the already-fixed launch
 * and terminal contact. The envelope is zero at both ends, including goalkeeper
 * contact, so saves/targets remain visually aligned with authoritative geometry.
 */
export function playablePresentedBall(moment = {}, resolution = null, progress = 0, ball = {}) {
  if (playableShotPresentationScenario(moment) !== 'direct_free_kick') return { ...ball };
  const shot = resolution?.shot ?? resolution ?? null;
  const finish = shot?.finish ?? null;
  if (!finish || finish === 'blocked') return { ...ball };

  const end = finish === 'saved' ? .70 : .82;
  const flight = clamp((Number(progress) - .43) / Math.max(.0001, end - .43));
  if (flight <= 0 || flight >= 1) return { ...ball };
  const envelope = Math.sin(flight * Math.PI);
  const targetX = clamp(numeric(shot?.presentation?.target?.x, 0), -1.25, 1.25);
  const channel = clamp(numeric(moment?.geometry?.channel, 0), -1, 1);
  const side = Math.sign(targetX || channel || 1);
  const bend = (.20 + Math.min(.12, Math.abs(targetX) * .10)) * envelope;
  return {
    ...ball,
    x:numeric(ball?.x, 0) - side * bend,
    y:numeric(ball?.y, .11) + .24 * envelope,
  };
}

/** Rotate generated joints around their pelvis, then apply a small world offset. */
export function transformPlayableFootballJoints(joints, transform = {}) {
  if (!joints || typeof joints !== 'object') return joints;
  const yaw = numeric(transform.yaw, 0);
  const offsetX = numeric(transform.offsetX, 0);
  const offsetY = numeric(transform.offsetY, 0);
  const offsetZ = numeric(transform.offsetZ, 0);
  if (!yaw && !offsetX && !offsetY && !offsetZ) return joints;

  const pivot = joints.pelvis ?? { x:0, y:0, z:0 };
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const out = {};
  for (const [name, point] of Object.entries(joints)) {
    if (!point || typeof point !== 'object' || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.z))) {
      out[name] = point;
      continue;
    }
    if (name === 'facing') {
      out[name] = {
        ...point,
        x:numeric(point.x, 0) * cos - numeric(point.z, 0) * sin,
        y:numeric(point.y, 0),
        z:numeric(point.x, 0) * sin + numeric(point.z, 0) * cos,
      };
      continue;
    }
    const dx = numeric(point.x, 0) - numeric(pivot.x, 0);
    const dz = numeric(point.z, 0) - numeric(pivot.z, 0);
    out[name] = {
      ...point,
      x:numeric(pivot.x, 0) + dx * cos - dz * sin + offsetX,
      y:numeric(point.y, 0) + offsetY,
      z:numeric(pivot.z, 0) + dx * sin + dz * cos + offsetZ,
    };
  }
  return out;
}
