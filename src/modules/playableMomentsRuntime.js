import {
  finaliseLiveMatch,
  resumePlayableMatchPhase,
  simulateMatchSegment,
} from './matchEngine.js';
import { preparePlayableContactContinuation } from './matchContactPhase.js';
import {
  acknowledgePlayableMoment,
  attachPendingPlayableMoment,
  commitPlayableMomentToSession,
  evaluatePlayableMomentSelection,
  markPlayableMatchReadyToClose,
  restorePlayableRuntime,
  serializeLiveMatchState,
} from './playableMomentsCareer.js';
import {
  clearPlayableMatchSessionAtomic,
  commitPlayableMomentAtomic,
  persistPlayableSessionAtomic,
} from './playableMomentsPersistence.js';

function withLiveProgress(session, { liveState, currentPhase, allEvents }) {
  return {
    ...session,
    currentPhase,
    liveState:serializeLiveMatchState(liveState),
    allEvents:[...(allEvents ?? [])],
  };
}

function automaticContinuationReveal(resolution, continuation) {
  const prepared = continuation?.preparedAction;
  const action = prepared?.continuationAction;
  if (!action || resolution?.continuation) return resolution;

  const record = resolution?.record ?? {};
  const success = Number(prepared.packet?.execution ?? 1) < Number(prepared.successChance ?? 0);
  const outcome = success && record.shotId ? 'chance_created' : record.outcome ?? (success ? 'progress' : action.failureOutcome);
  const targetZone = action.targetZone ?? { x:0, y:.68 };
  const weight = action.family === 'through_ball' ? .76 : action.family === 'cross' ? .72 : action.family === 'cutback' ? .58 : .68;

  return {
    ...resolution,
    continuation:{
      version:action.version,
      family:action.family,
      success,
      outcome,
      passerId:action.passerId,
      receiverId:action.receiverId,
      interceptorId:action.interceptorId,
      successChance:Number(prepared.successChance ?? action.baselineSuccessChance ?? 0),
      executionQuality:null,
      target:{ x:Number(targetZone.x ?? 0), y:Number(targetZone.y ?? .68), weight, timing:.68 },
      downstreamChance:record.shotId ? {
        shooterId:record.shotId,
        assistId:record.assistId ?? null,
        pressureDefenderId:record.defenderId ?? null,
        xg:Number(record.xg ?? 0),
      } : null,
      presentationOnly:true,
    },
  };
}

export async function advancePlayableMatchPhase({
  session,
  homeTeam,
  awayTeam,
  liveState,
  allEvents = [],
  currentPhase,
  controlledTeamId,
} = {}) {
  if (session?.status !== 'active') throw new Error('Playable match can advance only from an active session');
  const phase = currentPhase + 1;
  const suspended = simulateMatchSegment(
    homeTeam,
    awayTeam,
    liveState,
    phase,
    phase,
    controlledTeamId,
    { suspend:true, controlledTeamId },
  );

  if (suspended.pendingPlayableMoment) {
    const contactCandidate = suspended.pendingPlayableMoment.interactionType === 'contact'
      ? preparePlayableContactContinuation(
          suspended.playableContinuation,
          controlledTeamId,
          suspended.pendingPlayableMoment.version,
        )
      : null;
    // buildPlayableMoment and this persistence seam derive the candidate from
    // the same fixed packet. If a contact cannot be reproduced, do not persist
    // a moment that the authoritative resume path cannot resolve.
    if (suspended.pendingPlayableMoment.interactionType === 'contact' && !contactCandidate) {
      const automatic = resumePlayableMatchPhase(
        homeTeam,
        awayTeam,
        liveState,
        suspended.playableContinuation,
        null,
        controlledTeamId,
      );
      return {
        kind:'advanced',
        selection:{ selected:false, reason:'contact_unavailable', probability:0, roll:1 },
        session,
        updatedState:automatic.updatedState,
        segEvents:automatic.segEvents,
        currentPhase:phase,
      };
    }

    const candidateMoment = contactCandidate?.moment ?? suspended.pendingPlayableMoment;
    const selectedContinuation = contactCandidate?.continuation ?? suspended.playableContinuation;
    const selection = evaluatePlayableMomentSelection({
      moment:candidateMoment,
      session,
      liveState,
    });
    if (selection.selected) {
      const base = withLiveProgress(session, { liveState, currentPhase, allEvents });
      const pending = attachPendingPlayableMoment(base, {
        moment:candidateMoment,
        continuation:selectedContinuation,
      });
      const persisted = await persistPlayableSessionAtomic(pending, {
        expectedSessionId:session.sessionId,
        expectedRevision:session.revision,
      });
      return {
        kind:'pending',
        selection,
        session:persisted.session,
        moment:persisted.session.pending.moment,
      };
    }

    // A rejected Phase 6 contact must resolve through the original automatic
    // continuation rather than its playable-only enriched prepared action.
    const automatic = resumePlayableMatchPhase(
      homeTeam,
      awayTeam,
      liveState,
      suspended.playableContinuation,
      null,
      controlledTeamId,
    );
    return {
      kind:'advanced',
      selection,
      session,
      updatedState:automatic.updatedState,
      segEvents:automatic.segEvents,
      currentPhase:phase,
    };
  }

  return {
    kind:'advanced',
    selection:null,
    session,
    updatedState:suspended.updatedState,
    segEvents:suspended.segEvents,
    currentPhase:phase,
  };
}

