import { effectiveDetailedAttribute } from './playerModel.js';
import {
  MATCH_SET_PIECE_VERSION,
  buildSetPiecePlayableGeometry,
  resolvePenaltyOutcome,
} from './matchSetPieces.js';

/**
 * Phase 7 penalty-shootout domain.
 *
 * This is a bounded post-match competition resolver, not a second match engine.
 * It owns shootout order/state and delegates every football action to the
 * existing Phase 4 penalty resolver.
 */

export const SHOOTOUT_STATE_VERSION = 1;
export const SHOOTOUT_KICK_RECEIPT_VERSION = 1;
export const SHOOTOUT_NORMAL_KICKS_PER_TEAM = 5;
export const SHOOTOUT_PACKET_VERSION = 1;

export const SHOOTOUT_PACKET_FIELDS = Object.freeze([
  'possession',
  'route',
  'actor',
  'target',
  'defender',
  'execution',
  'outcome',
  'chance',
  'shooter',
  'shot',
  'finish',
  'assist',
  'discipline',
  'injury',
]);

function shootoutClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shootoutNumeric(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function shootoutHash(input) {
  let hash = 2166136261;
  for (const character of String(input ?? '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shootoutUnit(input) {
  return (shootoutHash(input) + .5) / 0x100000000;
}

function shootoutSlot(player) {
  return player?.matchPosition ?? player?.position ?? null;
}

function clonePlain(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clonePlain);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = clonePlain(item);
  }
  return out;
}

function playerSnapshot(player, teamId) {
  return {
    id:player.id,
    name:player.name ?? String(player.id),
    teamId:player.teamId ?? teamId,
    position:player.position ?? shootoutSlot(player),
    matchPosition:player.matchPosition ?? player.position ?? null,
    attack:shootoutNumeric(player.attack, 50),
    midfield:shootoutNumeric(player.midfield, 50),
    defence:shootoutNumeric(player.defence, 50),
    goalkeeping:shootoutNumeric(player.goalkeeping, shootoutSlot(player) === 'GK' ? 70 : 8),
    fitness:shootoutNumeric(player.fitness, 90),
    form:shootoutNumeric(player.form, 50),
    individualMorale:shootoutNumeric(player.individualMorale, 50),
    sharpness:shootoutNumeric(player.sharpness, 50),
    attributeProfile:clonePlain(player.attributeProfile ?? {}),
    positionSuitability:clonePlain(player.positionSuitability ?? {}),
    traits:[...(player.traits ?? [])],
    tacticalRole:player.tacticalRole ?? null,
    rehabilitation:clonePlain(player.rehabilitation ?? null),
  };
}

function uniqueParticipantSnapshots(players, teamId) {
  const seen = new Set();
  const snapshots = [];
  for (const player of players ?? []) {
    if (player?.id == null) continue;
    const key = String(player.id);
    if (seen.has(key)) continue;
    seen.add(key);
    snapshots.push(playerSnapshot(player, teamId));
  }
  return snapshots;
}

function shootoutDetailed(player, attribute) {
  const value = Number(effectiveDetailedAttribute(player, attribute));
  return Number.isFinite(value) ? value : 50;
}

export function shootoutTakerScore(player) {
  if (!player) return 0;
  return shootoutClamp(
    shootoutDetailed(player, 'shooting') * .86 + shootoutDetailed(player, 'physical') * .14,
    1,
    99,
  );
}

function buildShootoutSide(teamId, players) {
  if (!teamId) throw new Error('SHOOTOUT_TEAM_ID_REQUIRED');
  const participants = uniqueParticipantSnapshots(players, teamId);
  const goalkeepers = participants
    .filter(player => shootoutSlot(player) === 'GK')
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const goalkeeper = goalkeepers[0] ?? null;
  if (!goalkeeper) throw new Error(`SHOOTOUT_GOALKEEPER_REQUIRED:${teamId}`);

  const takers = participants
    .filter(player => shootoutSlot(player) !== 'GK')
    .sort((left, right) => shootoutTakerScore(right) - shootoutTakerScore(left)
      || String(left.id).localeCompare(String(right.id)));
  if (!takers.length) throw new Error(`SHOOTOUT_TAKERS_REQUIRED:${teamId}`);

  return {
    teamId,
    goalkeeperId:goalkeeper.id,
    takerIds:takers.map(player => player.id),
    participants,
  };
}

function sideFor(state, teamId) {
  return state?.sides?.find(side => side.teamId === teamId) ?? null;
}

function opponentTeamId(state, teamId) {
  if (teamId === state.homeTeamId) return state.awayTeamId;
  if (teamId === state.awayTeamId) return state.homeTeamId;
  return null;
}

function teamOrder(state) {
  const second = opponentTeamId(state, state.firstTeamId);
  return [state.firstTeamId, second];
}

function countTeamKicks(kicks, teamId, predicate = () => true) {
  return kicks.filter(kick => kick.teamId === teamId && predicate(kick)).length;
}

function scoreFor(kicks, teamId) {
  return kicks.filter(kick => kick.teamId === teamId && kick.goal === true).length;
}

export function getShootoutScore(state) {
  const kicks = state?.kicks ?? [];
  return {
    home:scoreFor(kicks, state?.homeTeamId),
    away:scoreFor(kicks, state?.awayTeamId),
  };
}

function evaluateShootout(kicks, homeTeamId, awayTeamId) {
  const homeScore = scoreFor(kicks, homeTeamId);
  const awayScore = scoreFor(kicks, awayTeamId);
  const homeNormal = countTeamKicks(kicks, homeTeamId, kick => kick.phase === 'normal');
  const awayNormal = countTeamKicks(kicks, awayTeamId, kick => kick.phase === 'normal');
  const homeRemaining = Math.max(0, SHOOTOUT_NORMAL_KICKS_PER_TEAM - homeNormal);
  const awayRemaining = Math.max(0, SHOOTOUT_NORMAL_KICKS_PER_TEAM - awayNormal);
  const normalIncomplete = homeNormal < SHOOTOUT_NORMAL_KICKS_PER_TEAM
    || awayNormal < SHOOTOUT_NORMAL_KICKS_PER_TEAM;

  // Mathematical early conclusion applies only while the normal five-kick
  // phase still has kicks remaining. Once both teams have taken five, a lead
  // after the first sudden-death kick can never end the shootout until the
  // opponent has taken the matching kick in that pair.
  if (normalIncomplete) {
    if (homeScore > awayScore + awayRemaining) {
      return { status:'complete', phase:'complete', winnerTeamId:homeTeamId, loserTeamId:awayTeamId };
    }
    if (awayScore > homeScore + homeRemaining) {
      return { status:'complete', phase:'complete', winnerTeamId:awayTeamId, loserTeamId:homeTeamId };
    }
    return { status:'active', phase:'normal', winnerTeamId:null, loserTeamId:null };
  }

  if (kicks.length === SHOOTOUT_NORMAL_KICKS_PER_TEAM * 2) {
    if (homeScore !== awayScore) {
      const winnerTeamId = homeScore > awayScore ? homeTeamId : awayTeamId;
      return {
        status:'complete',
        phase:'complete',
        winnerTeamId,
        loserTeamId:winnerTeamId === homeTeamId ? awayTeamId : homeTeamId,
      };
    }
    return { status:'active', phase:'sudden_death', winnerTeamId:null, loserTeamId:null };
  }

  const homeSudden = countTeamKicks(kicks, homeTeamId, kick => kick.phase === 'sudden_death');
  const awaySudden = countTeamKicks(kicks, awayTeamId, kick => kick.phase === 'sudden_death');
  if (homeSudden === awaySudden && homeSudden > 0 && homeScore !== awayScore) {
    const winnerTeamId = homeScore > awayScore ? homeTeamId : awayTeamId;
    return {
      status:'complete',
      phase:'complete',
      winnerTeamId,
      loserTeamId:winnerTeamId === homeTeamId ? awayTeamId : homeTeamId,
    };
  }
  return { status:'active', phase:'sudden_death', winnerTeamId:null, loserTeamId:null };
}

function expectedTeamForIndex(state, index) {
  const [first, second] = teamOrder(state);
  return index % 2 === 0 ? first : second;
}

function expectedPhaseForIndex(index) {
  return index < SHOOTOUT_NORMAL_KICKS_PER_TEAM * 2 ? 'normal' : 'sudden_death';
}

function expectedRoundForIndex(index) {
  if (index < SHOOTOUT_NORMAL_KICKS_PER_TEAM * 2) return Math.floor(index / 2) + 1;
  return Math.floor((index - SHOOTOUT_NORMAL_KICKS_PER_TEAM * 2) / 2) + 1;
}

function packetForKick(state, { index, teamId, takerId, goalkeeperId }) {
  const packet = { version:SHOOTOUT_PACKET_VERSION };
  for (const field of SHOOTOUT_PACKET_FIELDS) {
    packet[field] = shootoutUnit(`${state.seed}|${state.shootoutId}|${index}|${teamId}|${takerId}|${goalkeeperId}|${field}`);
  }
  return packet;
}

function penaltySetPieceForKick(kick) {
  return {
    version:MATCH_SET_PIECE_VERSION,
    kind:'penalty',
    awardReason:'penalty_shootout',
    attackingTeamId:kick.teamId,
    defendingTeamId:kick.defendingTeamId,
    takerId:kick.takerId,
    takerName:kick.takerName,
    goalkeeperId:kick.goalkeeperId,
    goalkeeperName:kick.goalkeeperName,
    directAttemptEligible:true,
    xg:.76,
    location:{ coordinateSystem:'goal-facing-v1', distance:11, channel:0, x:0 },
    wall:null,
  };
}

function normalizeShootoutIntent(intent) {
  if (!intent || typeof intent !== 'object') return null;
  const normalized = {};
  if (intent.attack && typeof intent.attack === 'object') {
    normalized.attack = {
      aimX:shootoutClamp(shootoutNumeric(intent.attack.aimX, 0), -1.25, 1.25),
      aimY:shootoutClamp(shootoutNumeric(intent.attack.aimY, .5), -.2, 1.2),
      power:shootoutClamp(shootoutNumeric(intent.attack.power, .72), 0, 1),
      timing:shootoutClamp(shootoutNumeric(intent.attack.timing, .65), 0, 1),
    };
  }
  if (intent.goalkeeper && typeof intent.goalkeeper === 'object') {
    normalized.goalkeeper = {
      x:shootoutClamp(shootoutNumeric(intent.goalkeeper.x, 0), -1, 1),
      y:shootoutClamp(shootoutNumeric(intent.goalkeeper.y, .5), 0, 1),
      timing:shootoutClamp(shootoutNumeric(intent.goalkeeper.timing, .65), 0, 1),
    };
  }
  return Object.keys(normalized).length ? normalized : null;
}

function sameIntent(left, right) {
  return JSON.stringify(normalizeShootoutIntent(left)) === JSON.stringify(normalizeShootoutIntent(right));
}

export function createShootoutState({
  seed,
  homeTeamId,
  awayTeamId,
  homePlayers = [],
  awayPlayers = [],
  firstTeamId = null,
} = {}) {
  if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) throw new Error('SHOOTOUT_TEAMS_INVALID');
  const home = buildShootoutSide(homeTeamId, homePlayers);
  const away = buildShootoutSide(awayTeamId, awayPlayers);
  const chosenFirst = firstTeamId ?? (shootoutUnit(`${seed ?? 1}|${homeTeamId}|${awayTeamId}|first-team`) < .5 ? homeTeamId : awayTeamId);
  if (chosenFirst !== homeTeamId && chosenFirst !== awayTeamId) throw new Error('SHOOTOUT_FIRST_TEAM_INVALID');
  const participantSignature = [...home.takerIds, home.goalkeeperId, ...away.takerIds, away.goalkeeperId]
    .map(String)
    .join(',');
  const shootoutId = `shootout:${SHOOTOUT_STATE_VERSION}:${shootoutHash(`${seed ?? 1}|${homeTeamId}|${awayTeamId}|${participantSignature}`)}`;
  return {
    version:SHOOTOUT_STATE_VERSION,
    revision:0,
    shootoutId,
    seed:seed ?? 1,
    homeTeamId,
    awayTeamId,
    firstTeamId:chosenFirst,
    sides:[home, away],
    kicks:[],
    status:'active',
    phase:'normal',
    winnerTeamId:null,
    loserTeamId:null,
  };
}

