export const PLAYABLE_POC_SCENE_VERSION = 1;

// Phase 1 renderer decision: Three.js r185.1. The same-scene spike showed no
// PlayCanvas capability advantage for this bounded shooter/keeper interaction,
// while the exact current minified ESM payload is materially smaller. Keep the
// engine version and URL pinned; Phase 2 may move this into the normal package
// graph when the POC becomes a persistent career feature.
export const PLAYABLE_POC_RENDERERS = Object.freeze({
  three:Object.freeze({
    id:'three',
    label:'Three.js',
    version:'0.185.1',
    licence:'MIT',
    moduleUrl:'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js',
  }),
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function easeInOut(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function phaseProgress(progress, start, end) {
  return clamp((progress - start) / Math.max(.0001, end - start), 0, 1);
}

export function createSyntheticPlayableMoment(mode = 'attack') {
  return {
    version:1,
    phase:0,
    minute:0,
    mode,
    attackingTeamId:'poc-attack',
    defendingTeamId:'poc-defence',
    shooterId:'poc-shooter',
    shooterName:'POC Striker',
    goalkeeperId:'poc-keeper',
    goalkeeperName:'POC Keeper',
    defenderId:'poc-defender',
    route:'synthetic_penalty_harness',
    xg:.76,
    geometry:{
      coordinateSystem:'goal-facing-v1',
      goal:{ width:7.32, height:2.44 },
      channel:0,
      distance:11,
      shooter:{ x:0, y:0, z:11.7 },
      goalkeeper:{ x:0, y:0, z:.35 },
      defender:{ x:1.2, y:0, z:5.8 },
      ball:{ x:0, y:.11, z:11 },
    },
  };
}

export function gestureToPlayableIntent({ mode, start, end, bounds, durationMs = 520 } = {}) {
  if (!start || !end || !bounds?.width || !bounds?.height) return null;
  const normalizedX = clamp(((end.x - bounds.left) / bounds.width - .5) * 2, -1.25, 1.25);
  const normalizedY = clamp(1 - ((end.y - bounds.top) / bounds.height), -.2, 1.2);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const power = clamp(distance / (bounds.height * .58), .18, 1);
  const timing = clamp(1 - Math.abs(Number(durationMs) - 480) / 900, .2, 1);

  if (mode === 'goalkeeper') {
    return {
      goalkeeper:{
        x:clamp(normalizedX, -1, 1),
        y:clamp(normalizedY, 0, 1),
        timing,
      },
    };
  }
  return { attack:{ aimX:normalizedX, aimY:normalizedY, power, timing } };
}

export function sceneWorldFromMoment(moment) {
  const geometry = moment?.geometry ?? createSyntheticPlayableMoment().geometry;
  const goalWidth = Number(geometry.goal?.width ?? 7.32);
  const goalHeight = Number(geometry.goal?.height ?? 2.44);
  const distance = Number(geometry.distance ?? 11);
  const shooter = geometry.shooter ?? { x:0, y:0, z:distance + .7 };
  const keeper = geometry.goalkeeper ?? { x:0, y:0, z:.35 };
  const ball = geometry.ball ?? { x:0, y:.11, z:distance };
  const defender = geometry.defender ?? {
    x:clamp(Number(geometry.channel ?? 0) * 1.8 + .8, -2.2, 2.2),
    y:0,
    z:Math.max(3.4, distance * .52),
  };
  return {
    version:PLAYABLE_POC_SCENE_VERSION,
    goalWidth,
    goalHeight,
    distance,
    shooter:{ x:Number(shooter.x ?? 0), y:Number(shooter.y ?? 0), z:Number(shooter.z ?? distance + .7) },
    keeper:{ x:Number(keeper.x ?? 0), y:Number(keeper.y ?? 0), z:Number(keeper.z ?? .35) },
    defender:{ x:Number(defender.x ?? 0), y:Number(defender.y ?? 0), z:Number(defender.z ?? Math.max(3.4, distance * .52)) },
    ball:{ x:Number(ball.x ?? 0), y:Number(ball.y ?? .11), z:Number(ball.z ?? distance) },
  };
}

export function samplePlayablePocMotion(moment, resolution, progress = 0) {
  const world = sceneWorldFromMoment(moment);
  const shot = resolution?.shot ?? resolution ?? null;
  const target = shot?.presentation?.target ?? { x:0, y:.48, power:.72 };
  const outcome = shot?.finish ?? null;
  const run = easeInOut(phaseProgress(progress, .02, .28));
  const strike = easeInOut(phaseProgress(progress, .22, .42));
  const flight = easeInOut(phaseProgress(progress, .38, .82));
  const recovery = easeInOut(phaseProgress(progress, .72, 1));

  const targetX = Number(target.x ?? 0) * world.goalWidth / 2;
  const targetY = clamp(Number(target.y ?? .48), -.35, 1.35) * world.goalHeight;
  let targetZ = -.28;
  if (outcome === 'saved') targetZ = Number(world.keeper.z ?? .35) + .2;
  if (outcome === 'blocked') targetZ = world.defender.z + .08;

  const keeperPlan = shot?.presentation?.keeper ?? null;
  const keeperTargetX = keeperPlan ? Number(keeperPlan.x ?? 0) * world.goalWidth * .43 : targetX * .8;
  const keeperTargetY = keeperPlan ? Number(keeperPlan.y ?? .45) * world.goalHeight : targetY * .82;
  const keeperMove = easeInOut(phaseProgress(progress, .40, .72));
  const blockMove = outcome === 'blocked' ? easeInOut(phaseProgress(progress, .30, .54)) : 0;

  const contactProgress = outcome ? flight : 0;
  const ballX = outcome === 'blocked'
    ? lerp(world.ball.x, world.defender.x, contactProgress)
    : lerp(world.ball.x, targetX, contactProgress);
  const ballY = outcome === 'blocked'
    ? lerp(world.ball.y, .62, contactProgress)
    : lerp(world.ball.y, targetY, contactProgress);
  const ballZ = outcome === 'blocked'
    ? lerp(world.ball.z, targetZ, contactProgress)
    : lerp(world.ball.z, targetZ, contactProgress);

  return {
    progress:clamp(progress, 0, 1),
    outcome,
    shooter:{
      x:world.shooter.x,
      y:0,
      z:lerp(world.shooter.z + .8, world.shooter.z, run),
      lean:lerp(0, -.18, strike),
      kick:Math.sin(strike * Math.PI) * 1.12,
      plant:-Math.sin(strike * Math.PI) * .18,
      arms:Math.sin(strike * Math.PI) * .28,
      recovery,
    },
    keeper:{
      x:lerp(world.keeper.x, keeperTargetX, keeperMove),
      y:lerp(0, Math.max(0, keeperTargetY - .72), keeperMove),
      z:world.keeper.z,
      dive:keeperMove,
      roll:clamp(keeperTargetX / Math.max(.1, world.goalWidth / 2), -1, 1) * 1.18 * keeperMove,
      arms:.3 + keeperMove * .9,
    },
    defender:{
      x:world.defender.x,
      y:0,
      z:lerp(world.defender.z, world.defender.z + .45, blockMove),
      lunge:blockMove,
    },
    ball:{ x:ballX, y:ballY, z:ballZ, visible:true },
    world,
  };
}

export function percentile95(samples = []) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a,b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))];
}
