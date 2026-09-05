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

export const SYNTHETIC_KEEPER_TARGETS = Object.freeze([
  Object.freeze({ x:-.76, y:.78, label:'TOP LEFT' }),
  Object.freeze({ x:.76, y:.78, label:'TOP RIGHT' }),
  Object.freeze({ x:-.74, y:.30, label:'LOW LEFT' }),
  Object.freeze({ x:.74, y:.30, label:'LOW RIGHT' }),
  Object.freeze({ x:-.56, y:.55, label:'MID LEFT' }),
  Object.freeze({ x:.56, y:.55, label:'MID RIGHT' }),
]);

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

function numeric(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function syntheticTargetAt(attempt = 0) {
  const index = Math.abs(Math.trunc(numeric(attempt, 0))) % SYNTHETIC_KEEPER_TARGETS.length;
  return { ...SYNTHETIC_KEEPER_TARGETS[index], index };
}

export function createSyntheticPlayableMoment(mode = 'attack', attempt = 0) {
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
    syntheticTarget:mode === 'goalkeeper' ? syntheticTargetAt(attempt) : null,
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

export function gestureToPlayableIntent({ mode, start, end, bounds, durationMs = 520, goalTarget = null } = {}) {
  if (!start || !end || !bounds?.width || !bounds?.height) return null;
  const fallbackX = clamp(((end.x - bounds.left) / bounds.width - .5) * 2, -1.25, 1.25);
  const fallbackY = clamp(1 - ((end.y - bounds.top) / bounds.height), -.2, 1.2);
  const normalizedX = clamp(numeric(goalTarget?.x, fallbackX), -1.25, 1.25);
  const normalizedY = clamp(numeric(goalTarget?.y, fallbackY), -.2, 1.2);
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

function syntheticAttack(intent = {}) {
  const attack = intent?.attack ?? {};
  return {
    aimX:clamp(numeric(attack.aimX, 0), -1.25, 1.25),
    aimY:clamp(numeric(attack.aimY, .50), -.2, 1.2),
    power:clamp(numeric(attack.power, .72), 0, 1),
    timing:clamp(numeric(attack.timing, .82), 0, 1),
  };
}

function syntheticKeeper(intent = {}) {
  const goalkeeper = intent?.goalkeeper ?? {};
  return {
    x:clamp(numeric(goalkeeper.x, 0), -1, 1),
    y:clamp(numeric(goalkeeper.y, .48), 0, 1),
    timing:clamp(numeric(goalkeeper.timing, .72), 0, 1),
  };
}

export function isSyntheticSpecialFinish(intent = {}) {
  const attack = syntheticAttack(intent);
  return Math.abs(attack.aimX) >= .68
    && Math.abs(attack.aimX) <= .98
    && attack.aimY >= .70
    && attack.aimY <= .96
    && attack.power >= .68
    && attack.timing >= .72;
}

export function resolveSyntheticAttackShot(intent = {}) {
  const attack = syntheticAttack(intent);
  const target = {
    x:Number(attack.aimX.toFixed(4)),
    y:Number(attack.aimY.toFixed(4)),
    power:Number(attack.power.toFixed(4)),
    executionQuality:Number(((attack.timing * .72) + (attack.power * .28)).toFixed(4)),
  };
  const insideGoal = Math.abs(target.x) <= 1 && target.y >= 0 && target.y <= 1;
  const special = insideGoal && isSyntheticSpecialFinish({ attack });

  if (!insideGoal) {
    return {
      finish:'missed', onTarget:false, goal:false,
      shooting:86, pressure:80, goalkeeping:84,
      syntheticSpecial:false,
      presentation:{ target, blockerId:null, keeper:null, contact:'miss', syntheticSpecial:false },
    };
  }

  const keeper = special
    ? {
        x:Number((target.x * .56).toFixed(4)),
        y:Number((target.y * .58).toFixed(4)),
        timing:.78,
        reach:.46,
      }
    : {
        x:target.x,
        y:target.y,
        timing:.94,
        reach:.64,
      };

  return {
    finish:special ? 'goal' : 'saved',
    onTarget:true,
    goal:special,
    shooting:86,
    pressure:80,
    goalkeeping:84,
    syntheticSpecial:special,
    presentation:{
      target,
      blockerId:null,
      keeper,
      contact:special ? 'goal' : 'save',
      syntheticSpecial:special,
    },
  };
}

export function resolveSyntheticGoalkeeperShot(moment, intent = {}) {
  const targetSource = moment?.syntheticTarget ?? syntheticTargetAt(0);
  const target = {
    x:clamp(numeric(targetSource.x, -.76), -1, 1),
    y:clamp(numeric(targetSource.y, .78), 0, 1),
    power:.78,
    executionQuality:.86,
  };
  const goalkeeper = syntheticKeeper(intent);
  const dx = target.x - goalkeeper.x;
  const dy = (target.y - goalkeeper.y) * 1.12;
  const distance = Math.sqrt(dx * dx + dy * dy);
  // The synthetic keeper drill intentionally favours a correct read. The cue
  // teaches the interaction rather than asking the POC user to guess a hidden
  // RNG target; timing and approximate placement still matter.
  const reach = .46 + goalkeeper.timing * .20;
  const saved = distance <= reach;

  return {
    finish:saved ? 'saved' : 'goal',
    onTarget:true,
    goal:!saved,
    shooting:84,
    pressure:0,
    goalkeeping:84,
    syntheticCue:targetSource.label ?? null,
    presentation:{
      target,
      blockerId:null,
      keeper:{
        x:Number(goalkeeper.x.toFixed(4)),
        y:Number(goalkeeper.y.toFixed(4)),
        timing:Number(goalkeeper.timing.toFixed(4)),
        reach:Number(reach.toFixed(4)),
      },
      contact:saved ? 'save' : 'goal',
      syntheticCue:targetSource.label ?? null,
    },
  };
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
  const recovery = easeInOut(phaseProgress(progress, .74, 1));
  const strikePulse = Math.sin(strike * Math.PI);
  const keeperDive = easeInOut(phaseProgress(progress, .40, .72));
  const keeperPose = keeperDive * (1 - recovery);
  const defenderLunge = outcome === 'blocked' ? easeInOut(phaseProgress(progress, .30, .54)) * (1 - recovery) : 0;

  const targetX = Number(target.x ?? 0) * world.goalWidth / 2;
  const targetY = clamp(Number(target.y ?? .48), -.35, 1.35) * world.goalHeight;
  let targetZ = -.28;
  if (outcome === 'saved') targetZ = Number(world.keeper.z ?? .35) + .2;
  if (outcome === 'blocked') targetZ = world.defender.z + .08;

  const keeperPlan = shot?.presentation?.keeper ?? null;
  const keeperTargetX = keeperPlan ? Number(keeperPlan.x ?? 0) * world.goalWidth * .43 : targetX * .8;
  const keeperTargetY = keeperPlan ? Number(keeperPlan.y ?? .45) * world.goalHeight : targetY * .82;

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
      lean:-.14 * strikePulse * (1 - recovery),
      kick:strikePulse * 1.18 * (1 - recovery),
      plant:-strikePulse * .16 * (1 - recovery),
      arms:strikePulse * .24 * (1 - recovery),
      recovery,
    },
    keeper:{
      x:lerp(world.keeper.x, keeperTargetX, keeperPose),
      y:lerp(0, Math.max(0, keeperTargetY - .58), keeperPose),
      z:world.keeper.z,
      dive:keeperPose,
      roll:clamp(keeperTargetX / Math.max(.1, world.goalWidth / 2), -1, 1) * 1.05 * keeperPose,
      arms:.18 + keeperPose * .82,
      recovery,
    },
    defender:{
      x:world.defender.x,
      y:0,
      z:lerp(world.defender.z, world.defender.z + .45, defenderLunge),
      lunge:defenderLunge,
      recovery,
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