export function assertSupportedShootoutState(state) {
  if (!state || state.version !== SHOOTOUT_STATE_VERSION) throw new Error('SHOOTOUT_STATE_VERSION_UNSUPPORTED');
  if (!state.shootoutId || state.homeTeamId === state.awayTeamId) throw new Error('SHOOTOUT_STATE_INVALID');
  if (state.firstTeamId !== state.homeTeamId && state.firstTeamId !== state.awayTeamId) throw new Error('SHOOTOUT_FIRST_TEAM_INVALID');
  if (!Array.isArray(state.sides) || state.sides.length !== 2) throw new Error('SHOOTOUT_SIDES_INVALID');
  for (const teamId of [state.homeTeamId, state.awayTeamId]) {
    const side = sideFor(state, teamId);
    if (!side || !side.goalkeeperId || !Array.isArray(side.takerIds) || !side.takerIds.length) throw new Error(`SHOOTOUT_SIDE_INVALID:${teamId}`);
    if (!Array.isArray(side.participants) || !side.participants.some(player => player.id === side.goalkeeperId)) throw new Error(`SHOOTOUT_PARTICIPANTS_INVALID:${teamId}`);
  }
  if (!Array.isArray(state.kicks)) throw new Error('SHOOTOUT_KICKS_INVALID');

  const seenKickIds = new Set();
  for (let index = 0; index < state.kicks.length; index += 1) {
    const receipt = state.kicks[index];
    if (receipt?.index !== index || receipt.version !== SHOOTOUT_KICK_RECEIPT_VERSION) throw new Error('SHOOTOUT_KICK_SEQUENCE_INVALID');
    if (seenKickIds.has(receipt.kickId)) throw new Error('SHOOTOUT_KICK_DUPLICATE');
    seenKickIds.add(receipt.kickId);
    const expectedTeamId = expectedTeamForIndex(state, index);
    const expectedPhase = expectedPhaseForIndex(index);
    const expectedRound = expectedRoundForIndex(index);
    if (receipt.teamId !== expectedTeamId || receipt.phase !== expectedPhase || receipt.round !== expectedRound) throw new Error('SHOOTOUT_KICK_ORDER_CORRUPT');
    const side = sideFor(state, expectedTeamId);
    const opponent = sideFor(state, opponentTeamId(state, expectedTeamId));
    const previousForTeam = state.kicks.slice(0, index).filter(kick => kick.teamId === expectedTeamId).length;
    const expectedTakerId = side.takerIds[previousForTeam % side.takerIds.length];
    if (receipt.takerId !== expectedTakerId || receipt.goalkeeperId !== opponent.goalkeeperId) throw new Error('SHOOTOUT_PARTICIPANT_ORDER_CORRUPT');
  }

  const evaluated = evaluateShootout(state.kicks, state.homeTeamId, state.awayTeamId);
  if (evaluated.status !== state.status || evaluated.phase !== state.phase
    || evaluated.winnerTeamId !== state.winnerTeamId || evaluated.loserTeamId !== state.loserTeamId) {
    throw new Error('SHOOTOUT_DERIVED_STATE_CORRUPT');
  }
  return state;
}

