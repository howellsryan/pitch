import { MATCH_ACTION_VOCABULARY_VERSION } from './matchActionVocabulary.js';
import {
  MATCH_CONTINUATION_ACTION_VERSION,
  resolveContinuationAction,
} from './matchContinuationActions.js';
import {
  MATCH_CONTACT_ACTION_VERSION,
  buildContactPlayableGeometry,
  derivePlayableContactAction,
  resolveContactShotOutcome,
} from './matchContactActions.js';

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function chanceBucket(xg) {
  if (xg >= .28) return 'high_quality_chance';
  if (xg >= .14) return 'medium_quality_chance';
  return 'low_quality_chance';
}

function goalkeeper(players = []) {
  return players.find(player => (player?.matchPosition ?? player?.position) === 'GK') ?? null;
}

function continuationPayload(result) {
  return {
    version:result.version,
    family:result.family,
    success:result.success,
    outcome:result.outcome,
    passerId:result.passerId,
    receiverId:result.receiverId,
    interceptorId:result.interceptorId,
    successChance:result.successChance,
    executionQuality:result.executionQuality,
    target:{ ...result.target },
  };
}

export function previewPlayableContact(prepared, controlledTeamId, momentVersion = 1) {
  if (!prepared?.continuationAction || !controlledTeamId) return null;
  const preview = resolveContinuationAction({
    action:prepared.continuationAction,
    passer:prepared.actor,
    receiver:prepared.target,
    defender:prepared.defender,
    packet:prepared.packet,
    intent:null,
  });
  const action = derivePlayableContactAction(prepared, preview);
  if (!action) return null;

  const mode = prepared.teamId === controlledTeamId
    ? 'attack'
    : prepared.opponentTeamId === controlledTeamId ? 'goalkeeper' : null;
  if (!mode) return null;
  const keeper = goalkeeper(prepared.defenders);
  if (!keeper) return null;
  const geometry = buildContactPlayableGeometry(action);
  if (!geometry) return null;

  return {
    action,
    preview,
    moment:{
      version:momentVersion,
      phase:prepared.phase,
      minute:prepared.minute,
      mode,
      interactionType:'contact',
      contactType:action.type,
      sourceContinuationType:action.sourceContinuationFamily,
      attackingTeamId:prepared.teamId,
      defendingTeamId:prepared.opponentTeamId,
      actorId:prepared.actor?.id ?? null,
      actorName:prepared.actor?.name ?? null,
      shooterId:action.shooterId,
      shooterName:action.shooterName,
      goalkeeperId:keeper.id,
      goalkeeperName:keeper.name,
      defenderId:action.pressureDefenderId,
      route:prepared.route,
      xg:action.xg,
      contactAction:{ ...action },
      geometry,
    },
  };
}

export function preparePlayableContactContinuation(continuation, controlledTeamId, momentVersion = 1) {
  const prepared = continuation?.preparedAction;
  const candidate = previewPlayableContact(prepared, controlledTeamId, momentVersion);
  if (!candidate) return null;
  return {
    moment:candidate.moment,
    continuation:{
      ...continuation,
      preparedAction:{
        ...prepared,
        contactAction:{ ...candidate.action },
        contactContinuation:{ ...candidate.preview },
      },
    },
  };
}

export function commitPlayableContactPhase(prepared, intent, ledgerVersion = 1) {
  const action = prepared?.contactAction;
  const continuation = prepared?.contactContinuation;
  if (!action || action.version !== MATCH_CONTACT_ACTION_VERSION) {
    throw new Error('Playable contact commit requires a supported contact action');
  }
  if (!continuation?.success || !continuation.downstreamChance) {
    throw new Error('Playable contact commit requires its successful upstream continuation');
  }
  if (continuation.receiverId !== action.shooterId
      || continuation.downstreamChance.shooterId !== action.shooterId) {
    throw new Error('Playable contact continuation does not match authoritative shooter');
  }

  const shooter = prepared.attackers.find(player => player.id === action.shooterId) ?? null;
  const pressureDefender = prepared.defenders.find(player => player.id === action.pressureDefenderId) ?? null;
  if (!shooter || !pressureDefender) throw new Error('Playable contact participants are missing from the authoritative phase');

  const shot = resolveContactShotOutcome({
    action,
    shooter,
    defender:pressureDefender,
    defenders:prepared.defenders,
    packet:prepared.packet,
    intent,
  });
  const assistId = continuation.downstreamChance.assistId ?? null;
  const xg = Number(action.xg);
  const cornerWon = shot.finish === 'blocked' && prepared.packet.outcome < .45;
  const record = {
    version:ledgerVersion,
    vocabularyVersion:MATCH_ACTION_VOCABULARY_VERSION,
    phase:prepared.phase,
    minute:prepared.minute,
    teamId:prepared.teamId,
    opponentTeamId:prepared.opponentTeamId,
    route:prepared.route,
    actorId:prepared.actor?.id ?? null,
    targetId:prepared.target?.id ?? null,
    defenderId:prepared.defender?.id ?? null,
    execution:round(prepared.execution),
    counter:round(prepared.counter),
    contextEdge:round(prepared.context),
    successChance:round(prepared.successChance),
    mentality:prepared.mentality,
    riskMode:prepared.riskMode,
    outcome:'chance_created',
    continuationType:prepared.continuationAction.family,
    continuationVersion:MATCH_CONTINUATION_ACTION_VERSION,
    continuation:continuationPayload(continuation),
    chance:chanceBucket(xg),
    xg,
    shotId:shooter.id,
    ...(assistId ? { assistId } : {}),
    finish:shot.finish,
    onTarget:shot.onTarget,
    contactType:action.type,
    contactVersion:MATCH_CONTACT_ACTION_VERSION,
    ...(shot.goalkeeperIntervention ? { goalkeeperIntervention:shot.goalkeeperIntervention } : {}),
    ...(cornerWon ? { cornerWon:true } : {}),
  };

  const goalEvent = shot.goal ? {
    type:'goal',
    minute:prepared.minute,
    teamId:prepared.teamId,
    playerId:shooter.id,
    playerName:shooter.name,
    assistId,
    assistName:assistId ? prepared.attackers.find(player => player.id === assistId)?.name ?? null : null,
    route:prepared.route,
    xg,
    contactType:action.type,
  } : null;

  return {
    record,
    goalEvent,
    shot,
    continuation,
    contact:{ ...action },
  };
}
