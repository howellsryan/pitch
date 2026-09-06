import { MATCH_ACTION_VOCABULARY_VERSION } from './matchActionVocabulary.js';
import {
  buildSetPiecePlayableGeometry,
  deriveAuthoritativeSetPiece,
  resolveDirectFreeKickOutcome,
  resolvePenaltyOutcome,
} from './matchSetPieces.js';

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function attachAuthoritativeSetPiece(prepared) {
  if (!prepared || prepared.chance || prepared.shooter) return prepared;
  const setPiece = deriveAuthoritativeSetPiece(prepared);
  if (!setPiece) return prepared;
  const shooter = (prepared.attackers ?? []).find(player => player.id === setPiece.takerId) ?? null;
  if (!shooter) return prepared;
  return {
    ...prepared,
    setPiece,
    chance:'set_piece',
    xg:setPiece.xg,
    shooter,
    pressureDefender:null,
    assistId:null,
  };
}

export function buildSetPiecePlayableMoment(prepared, controlledTeamId, momentVersion = 1) {
  const setPiece = prepared?.setPiece;
  if (!setPiece || !prepared?.shooter || !controlledTeamId) return null;
  const mode = prepared.teamId === controlledTeamId
    ? 'attack'
    : prepared.opponentTeamId === controlledTeamId ? 'goalkeeper' : null;
  if (!mode) return null;
  const geometry = buildSetPiecePlayableGeometry(setPiece);
  if (!geometry) return null;
  return {
    version:momentVersion,
    phase:prepared.phase,
    minute:prepared.minute,
    mode,
    attackingTeamId:prepared.teamId,
    defendingTeamId:prepared.opponentTeamId,
    shooterId:prepared.shooter.id,
    shooterName:prepared.shooter.name,
    goalkeeperId:setPiece.goalkeeperId,
    goalkeeperName:setPiece.goalkeeperName,
    defenderId:setPiece.wall?.members?.[0]?.id ?? null,
    route:setPiece.kind,
    sourceRoute:prepared.route,
    xg:setPiece.xg,
    setPiece:{
      ...setPiece,
      wall:setPiece.wall ? {
        ...setPiece.wall,
        members:setPiece.wall.members.map(member => ({ ...member })),
      } : null,
    },
    geometry,
  };
}

export function commitAuthoritativeSetPiecePhase(prepared, { intent = null, ledgerVersion = 1 } = {}) {
  const setPiece = prepared?.setPiece;
  const shooter = prepared?.shooter;
  if (!setPiece || !shooter) throw new Error('Set-piece commit requires a prepared authoritative set piece');

  const shot = setPiece.kind === 'penalty'
    ? resolvePenaltyOutcome({ setPiece, shooter, defenders:prepared.defenders, packet:prepared.packet, intent })
    : resolveDirectFreeKickOutcome({ setPiece, shooter, defenders:prepared.defenders, packet:prepared.packet, intent });

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
    outcome:'foul_won',
    chance:'set_piece',
    xg:setPiece.xg,
    shotId:shooter.id,
    finish:shot.finish,
    onTarget:shot.onTarget,
    setPieceType:setPiece.kind,
    setPieceVersion:setPiece.version,
    setPiece:{
      kind:setPiece.kind,
      awardReason:setPiece.awardReason,
      takerId:setPiece.takerId,
      goalkeeperId:setPiece.goalkeeperId,
      location:{ ...setPiece.location },
      wall:setPiece.wall ? {
        size:setPiece.wall.size,
        distanceFromBall:setPiece.wall.distanceFromBall,
        centreX:setPiece.wall.centreX,
        z:setPiece.wall.z,
        members:setPiece.wall.members.map(member => ({ ...member })),
      } : null,
    },
    restart:shot.restart,
  };

  const goalEvent = shot.goal ? {
    type:'goal',
    minute:prepared.minute,
    teamId:prepared.teamId,
    playerId:shooter.id,
    playerName:shooter.name,
    assistId:null,
    assistName:null,
    route:setPiece.kind,
    setPieceType:setPiece.kind,
    xg:setPiece.xg,
  } : null;

  return { record, goalEvent, shot };
}