export function getNextShootoutKick(state) {
  assertSupportedShootoutState(state);
  if (state.status === 'complete') return null;
  const index = state.kicks.length;
  const teamId = expectedTeamForIndex(state, index);
  const defendingTeamId = opponentTeamId(state, teamId);
  const side = sideFor(state, teamId);
  const defending = sideFor(state, defendingTeamId);
  const previousForTeam = state.kicks.filter(kick => kick.teamId === teamId).length;
  const takerId = side.takerIds[previousForTeam % side.takerIds.length];
  const taker = side.participants.find(player => player.id === takerId);
  const goalkeeper = defending.participants.find(player => player.id === defending.goalkeeperId);
  if (!taker || !goalkeeper) throw new Error('SHOOTOUT_NEXT_PARTICIPANT_MISSING');
  const phase = expectedPhaseForIndex(index);
  const round = expectedRoundForIndex(index);
  const base = {
    index,
    phase,
    round,
    teamId,
    defendingTeamId,
    takerId,
    takerName:taker.name,
    goalkeeperId:goalkeeper.id,
    goalkeeperName:goalkeeper.name,
  };
  const packet = packetForKick(state, base);
  const kickId = `${state.shootoutId}:kick:${index}:${teamId}:${takerId}:${goalkeeper.id}`;
  const kick = { ...base, kickId, packet };
  return { ...kick, setPiece:penaltySetPieceForKick(kick) };
}

