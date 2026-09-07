import {
  SHOOTOUT_PACKET_FIELDS,
  assertSupportedShootoutState,
  buildShootoutPlayableMoment,
  getNextShootoutKick,
  getShootoutScore,
  resolveShootoutKick,
  shootoutSummary,
} from './matchShootout.js';

/**
 * Durable presentation wrapper around the authoritative Phase 7 shootout state.
 *
 * Playable shootouts are attacking-only: the manager takes their own penalties
 * while opponent kicks are resolved automatically by the same deterministic
 * shootout domain. No goalkeeper/defending interaction is presented.
 */

export const COMPETITION_SHOOTOUT_SESSION_VERSION = 1;

function shootoutSessionClone(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(shootoutSessionClone);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = shootoutSessionClone(item);
  }
  return out;
}

function sameKick(left, right) {
  if (!left || !right || left.kickId !== right.kickId || left.index !== right.index
      || left.teamId !== right.teamId || left.takerId !== right.takerId
      || left.goalkeeperId !== right.goalkeeperId) return false;
  return SHOOTOUT_PACKET_FIELDS.every(field => left.packet?.[field] === right.packet?.[field]);
}

function advanceOpponentKicks(state, controlledTeamId) {
  let next = assertSupportedShootoutState(state);
  while (next.status === 'active') {
    const kick = getNextShootoutKick(next);
    if (!kick || kick.teamId === controlledTeamId) break;
    next = resolveShootoutKick(next, { intent:null }).state;
  }
  return next;
}

function pendingShootoutKick(state, controlledTeamId) {
  const kick = getNextShootoutKick(state);
  if (!kick) return null;
  if (kick.teamId !== controlledTeamId) throw new Error('COMPETITION_SHOOTOUT_DEFENDING_KICK_MUST_BE_AUTOMATIC');
  const moment = buildShootoutPlayableMoment(state, controlledTeamId);
  if (!moment || moment.kickId !== kick.kickId || moment.mode !== 'attack') {
    throw new Error('COMPETITION_SHOOTOUT_MOMENT_UNAVAILABLE');
  }
  return {
    kick:shootoutSessionClone(kick),
    moment:shootoutSessionClone(moment),
  };
}

export function createCompetitionShootoutSession({ shootoutState, controlledTeamId, regulationResult } = {}) {
  assertSupportedShootoutState(shootoutState);
  if (shootoutState.status !== 'active') throw new Error('COMPETITION_SHOOTOUT_SESSION_REQUIRES_ACTIVE_STATE');
  if (controlledTeamId !== shootoutState.homeTeamId && controlledTeamId !== shootoutState.awayTeamId) {
    throw new Error('COMPETITION_SHOOTOUT_CONTROLLED_TEAM_INVALID');
  }
  if (!regulationResult || typeof regulationResult !== 'object') throw new Error('COMPETITION_SHOOTOUT_REGULATION_RESULT_REQUIRED');

  const state = advanceOpponentKicks(shootoutState, controlledTeamId);
  const pending = state.status === 'active' ? pendingShootoutKick(state, controlledTeamId) : null;
  const session = {
    version:COMPETITION_SHOOTOUT_SESSION_VERSION,
    shootoutId:state.shootoutId,
    revision:1,
    controlledTeamId,
    status:state.status === 'complete' ? 'complete' : 'pending',
    state:shootoutSessionClone(state),
    regulationResult:shootoutSessionClone(regulationResult),
    pending,
    lastMoment:null,
    lastReceipt:null,
    lastShot:null,
    progressionReceipt:null,
  };
  return assertSupportedCompetitionShootoutSession(session);
}

export function assertSupportedCompetitionShootoutSession(session) {
  if (!session || session.version !== COMPETITION_SHOOTOUT_SESSION_VERSION) throw new Error('COMPETITION_SHOOTOUT_SESSION_VERSION_UNSUPPORTED');
  if (!Number.isInteger(session.revision) || session.revision < 1) throw new Error('COMPETITION_SHOOTOUT_SESSION_REVISION_INVALID');
  if (!session.regulationResult || typeof session.regulationResult !== 'object') throw new Error('COMPETITION_SHOOTOUT_REGULATION_RESULT_REQUIRED');
  const state = assertSupportedShootoutState(session.state);
  if (session.shootoutId !== state.shootoutId) throw new Error('COMPETITION_SHOOTOUT_SESSION_ID_MISMATCH');
  if (session.controlledTeamId !== state.homeTeamId && session.controlledTeamId !== state.awayTeamId) {
    throw new Error('COMPETITION_SHOOTOUT_CONTROLLED_TEAM_INVALID');
  }

  if (session.status === 'pending') {
    if (state.status !== 'active' || !session.pending) throw new Error('COMPETITION_SHOOTOUT_PENDING_STATE_INVALID');
    const expected = getNextShootoutKick(state);
    if (expected?.teamId !== session.controlledTeamId) throw new Error('COMPETITION_SHOOTOUT_DEFENDING_KICK_EXPOSED');
    if (!sameKick(session.pending.kick, expected)) throw new Error('COMPETITION_SHOOTOUT_PENDING_KICK_STALE');
    if (session.pending.moment?.kickId !== expected.kickId || session.pending.moment?.shootoutId !== state.shootoutId) {
      throw new Error('COMPETITION_SHOOTOUT_PENDING_MOMENT_STALE');
    }
    if (session.pending.moment?.mode !== 'attack' || session.pending.moment?.attackingTeamId !== session.controlledTeamId) {
      throw new Error('COMPETITION_SHOOTOUT_DEFENDING_MOMENT_EXPOSED');
    }
  } else if (session.status === 'committed') {
    if (!session.lastReceipt || !session.lastMoment || !session.lastShot || session.pending) {
      throw new Error('COMPETITION_SHOOTOUT_COMMITTED_STATE_INVALID');
    }
    const last = state.kicks.at(-1);
    if (!last || last.kickId !== session.lastReceipt.kickId || session.lastMoment.kickId !== last.kickId) {
      throw new Error('COMPETITION_SHOOTOUT_COMMITTED_RECEIPT_STALE');
    }
    if (session.lastMoment.mode !== 'attack' || session.lastMoment.attackingTeamId !== session.controlledTeamId) {
      throw new Error('COMPETITION_SHOOTOUT_DEFENDING_MOMENT_EXPOSED');
    }
  } else if (session.status === 'complete') {
    if (state.status !== 'complete' || session.pending) throw new Error('COMPETITION_SHOOTOUT_COMPLETE_STATE_INVALID');
  } else {
    throw new Error('COMPETITION_SHOOTOUT_SESSION_STATUS_INVALID');
  }
  return session;
}

