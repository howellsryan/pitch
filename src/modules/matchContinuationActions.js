import { effectiveDetailedAttribute } from './playerModel.js';

export const MATCH_CONTINUATION_ACTION_VERSION = 1;
export const PLAYABLE_CONTINUATION_INTENT_VERSION = 1;

function continuationClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function continuationRound(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function continuationDetailed(player, attribute) {
  const value = Number(effectiveDetailedAttribute(player, attribute));
  return Number.isFinite(value) ? value : 50;
}

function continuationWeighted(player, weights = {}) {
  if (!player) return 50;
  let sum = 0;
  let total = 0;
  for (const [attribute, weight] of Object.entries(weights)) {
    const numericWeight = Number(weight);
    if (!(numericWeight > 0)) continue;
    sum += continuationDetailed(player, attribute) * numericWeight;
    total += numericWeight;
  }
  return continuationClamp(total ? sum / total : 50, 1, 99);
}

function continuationStableUnit(input) {
  let hash = 2166136261;
  const text = String(input ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

function continuationFamilyForRoute(route) {
  if (route === 'pass_into_space') return 'through_ball';
  if (route === 'direct_pass') return 'final_pass';
  return null;
}

function continuationTargetZone(prepared, family) {
  const channel = continuationRound((continuationStableUnit(`${prepared.teamId}:${prepared.target?.id}:channel`) - .5) * 1.06, 3);
  return {
    x:channel,
    y:family === 'through_ball' ? .78 : .64,
    radius:family === 'through_ball' ? .24 : .28,
  };
}

function continuationProjectedXg(prepared, family) {
  const base = family === 'through_ball' ? .235 : .175;
  const edge = Number(prepared.execution ?? 50) - Number(prepared.counter ?? 50) + Number(prepared.context ?? 0);
  return continuationRound(continuationClamp(base + edge * .0018, .07, .36), 3);
}

function continuationChanceProbability(prepared, family) {
  const base = family === 'through_ball' ? .28 : .18;
  const success = continuationClamp(Number(prepared.successChance ?? .5), .18, .85);
  return continuationRound(continuationClamp(base * (.72 + success * .58), .06, .44), 4);
}

export function deriveFinalPassContinuation(prepared) {
  if (!prepared?.packet || !prepared.actor || !prepared.target || !prepared.defender) return null;
  const family = continuationFamilyForRoute(prepared.route);
  if (!family) return null;
  if (prepared.actor.id === prepared.target.id) return null;

  const targetZone = continuationTargetZone(prepared, family);
  const projectedXg = continuationProjectedXg(prepared, family);
  const chanceProbability = continuationChanceProbability(prepared, family);
  return {
    version:MATCH_CONTINUATION_ACTION_VERSION,
    family,
    sourceRoute:prepared.route,
    phase:prepared.phase,
    minute:prepared.minute,
    attackingTeamId:prepared.teamId,
    defendingTeamId:prepared.opponentTeamId,
    passerId:prepared.actor.id,
    passerName:prepared.actor.name,
    receiverId:prepared.target.id,
    receiverName:prepared.target.name,
    interceptorId:prepared.defender.id,
    interceptorName:prepared.defender.name,
    authorizedReceiverIds:[prepared.target.id],
    receiverOnsideAuthorized:true,
    targetZone,
    baselineSuccessChance:continuationRound(continuationClamp(Number(prepared.successChance ?? .5), .18, .85), 4),
    failureOutcome:'intercepted',
    downstream:{
      chanceProbability,
      projectedXg,
      shooterId:prepared.target.id,
      assistId:prepared.actor.id,
      pressureDefenderId:prepared.defender.id,
    },
  };
}

export function normalizeContinuationIntent(input = {}) {
  const raw = input?.continuation && typeof input.continuation === 'object' ? input.continuation : input;
  const numeric = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    version:PLAYABLE_CONTINUATION_INTENT_VERSION,
    targetX:continuationClamp(numeric(raw?.targetX, 0), -1, 1),
    targetY:continuationClamp(numeric(raw?.targetY, .68), 0, 1),
    weight:continuationClamp(numeric(raw?.weight, .70), 0, 1),
    timing:continuationClamp(numeric(raw?.timing, .68), 0, 1),
  };
}

function continuationPlayerContext(passer, receiver, defender) {
  const passerQuality = continuationWeighted(passer, { passing:.72, dribbling:.12, physical:.08, pace:.08 });
  const receiverQuality = continuationWeighted(receiver, { pace:.58, physical:.22, dribbling:.20 });
  const defenderQuality = continuationWeighted(defender, { defending:.62, pace:.25, physical:.13 });
  return { passerQuality, receiverQuality, defenderQuality };
}

function continuationExecution(action, passer, receiver, defender, intent) {
  const { passerQuality, receiverQuality, defenderQuality } = continuationPlayerContext(passer, receiver, defender);
  if (!intent) {
    const qualityEdge = (passerQuality - 75) * .0030
      + (receiverQuality - 75) * .0016
      - (defenderQuality - 75) * .0022;
    const successChance = continuationClamp(action.baselineSuccessChance + qualityEdge, .16, .90);
    return {
      successChance,
      executionQuality:continuationClamp((passerQuality * .68 + receiverQuality * .20 + (100 - defenderQuality) * .12) / 100, .08, .98),
      target:{ ...action.targetZone, weight:.70, timing:.68 },
    };
  }

  const normalized = normalizeContinuationIntent(intent);
  const dx = normalized.targetX - Number(action.targetZone?.x ?? 0);
  const dy = normalized.targetY - Number(action.targetZone?.y ?? .68);
  const distance = Math.sqrt(dx * dx + dy * dy);
  const targeting = continuationClamp(1 - distance / .78, 0, 1);
  const weightControl = continuationClamp(1 - Math.abs(normalized.weight - (action.family === 'through_ball' ? .76 : .68)) * 1.30, 0, 1);
  const canonical = continuationClamp((passerQuality * .72 + receiverQuality * .18 + (100 - defenderQuality) * .10) / 100, .05, .99);
  const executionQuality = continuationClamp(canonical * .56 + targeting * .20 + normalized.timing * .16 + weightControl * .08, .04, .99);
  const qualityEdge = (passerQuality - 75) * .0025
    + (receiverQuality - 75) * .0013
    - (defenderQuality - 75) * .0020;
  const inputEdge = (executionQuality - .62) * .38;
  return {
    successChance:continuationClamp(action.baselineSuccessChance + qualityEdge + inputEdge, .12, .94),
    executionQuality,
    target:{
      x:continuationRound(normalized.targetX, 4),
      y:continuationRound(normalized.targetY, 4),
      weight:continuationRound(normalized.weight, 4),
      timing:continuationRound(normalized.timing, 4),
    },
  };
}

export function resolveContinuationAction({ action, passer, receiver, defender, packet, intent = null } = {}) {
  if (!action || action.version !== MATCH_CONTINUATION_ACTION_VERSION) throw new Error('Continuation resolution requires a supported action');
  if (!packet || Number(packet.version) !== 1) throw new Error('Continuation resolution requires the existing fixed phase packet');
  if (passer?.id !== action.passerId || receiver?.id !== action.receiverId || defender?.id !== action.interceptorId) {
    throw new Error('Continuation participants do not match authoritative action');
  }

  const execution = continuationExecution(action, passer, receiver, defender, intent);
  const success = continuationClamp(Number(packet.execution) || 0, 0, .999999) < execution.successChance;
  if (!success) {
    return {
      version:MATCH_CONTINUATION_ACTION_VERSION,
      family:action.family,
      success:false,
      outcome:action.failureOutcome,
      passerId:action.passerId,
      receiverId:action.receiverId,
      interceptorId:action.interceptorId,
      successChance:continuationRound(execution.successChance, 4),
      executionQuality:continuationRound(execution.executionQuality, 4),
      target:execution.target,
      downstreamChance:null,
    };
  }

  const interactiveAdjustment = intent == null ? 0 : (execution.executionQuality - .62) * .20;
  const chanceProbability = continuationClamp(Number(action.downstream?.chanceProbability ?? .12) + interactiveAdjustment, .035, .62);
  const chanceCreated = continuationClamp(Number(packet.chance) || 0, 0, .999999) < chanceProbability;
  const xg = continuationClamp(
    Number(action.downstream?.projectedXg ?? .12) + (intent == null ? 0 : (execution.executionQuality - .62) * .11),
    .045,
    .48,
  );

  return {
    version:MATCH_CONTINUATION_ACTION_VERSION,
    family:action.family,
    success:true,
    outcome:chanceCreated ? 'chance_created' : 'progress',
    passerId:action.passerId,
    receiverId:action.receiverId,
    interceptorId:action.interceptorId,
    successChance:continuationRound(execution.successChance, 4),
    executionQuality:continuationRound(execution.executionQuality, 4),
    target:execution.target,
    downstreamChance:chanceCreated ? {
      shooterId:action.downstream.shooterId,
      assistId:action.downstream.assistId,
      pressureDefenderId:action.downstream.pressureDefenderId,
      xg:continuationRound(xg, 3),
      chanceProbability:continuationRound(chanceProbability, 4),
    } : null,
  };
}

export function buildContinuationPlayableGeometry(action) {
  if (!action || action.version !== MATCH_CONTINUATION_ACTION_VERSION) return null;
  const through = action.family === 'through_ball';
  const channelX = continuationRound(Number(action.targetZone?.x ?? 0) * 6.2, 3);
  const passerZ = through ? 24 : 21;
  const receiverZ = through ? 11.5 : 13.8;
  const receiverX = channelX;
  const interceptorX = continuationRound(receiverX + (channelX <= 0 ? .95 : -.95), 3);
  const interceptorZ = continuationRound((passerZ + receiverZ) * .5, 3);
  return {
    coordinateSystem:'goal-facing-v1',
    staging:{
      version:1,
      variant:action.family,
      targetZone:{ ...action.targetZone },
      receiverOnsideAuthorized:true,
    },
    legalActions:['target','weight','timing'],
    continuousLocomotion:false,
    passer:{ id:action.passerId, name:action.passerName, x:channelX * .42, y:0, z:passerZ },
    receiver:{ id:action.receiverId, name:action.receiverName, x:receiverX, y:0, z:receiverZ },
    interceptor:{ id:action.interceptorId, name:action.interceptorName, x:interceptorX, y:0, z:interceptorZ },
    ball:{ x:channelX * .42, y:.11, z:passerZ - .55 },
    target:{ x:receiverX, y:.11, z:receiverZ + .35 },
  };
}