function validateKickAgainstExpected(expected, kick) {
  if (!expected || !kick || expected.kickId !== kick.kickId || expected.index !== kick.index
    || expected.teamId !== kick.teamId || expected.takerId !== kick.takerId
    || expected.goalkeeperId !== kick.goalkeeperId) {
    throw new Error('SHOOTOUT_KICK_STALE');
  }
  for (const field of SHOOTOUT_PACKET_FIELDS) {
    if (expected.packet[field] !== kick.packet?.[field]) throw new Error('SHOOTOUT_PACKET_STALE');
  }
}

export function commitShootoutKick(state, { kick, shot, intent = null } = {}) {
  assertSupportedShootoutState(state);
  if (!kick || !shot || typeof shot.goal !== 'boolean' || !shot.finish) throw new Error('SHOOTOUT_COMMIT_INVALID');

  if (kick.index < state.kicks.length) {
    const existing = state.kicks[kick.index];
    if (existing?.kickId !== kick.kickId) throw new Error('SHOOTOUT_KICK_ALREADY_COMMITTED_DIFFERENT_KICK');
    if (!sameIntent(existing.intent, intent)) throw new Error('SHOOTOUT_KICK_ALREADY_COMMITTED_DIFFERENT_INTENT');
    if (existing.finish !== shot.finish || existing.goal !== shot.goal) throw new Error('SHOOTOUT_KICK_ALREADY_COMMITTED_DIFFERENT_RESULT');
    return { state, receipt:existing, idempotent:true };
  }

  if (kick.index !== state.kicks.length) throw new Error('SHOOTOUT_KICK_INDEX_STALE');
  const expected = getNextShootoutKick(state);
  validateKickAgainstExpected(expected, kick);
  const normalizedIntent = normalizeShootoutIntent(intent);
  const receipt = {
    version:SHOOTOUT_KICK_RECEIPT_VERSION,
    kickId:kick.kickId,
    index:kick.index,
    phase:kick.phase,
    round:kick.round,
    teamId:kick.teamId,
    defendingTeamId:kick.defendingTeamId,
    takerId:kick.takerId,
    takerName:kick.takerName,
    goalkeeperId:kick.goalkeeperId,
    goalkeeperName:kick.goalkeeperName,
    finish:shot.finish,
    onTarget:shot.onTarget === true,
    goal:shot.goal === true,
    shooting:shot.shooting ?? null,
    goalkeeping:shot.goalkeeping ?? null,
    intent:normalizedIntent,
    shot:clonePlain(shot),
  };
  const kicks = [...state.kicks, receipt];
  const derived = evaluateShootout(kicks, state.homeTeamId, state.awayTeamId);
  const next = {
    ...state,
    revision:state.revision + 1,
    kicks,
    ...derived,
  };
  assertSupportedShootoutState(next);
  return { state:next, receipt, idempotent:false };
}