export function resolveCompetitionShootoutSession(session, intent = null) {
  assertSupportedCompetitionShootoutSession(session);
  if (session.status !== 'pending') throw new Error('COMPETITION_SHOOTOUT_SESSION_NOT_PENDING');
  const expected = getNextShootoutKick(session.state);
  if (expected?.teamId !== session.controlledTeamId) throw new Error('COMPETITION_SHOOTOUT_DEFENDING_KICK_MUST_BE_AUTOMATIC');
  if (!sameKick(session.pending.kick, expected)) throw new Error('COMPETITION_SHOOTOUT_PENDING_KICK_STALE');
  const resolved = resolveShootoutKick(session.state, { intent });
  if (resolved.kick?.kickId !== session.pending.kick.kickId) throw new Error('COMPETITION_SHOOTOUT_RESOLVED_KICK_MISMATCH');
  const next = {
    ...session,
    revision:session.revision + 1,
    status:'committed',
    state:shootoutSessionClone(resolved.state),
    pending:null,
    lastMoment:shootoutSessionClone(session.pending.moment),
    lastReceipt:shootoutSessionClone(resolved.receipt),
    lastShot:shootoutSessionClone(resolved.shot),
  };
  return {
    session:assertSupportedCompetitionShootoutSession(next),
    receipt:resolved.receipt,
    shot:resolved.shot,
  };
}

export function acknowledgeCompetitionShootoutSession(session) {
  assertSupportedCompetitionShootoutSession(session);
  if (session.status !== 'committed') throw new Error('COMPETITION_SHOOTOUT_RESULT_NOT_COMMITTED');
  if (session.state.status === 'complete') {
    return assertSupportedCompetitionShootoutSession({
      ...session,
      revision:session.revision + 1,
      status:'complete',
      pending:null,
    });
  }

  const state = advanceOpponentKicks(session.state, session.controlledTeamId);
  if (state.status === 'complete') {
    return assertSupportedCompetitionShootoutSession({
      ...session,
      revision:session.revision + 1,
      status:'complete',
      state:shootoutSessionClone(state),
      pending:null,
    });
  }

  return assertSupportedCompetitionShootoutSession({
    ...session,
    revision:session.revision + 1,
    status:'pending',
    state:shootoutSessionClone(state),
    pending:pendingShootoutKick(state, session.controlledTeamId),
  });
}

export function competitionShootoutPresentation(session) {
  assertSupportedCompetitionShootoutSession(session);
  if (session.status !== 'committed') return null;
  return {
    moment:shootoutSessionClone(session.lastMoment),
    resolution:{
      moment:shootoutSessionClone(session.lastMoment),
      shot:shootoutSessionClone(session.lastShot),
      shootout:{
        receipt:shootoutSessionClone(session.lastReceipt),
        score:getShootoutScore(session.state),
      },
    },
  };
}

export function completedCompetitionShootout(session) {
  assertSupportedCompetitionShootoutSession(session);
  if (session.status !== 'complete' || session.state.status !== 'complete') return null;
  return {
    summary:shootoutSummary(session.state),
    regulationResult:shootoutSessionClone(session.regulationResult),
    userWon:session.state.winnerTeamId === session.controlledTeamId,
  };
}

export function markCompetitionShootoutProgressed(session, receipt) {
  assertSupportedCompetitionShootoutSession(session);
  if (session.status !== 'complete') throw new Error('COMPETITION_SHOOTOUT_NOT_COMPLETE');
  if (!receipt?.shootoutId || receipt.shootoutId !== session.shootoutId) throw new Error('COMPETITION_SHOOTOUT_PROGRESSION_RECEIPT_INVALID');
  if (session.progressionReceipt) {
    if (session.progressionReceipt.shootoutId !== receipt.shootoutId) throw new Error('COMPETITION_SHOOTOUT_ALREADY_PROGRESSED');
    return session;
  }
  return assertSupportedCompetitionShootoutSession({
    ...session,
    revision:session.revision + 1,
    progressionReceipt:shootoutSessionClone(receipt),
  });
}
