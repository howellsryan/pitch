import { normalizePlayableIntent, PLAYABLE_INTENT_VERSION, PLAYABLE_MOMENT_VERSION } from './matchActionResolver.js';

/**
 * Phase 2 Play Key Moments career-session contract.
 *
 * This module is deliberately pure/DOM-free/DB-free. It turns the Phase 1
 * authoritative continuation into JSON-safe data that can live inside the
 * existing save row. MatchScreen owns orchestration; db.js owns atomic writes;
 * matchEngine.js remains the only football authority.
 */

export const PLAYABLE_MATCH_SESSION_VERSION = 1;
export const PLAYABLE_PENDING_VERSION = 1;
export const PLAYABLE_RECEIPT_VERSION = 1;
export const PLAYABLE_SCENE_VERSION = 1;

export const PLAYABLE_KEY_MOMENTS_FLAGS = Object.freeze({
  enabled:true,
  attack:true,
  goalkeeper:true,
});

export const PLAYABLE_MOMENT_SOFT_CAP = 5;
export const PLAYABLE_MOMENT_MIN_PHASE_GAP = 7;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numeric(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function clonePlain(value) {
  if (value == null || typeof value !== 'object') return value;
  if (value instanceof Map) return [...value.entries()].map(([key, item]) => [key, clonePlain(item)]);
  if (Array.isArray(value)) return value.map(clonePlain);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = clonePlain(item);
  }
  return out;
}

function mapEntries(value, field) {
  if (!Array.isArray(value)) throw new Error(`Playable session ${field} must be serialized map entries`);
  return new Map(value.map(entry => {
    if (!Array.isArray(entry) || entry.length !== 2) throw new Error(`Playable session ${field} contains an invalid map entry`);
    return [entry[0], entry[1]];
  }));
}