export function resolveShootoutKick(state, { intent = null } = {}) {
  const kick = getNextShootoutKick(state);
  if (!kick) return { state, kick:null, receipt:null, shot:null, idempotent:true };
  const attacking = sideFor(state, kick.teamId);
  const defending = sideFor(state, kick.defendingTeamId);
  const shooter = attacking.participants.find(player => player.id === kick.takerId);
  if (!shooter) throw new Error('SHOOTOUT_TAKER_MISSING');
  const shot = resolvePenaltyOutcome({
    setPiece:kick.setPiece,
    shooter,
    defenders:defending.participants,
    packet:kick.packet,
    intent:normalizeShootoutIntent(intent),
  });
  const committed = commitShootoutKick(state, { kick, shot, intent });
  return { ...committed, kick, shot };
}

export function resolveAutomaticShootoutKick(state) {
  return resolveShootoutKick(state, { intent:null });
}

export function runAutomaticShootout(initialState, { maxKicks = 200 } = {}) {
  let state = assertSupportedShootoutState(initialState);
  for (let index = 0; state.status !== 'complete'; index += 1) {
    if (index >= maxKicks) throw new Error('SHOOTOUT_MAX_KICKS_EXCEEDED');
    state = resolveAutomaticShootoutKick(state).state;
  }
  return state;
}