export async function resolvePendingPlayableMoment({ session, homeTeam, awayTeam, controlledTeamId, intent = null } = {}) {
  if (session?.status !== 'pending' || !session.pending) throw new Error('Playable match has no pending moment');
  const runtime = restorePlayableRuntime(session);
  const authoritative = resumePlayableMatchPhase(
    homeTeam,
    awayTeam,
    runtime.liveState,
    runtime.pending.continuation,
    intent,
    controlledTeamId,
  );
  const resolution = intent == null
    ? automaticContinuationReveal(authoritative.playableResolution, runtime.pending.continuation)
    : authoritative.playableResolution;
  const committed = commitPlayableMomentToSession(session, {
    momentId:session.pending.momentId,
    intent,
    resolution,
    updatedState:authoritative.updatedState,
    segEvents:authoritative.segEvents,
  });
  const persisted = await commitPlayableMomentAtomic({
    sessionId:session.sessionId,
    momentId:session.pending.momentId,
    expectedRevision:session.revision,
    intent,
    nextSession:committed.session,
    receipt:committed.receipt,
  });
  const restored = restorePlayableRuntime(persisted.session);
  return {
    session:persisted.session,
    receipt:persisted.receipt,
    idempotent:persisted.idempotent,
    liveState:restored.liveState,
    allEvents:restored.allEvents,
    currentPhase:restored.currentPhase,
  };
}

export async function acknowledgePlayableResult(session) {
  const next = acknowledgePlayableMoment(session);
  const persisted = await persistPlayableSessionAtomic(next, {
    expectedSessionId:session.sessionId,
    expectedRevision:session.revision,
  });
  return persisted.session;
}

export async function checkpointPlayableMatch(session, { liveState, currentPhase, allEvents } = {}) {
  if (session?.status !== 'active') throw new Error('Playable checkpoint requires an active session');
  const next = {
    ...withLiveProgress(session, { liveState, currentPhase, allEvents }),
    revision:session.revision + 1,
  };
  const persisted = await persistPlayableSessionAtomic(next, {
    expectedSessionId:session.sessionId,
    expectedRevision:session.revision,
  });
  return persisted.session;
}

export async function preparePlayableMatchClose({ session, homeTeam, awayTeam, liveState, allEvents = [] } = {}) {
  const result = finaliseLiveMatch(homeTeam, awayTeam, liveState, allEvents);
  const base = withLiveProgress(session, { liveState, currentPhase:120, allEvents });
  const ready = markPlayableMatchReadyToClose(base, result);
  const persisted = await persistPlayableSessionAtomic(ready, {
    expectedSessionId:session.sessionId,
    expectedRevision:session.revision,
  });
  return { session:persisted.session, result };
}

export async function clearPlayableMatchAfterClose(session) {
  if (!session) return { cleared:true, idempotent:true };
  return clearPlayableMatchSessionAtomic({
    sessionId:session.sessionId,
    expectedRevision:session.revision,
  });
}