function stableHash(input) {
  let hash = 2166136261;
  const text = String(input ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function playableStableRoll(input) {
  return stableHash(input) / 0x100000000;
}

export function playableEventKey(event = {}) {
  if (event.type === 'league') return `league:${event.gw ?? 'x'}:${event.fixtureId ?? 'unknown'}`;
  if (event.type === 'ucl_md') return `ucl_md:${event.cupId ?? 'ucl'}:${event.gw ?? event.matchday ?? 'x'}:${event.opponentId ?? 'unknown'}`;
  if (event.type === 'cup') return `cup:${event.cupId ?? 'cup'}:${event.gw ?? 'x'}:${event.roundIdx ?? event.roundName ?? 'round'}:${event.opponentId ?? 'unknown'}`;
  return `${event.type ?? 'match'}:${event.gw ?? 'x'}:${event.fixtureId ?? event.opponentId ?? 'unknown'}`;
}

export function playableSessionId(slotId, event) {
  return `pkm:${PLAYABLE_MATCH_SESSION_VERSION}:${slotId}:${playableEventKey(event)}`;
}

export function serializeLiveMatchState(liveState) {
  if (!liveState) throw new Error('Playable session requires live match state');
  return {
    ...clonePlain(liveState),
    hFitness:[...(liveState.hFitness ?? new Map()).entries()].map(clonePlain),
    aFitness:[...(liveState.aFitness ?? new Map()).entries()].map(clonePlain),
  };
}

export function deserializeLiveMatchState(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Playable session is missing live match state');
  return {
    ...clonePlain(raw),
    hFitness:mapEntries(raw.hFitness, 'hFitness'),
    aFitness:mapEntries(raw.aFitness, 'aFitness'),
  };
}

export function serializePlayableContinuation(continuation) {
  if (!continuation || typeof continuation !== 'object') throw new Error('Playable session requires a continuation');
  return {
    ...clonePlain(continuation),
    hFitness:[...(continuation.hFitness ?? new Map()).entries()].map(clonePlain),
    aFitness:[...(continuation.aFitness ?? new Map()).entries()].map(clonePlain),
  };
}

export function deserializePlayableContinuation(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Playable session is missing its continuation');
  return {
    ...clonePlain(raw),
    hFitness:mapEntries(raw.hFitness, 'continuation.hFitness'),
    aFitness:mapEntries(raw.aFitness, 'continuation.aFitness'),
  };
}

export function createPlayableMatchSession({ slotId, event, userTeamId, userIsHome, liveState, currentPhase = 0, allEvents = [] } = {}) {
  if (!slotId) throw new Error('Playable session requires a career slot');
  if (!event?.type) throw new Error('Playable session requires a match event');
  if (!userTeamId) throw new Error('Playable session requires the managed team');
  return {
    version:PLAYABLE_MATCH_SESSION_VERSION,
    sessionId:playableSessionId(slotId, event),
    slotId,
    eventKey:playableEventKey(event),
    event:clonePlain(event),
    userTeamId,
    userIsHome:Boolean(userIsHome),
    status:'active',
    revision:1,
    currentPhase:Math.max(0, Math.trunc(numeric(currentPhase))),
    liveState:serializeLiveMatchState(liveState),
    allEvents:clonePlain(allEvents ?? []),
    pending:null,
    lastReceipt:null,
    history:[],
    momentsOffered:0,
    lastMomentPhase:null,
    versions:{
      session:PLAYABLE_MATCH_SESSION_VERSION,
      pending:PLAYABLE_PENDING_VERSION,
      receipt:PLAYABLE_RECEIPT_VERSION,
      scene:PLAYABLE_SCENE_VERSION,
      intent:PLAYABLE_INTENT_VERSION,
      moment:PLAYABLE_MOMENT_VERSION,
    },
  };
}

export function assertSupportedPlayableSession(session) {
  if (!session || session.version !== PLAYABLE_MATCH_SESSION_VERSION) throw new Error('Unsupported playable match session version');
  if (session.versions?.session !== PLAYABLE_MATCH_SESSION_VERSION
      || session.versions?.pending !== PLAYABLE_PENDING_VERSION
      || session.versions?.receipt !== PLAYABLE_RECEIPT_VERSION
      || session.versions?.scene !== PLAYABLE_SCENE_VERSION
      || session.versions?.intent !== PLAYABLE_INTENT_VERSION
      || session.versions?.moment !== PLAYABLE_MOMENT_VERSION) {
    throw new Error('Playable match session was started by an unsupported version');
  }
  if (session.pending && session.pending.version !== PLAYABLE_PENDING_VERSION) throw new Error('Unsupported pending playable moment version');
  return session;
}

export function isPlayableScenarioEnabled(mode) {
  return Boolean(PLAYABLE_KEY_MOMENTS_FLAGS.enabled && PLAYABLE_KEY_MOMENTS_FLAGS[mode]);
}

export function evaluatePlayableMomentSelection({ moment, session, liveState = null } = {}) {
  assertSupportedPlayableSession(session);
  if (!moment || !isPlayableScenarioEnabled(moment.mode)) return { selected:false, reason:'scenario_disabled', probability:0, roll:1 };
  if (session.status !== 'active' || session.pending) return { selected:false, reason:'session_busy', probability:0, roll:1 };
  if (session.momentsOffered >= PLAYABLE_MOMENT_SOFT_CAP) return { selected:false, reason:'soft_cap', probability:0, roll:1 };

  const phase = Math.max(0, Math.trunc(numeric(moment.phase)));
  const lastPhase = session.lastMomentPhase == null ? null : Math.trunc(numeric(session.lastMomentPhase));
  if (lastPhase != null && phase - lastPhase < PLAYABLE_MOMENT_MIN_PHASE_GAP) {
    return { selected:false, reason:'pacing_gap', probability:0, roll:1 };
  }

  const xg = clamp(numeric(moment.xg, 0), 0, .6);
  const minute = clamp(numeric(moment.minute, 0), 0, 120);
  const state = liveState ?? deserializeLiveMatchState(session.liveState);
  const userGoals = session.userIsHome ? numeric(state.hGoals) : numeric(state.aGoals);
  const opponentGoals = session.userIsHome ? numeric(state.aGoals) : numeric(state.hGoals);
  const scoreGap = Math.abs(userGoals - opponentGoals);
  const recent = session.history.slice(-2);
  const repeatedMode = recent.length >= 1 && recent.at(-1)?.mode === moment.mode;

  // Selection is strictly pre-finish. It uses chance context and match pacing,
  // never packet.shot / packet.finish or the would-have-been automatic result.
  let probability = .14 + xg * 1.25;
  if (xg >= .28) probability += .10;
  if (minute >= 70 && scoreGap <= 1) probability += .12;
  if (minute >= 82 && scoreGap === 0) probability += .06;
  if (moment.mode === 'goalkeeper') probability += .025;
  if (repeatedMode) probability -= .08;
  probability = clamp(probability, .14, .78);

  const roll = playableStableRoll(`${session.sessionId}|${phase}|${moment.mode}|${moment.shooterId}|${xg.toFixed(3)}`);
  return { selected:roll < probability, reason:roll < probability ? 'selected' : 'pacing_roll', probability, roll };
}

export function playableMomentId(session, moment) {
  return `${session.sessionId}:p${moment.phase}:${moment.mode}:${moment.shooterId}`;
}

export function attachPendingPlayableMoment(session, { moment, continuation } = {}) {
  assertSupportedPlayableSession(session);
  if (session.status !== 'active' || session.pending) throw new Error('Playable match session already has a pending moment');
  if (!moment || !continuation) throw new Error('Playable pending moment requires moment and continuation');
  const revision = session.revision + 1;
  return {
    ...session,
    status:'pending',
    revision,
    pending:{
      version:PLAYABLE_PENDING_VERSION,
      momentId:playableMomentId(session, moment),
      revision,
      sceneVersion:PLAYABLE_SCENE_VERSION,
      intentVersion:PLAYABLE_INTENT_VERSION,
      moment:clonePlain(moment),
      continuation:serializePlayableContinuation(continuation),
    },
    momentsOffered:session.momentsOffered + 1,
    lastMomentPhase:moment.phase,
  };
}

function receiptResolution(resolution) {
  if (!resolution) throw new Error('Playable commit requires an authoritative resolution');
  return clonePlain(resolution);
}

export function commitPlayableMomentToSession(session, { momentId, intent = null, resolution, updatedState, segEvents = [] } = {}) {
  assertSupportedPlayableSession(session);
  if (session.status !== 'pending' || !session.pending) throw new Error('Playable match session has no pending moment');
  if (session.pending.momentId !== momentId) throw new Error('Playable moment ID does not match pending session');
  const normalizedIntent = intent == null ? null : normalizePlayableIntent(intent);
  const authoritativeResolution = receiptResolution(resolution);
  const nextRevision = session.revision + 1;
  const receipt = {
    version:PLAYABLE_RECEIPT_VERSION,
    sessionId:session.sessionId,
    momentId,
    pendingRevision:session.pending.revision,
    committedRevision:nextRevision,
    phase:session.pending.moment.phase,
    mode:session.pending.moment.mode,
    intent:normalizedIntent,
    resolution:authoritativeResolution,
  };
  const historyEntry = {
    momentId,
    phase:receipt.phase,
    minute:session.pending.moment.minute,
    mode:receipt.mode,
    finish:authoritativeResolution.shot?.finish ?? authoritativeResolution.finish ?? null,
  };
  return {
    session:{
      ...session,
      status:'active',
      revision:nextRevision,
      currentPhase:Math.max(session.currentPhase, Math.trunc(numeric(receipt.phase))),
      liveState:serializeLiveMatchState(updatedState),
      allEvents:[...(session.allEvents ?? []), ...clonePlain(segEvents ?? [])],
      pending:null,
      lastReceipt:receipt,
      history:[...(session.history ?? []), historyEntry].slice(-8),
    },
    receipt,
  };
}

export function markPlayableMatchReadyToClose(session, result) {
  assertSupportedPlayableSession(session);
  if (session.pending) throw new Error('Cannot finalize a playable match with an unresolved moment');
  return {
    ...session,
    status:'ready_to_close',
    revision:session.revision + 1,
    currentPhase:120,
    finalResult:clonePlain(result),
  };
}

export function restorePlayableRuntime(session) {
  assertSupportedPlayableSession(session);
  return {
    liveState:deserializeLiveMatchState(session.liveState),
    allEvents:clonePlain(session.allEvents ?? []),
    currentPhase:Math.max(0, Math.trunc(numeric(session.currentPhase))),
    pending:session.pending ? {
      ...clonePlain(session.pending),
      continuation:deserializePlayableContinuation(session.pending.continuation),
    } : null,
    finalResult:session.finalResult ? clonePlain(session.finalResult) : null,
  };
}

export function samePlayableIntent(left, right) {
  const leftNormalized = left == null ? null : normalizePlayableIntent(left);
  const rightNormalized = right == null ? null : normalizePlayableIntent(right);
  return JSON.stringify(leftNormalized) === JSON.stringify(rightNormalized);
}

export const PLAYABLE_CALIBRATION_POLICIES = Object.freeze({
  poor:Object.freeze({
    attack:Object.freeze({ attack:Object.freeze({ aimX:1.18, aimY:1.05, power:.45, timing:.30 }) }),
    goalkeeper:Object.freeze({ goalkeeper:Object.freeze({ x:0, y:.45, timing:.30 }) }),
  }),
  average:Object.freeze({
    attack:Object.freeze({ attack:Object.freeze({ aimX:.28, aimY:.55, power:.68, timing:.62 }) }),
    goalkeeper:Object.freeze({ goalkeeper:Object.freeze({ x:.22, y:.50, timing:.62 }) }),
  }),
  strong:Object.freeze({
    attack:Object.freeze({ attack:Object.freeze({ aimX:.66, aimY:.72, power:.76, timing:.84 }) }),
    goalkeeper:Object.freeze({ goalkeeper:Object.freeze({ x:.62, y:.66, timing:.84 }) }),
  }),
  nearPerfect:Object.freeze({
    attack:Object.freeze({ attack:Object.freeze({ aimX:.82, aimY:.82, power:.78, timing:.96 }) }),
    goalkeeper:Object.freeze({ goalkeeper:Object.freeze({ x:.78, y:.78, timing:.96 }) }),
  }),
});