export function buildShootoutPlayableMoment(state, controlledTeamId) {
  const kick = getNextShootoutKick(state);
  if (!kick || !controlledTeamId) return null;
  if (controlledTeamId !== kick.teamId && controlledTeamId !== kick.defendingTeamId) return null;
  const mode = controlledTeamId === kick.teamId ? 'attack' : 'goalkeeper';
  const geometry = buildSetPiecePlayableGeometry(kick.setPiece);
  if (!geometry) throw new Error('SHOOTOUT_GEOMETRY_UNAVAILABLE');
  return {
    version:1,
    interactionType:'shootout',
    shootoutId:state.shootoutId,
    kickId:kick.kickId,
    kickIndex:kick.index,
    shootoutPhase:kick.phase,
    shootoutRound:kick.round,
    phase:120 + kick.index + 1,
    minute:120,
    mode,
    attackingTeamId:kick.teamId,
    defendingTeamId:kick.defendingTeamId,
    shooterId:kick.takerId,
    shooterName:kick.takerName,
    goalkeeperId:kick.goalkeeperId,
    goalkeeperName:kick.goalkeeperName,
    defenderId:null,
    route:'penalty_shootout',
    xg:.76,
    score:getShootoutScore(state),
    setPiece:clonePlain(kick.setPiece),
    geometry,
  };
}

export function shootoutSummary(state) {
  assertSupportedShootoutState(state);
  const score = getShootoutScore(state);
  return {
    version:state.version,
    shootoutId:state.shootoutId,
    status:state.status,
    phase:state.phase,
    firstTeamId:state.firstTeamId,
    homeTeamId:state.homeTeamId,
    awayTeamId:state.awayTeamId,
    winnerTeamId:state.winnerTeamId,
    loserTeamId:state.loserTeamId,
    homeScore:score.home,
    awayScore:score.away,
    suddenDeath:state.kicks.some(kick => kick.phase === 'sudden_death'),
    kicks:state.kicks.map(kick => ({
      version:kick.version,
      kickId:kick.kickId,
      index:kick.index,
      phase:kick.phase,
      round:kick.round,
      teamId:kick.teamId,
      takerId:kick.takerId,
      takerName:kick.takerName,
      goalkeeperId:kick.goalkeeperId,
      goalkeeperName:kick.goalkeeperName,
      finish:kick.finish,
      goal:kick.goal,
    })),
  };
}
