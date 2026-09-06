export const PLAYABLE_POC_SCENE_VERSION = 2;

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

export const SYNTHETIC_SPECIAL_FINISH_ZONE = Object.freeze({
  centerX:.79,
  centerY:.82,
  radiusX:.18,
  radiusY:.17,
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

function motionPulse(progress, start, peak, end) {
  if (progress <= start || progress >= end) return 0;
  if (progress <= peak) return easeInOut(phaseProgress(progress, start, peak));
  return 1 - easeInOut(phaseProgress(progress, peak, end));
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
  const zone = SYNTHETIC_SPECIAL_FINISH_ZONE;
  const closestCornerX = attack.aimX < 0 ? -zone.centerX : zone.centerX;
  const dx = Math.abs(attack.aimX - closestCornerX) / zone.radiusX;
  const dy = Math.abs(attack.aimY - zone.centerY) / zone.radiusY;
  return (dx * dx) + (dy * dy) <= 1;
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
    ? { x:Number((target.x * .48).toFixed(4)), y:Number((target.y * .52).toFixed(4)), timing:.74, reach:.42 }
    : { x:target.x, y:target.y, timing:.94, reach:.64 };

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
    contact:geometry.contact ? {
      x:Number(geometry.contact.x ?? ball.x ?? 0),
      y:Number(geometry.contact.y ?? ball.y ?? .11),
      z:Number(geometry.contact.z ?? distance),
    } : null,
  };
}

function goalkeeperIntervention(shot) {
  return shot?.goalkeeperIntervention
    ?? shot?.presentation?.goalkeeperIntervention
    ?? shot?.presentation?.keeper?.intervention
    ?? (shot?.finish === 'saved' ? 'parry' : null);
}

function contactMotionProfile(moment, progress, recovery) {
  const type = moment?.contactType ?? moment?.geometry?.staging?.contactType ?? null;
  const isHeader = type === 'standing_header' || type === 'running_header';
  const runningHeader = type === 'running_header';
  const volley = type === 'volley';
  const halfVolley = type === 'half_volley';
  const pulse = motionPulse(progress, .22, .42, .64) * (1 - recovery);
  const approach = runningHeader ? easeInOut(phaseProgress(progress, .02, .37)) : easeInOut(phaseProgress(progress, .08, .34));
  const jump = isHeader ? pulse * (runningHeader ? .27 : .16) : volley ? pulse * .035 : 0;
  const kick = isHeader ? 0 : volley ? pulse * 1.28 : halfVolley ? pulse * .84 : pulse;
  const backswing = isHeader ? 0 : motionPulse(progress, .18, .31, .41) * (1 - recovery);
  const headDip = isHeader ? pulse * (runningHeader ? .20 : .15) : pulse * .04;
  const lean = isHeader ? pulse * (runningHeader ? .19 : .14) : volley ? pulse * .17 : halfVolley ? pulse * .11 : pulse * .10;
  const plant = isHeader ? 0 : pulse * (halfVolley ? .11 : .18);
  const plantBend = isHeader ? pulse * .12 : pulse * (halfVolley ? .38 : .27);
  const arms = isHeader ? .18 + pulse * .54 : .16 + pulse * .42;
  const torsoTwist = isHeader ? 0 : pulse * .10;
  return {
    type,
    isHeader,
    runningHeader,
    approach,
    jump,
    kick,
    backswing,
    followThrough:pulse,
    headDip,
    lean,
    plant,
    plantBend,
    arms,
    torsoTwist,
  };
}

export function samplePlayablePocMotion(moment, resolution, progress = 0) {
  const world = sceneWorldFromMoment(moment);
  const shot = resolution?.shot ?? resolution ?? null;
  const target = shot?.presentation?.target ?? { x:0, y:.48, power:.72 };
  const outcome = shot?.finish ?? null;
  const isContact = moment?.interactionType === 'contact' && world.contact;
  const recovery = easeInOut(phaseProgress(progress, .84, 1));
  const targetDirection = clamp(Number(target.x ?? 0), -1, 1);

  let shooterPose;
  let strikeAt = .43;
  if (isContact) {
    const contactProfile = contactMotionProfile(moment, progress, recovery);
    const incoming = easeInOut(phaseProgress(progress, .04, .42));
    const runningStride = Math.sin(contactProfile.approach * Math.PI * 3.2) * (1 - contactProfile.approach);
    shooterPose = {
      x:world.shooter.x + runningStride * .035,
      y:contactProfile.jump,
      z:lerp(world.shooter.z, world.contact.z, contactProfile.approach),
      lean:contactProfile.lean,
      kick:contactProfile.kick,
      plant:contactProfile.plant,
      plantBend:contactProfile.plantBend,
      arms:contactProfile.arms,
      torsoTwist:targetDirection * contactProfile.torsoTwist,
      headDip:contactProfile.headDip,
      backswing:contactProfile.backswing,
      followThrough:contactProfile.followThrough,
      recovery,
      contactType:contactProfile.type,
      incoming,
    };
  } else {
    const approach = easeInOut(phaseProgress(progress, .01, .27));
    const runStride = Math.sin(approach * Math.PI * 3.5) * (1 - approach);
    const backswing = motionPulse(progress, .17, .29, .38);
    const strikeDrive = motionPulse(progress, .29, .43, .62);
    const plantSet = easeInOut(phaseProgress(progress, .22, .39));
    const plantBend = motionPulse(progress, .27, .39, .66);
    const groundRecovery = easeInOut(phaseProgress(progress, .74, 1));
    shooterPose = {
      x:world.shooter.x + runStride * .025,
      y:Math.abs(runStride) * .018,
      z:lerp(world.shooter.z + 1.05, world.shooter.z, approach),
      lean:(-.055 * backswing + .13 * strikeDrive) * (1 - groundRecovery),
      kick:(-.38 * backswing + 1.24 * strikeDrive) * (1 - groundRecovery),
      plant:.17 * plantSet * (1 - groundRecovery),
      plantBend:.32 * plantBend * (1 - groundRecovery),
      arms:(.16 + strikeDrive * .34 + backswing * .14) * (1 - groundRecovery),
      torsoTwist:targetDirection * .10 * strikeDrive * (1 - groundRecovery),
      headDip:.06 * strikeDrive * (1 - groundRecovery),
      backswing,
      followThrough:strikeDrive * (1 - groundRecovery),
      recovery:groundRecovery,
      contactType:null,
      incoming:0,
    };
  }

  const intervention = goalkeeperIntervention(shot);
  const keeperPlan = shot?.presentation?.keeper ?? null;
  const keeperTargetX = keeperPlan ? Number(keeperPlan.x ?? 0) * world.goalWidth * .43 : Number(target.x ?? 0) * world.goalWidth * .40;
  const keeperTargetY = keeperPlan ? Number(keeperPlan.y ?? .45) * world.goalHeight : Number(target.y ?? .45) * world.goalHeight;
  const keeperCrouchBase = motionPulse(progress, .28, .40, .50);
  const keeperPush = easeInOut(phaseProgress(progress, .43, .56));
  const keeperExtension = easeInOut(phaseProgress(progress, .48, .71));
  const keeperLanding = easeInOut(phaseProgress(progress, .70, .84));
  const keeperRecovery = easeInOut(phaseProgress(progress, .84, 1));
  const keeperPoseAmount = keeperExtension * (1 - keeperRecovery);
  const keeperArc = Math.sin(clamp(phaseProgress(progress, .44, .84), 0, 1) * Math.PI);
  const keeperSide = Math.sign(keeperTargetX) || 1;
  const isSmother = intervention === 'smother';
  const isSpread = intervention === 'spread';
  const isCatch = intervention === 'catch';
  const keeperDiveScale = isSmother ? .28 : isSpread ? .72 : isCatch ? .58 : 1;
  const keeperRollScale = isSmother ? .22 : isSpread ? .55 : isCatch ? .48 : 1;
  const keeperLift = isSmother ? .02 : isSpread ? .06 : clamp((keeperTargetY - .90) * .55, .08, .48);
  const keeperCrouch = keeperCrouchBase * (isSmother ? 1.7 : isSpread ? 1.35 : 1) * (1 - keeperRecovery);
  const keeperPose = {
    x:lerp(world.keeper.x, keeperTargetX, keeperPush * keeperPoseAmount * keeperDiveScale),
    y:keeperLift * keeperArc * keeperPoseAmount,
    z:isSmother ? world.keeper.z + keeperPoseAmount * .18 : isSpread ? world.keeper.z + keeperPoseAmount * .10 : world.keeper.z,
    dive:keeperPoseAmount * keeperDiveScale,
    roll:clamp(keeperTargetX / Math.max(.1, world.goalWidth / 2), -1, 1) * 1.12 * keeperPoseAmount * keeperRollScale,
    arms:.12 + keeperPoseAmount * (isSpread ? .74 : isSmother ? .48 : .98),
    crouch:keeperCrouch,
    push:keeperPush * (1 - keeperRecovery),
    landing:keeperLanding * (1 - keeperRecovery),
    recovery:keeperRecovery,
    intervention,
    spread:isSpread ? keeperPoseAmount : 0,
    smother:isSmother ? keeperPoseAmount : 0,
    catch:isCatch ? keeperPoseAmount : 0,
    side:keeperSide,
  };

  const defenderRecovery = isContact ? recovery : easeInOut(phaseProgress(progress, .74, 1));
  const defenderLunge = outcome === 'blocked'
    ? easeInOut(phaseProgress(progress, .31, .55)) * (1 - defenderRecovery)
    : 0;

  const targetX = Number(target.x ?? 0) * world.goalWidth / 2;
  const targetY = clamp(Number(target.y ?? .48), -.35, 1.35) * world.goalHeight;
  const shotStart = isContact ? world.contact : world.ball;
  const incomingProgress = isContact && outcome ? easeInOut(phaseProgress(progress, .04, strikeAt)) : 0;
  const outgoingStart = isContact ? strikeAt : .43;
  const outgoingEnd = .82;
  const flight = outcome ? easeInOut(phaseProgress(progress, outgoingStart, outgoingEnd)) : 0;
  let ballX = world.ball.x;
  let ballY = world.ball.y;
  let ballZ = world.ball.z;
  let ballMotionProgress = 0;
  let parryProgress = 0;
  let controlled = false;

  if (isContact && incomingProgress < 1) {
    const incomingArc = Math.sin(incomingProgress * Math.PI) * (moment.contactType?.includes('header') ? .16 : .08);
    ballX = lerp(world.ball.x, world.contact.x, incomingProgress);
    ballY = lerp(world.ball.y, world.contact.y, incomingProgress) + incomingArc;
    ballZ = lerp(world.ball.z, world.contact.z, incomingProgress);
    ballMotionProgress = incomingProgress * .5;
  } else if (outcome === 'saved') {
    const saveFlight = easeInOut(phaseProgress(progress, outgoingStart, .70));
    const saveContactX = keeperTargetX;
    const saveContactY = isSmother
      ? .20
      : isSpread ? clamp(keeperTargetY * .68, .22, .68)
        : clamp(keeperTargetY, .32, world.goalHeight * .96);
    const saveContactZ = Number(world.keeper.z ?? .35) + (isSmother ? .42 : isSpread ? .26 : .18);
    ballMotionProgress = .5 + saveFlight * .5;

    if (isCatch || isSmother) {
      const controlProgress = easeInOut(phaseProgress(progress, .70, .86));
      controlled = controlProgress > 0;
      const holdX = isSmother ? keeperTargetX * .35 : saveContactX;
      const holdY = isSmother ? .18 : saveContactY;
      const holdZ = isSmother ? world.keeper.z + .46 : saveContactZ + .04;
      if (controlProgress > 0) {
        ballX = lerp(saveContactX, holdX, controlProgress);
        ballY = lerp(saveContactY, holdY, controlProgress);
        ballZ = lerp(saveContactZ, holdZ, controlProgress);
      } else {
        ballX = lerp(shotStart.x, saveContactX, saveFlight);
        ballY = lerp(shotStart.y, saveContactY, saveFlight);
        ballZ = lerp(shotStart.z, saveContactZ, saveFlight);
      }
    } else {
      parryProgress = easeInOut(phaseProgress(progress, .70, .96));
      const parrySide = saveContactX < 0 ? -1 : 1;
      const deflectionScale = isSpread ? .55 : 1;
      const parryX = saveContactX + parrySide * (1.05 + Math.abs(saveContactX) * .16) * deflectionScale;
      const parryY = Math.max(.16, saveContactY * (isSpread ? .30 : .48));
      const parryZ = saveContactZ + (isSpread ? 1.85 : 3.15);
      if (parryProgress > 0) {
        const reboundArc = Math.sin(parryProgress * Math.PI) * (isSpread ? .18 : .42);
        ballX = lerp(saveContactX, parryX, parryProgress);
        ballY = lerp(saveContactY, parryY, parryProgress) + reboundArc;
        ballZ = lerp(saveContactZ, parryZ, parryProgress);
      } else {
        const saveArc = Math.sin(saveFlight * Math.PI) * (.08 + clamp(Number(target.power ?? .72), 0, 1) * .12);
        ballX = lerp(shotStart.x, saveContactX, saveFlight);
        ballY = lerp(shotStart.y, saveContactY, saveFlight) + saveArc;
        ballZ = lerp(shotStart.z, saveContactZ, saveFlight);
      }
      ballMotionProgress += parryProgress;
    }
  } else if (outcome) {
    const terminalZ = outcome === 'blocked' ? world.defender.z + .08 : -.28;
    const terminalX = outcome === 'blocked' ? world.defender.x : targetX;
    const terminalY = outcome === 'blocked' ? .62 : targetY;
    const shotArc = outcome !== 'blocked'
      ? Math.sin(flight * Math.PI) * (.08 + clamp(Number(target.power ?? .72), 0, 1) * .12)
      : 0;
    ballX = lerp(shotStart.x, terminalX, flight);
    ballY = lerp(shotStart.y, terminalY, flight) + shotArc;
    ballZ = lerp(shotStart.z, terminalZ, flight);
    ballMotionProgress = (isContact ? .5 : 0) + flight;
  }

  return {
    progress:clamp(progress, 0, 1),
    outcome,
    shooter:shooterPose,
    keeper:keeperPose,
    defender:{
      x:world.defender.x,
      y:0,
      z:lerp(world.defender.z, world.defender.z + .45, defenderLunge),
      lunge:defenderLunge,
      recovery:defenderRecovery,
    },
    ball:{
      x:ballX,
      y:ballY,
      z:ballZ,
      visible:true,
      spinX:ballMotionProgress * Math.PI * 8,
      spinZ:targetDirection * ballMotionProgress * Math.PI * 2.4,
      parry:parryProgress,
      controlled,
      intervention,
      contactType:isContact ? moment.contactType ?? moment.geometry?.staging?.contactType ?? null : null,
    },
    world,
  };
}

export function percentile95(samples = []) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a,b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))];
}
