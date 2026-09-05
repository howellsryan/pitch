import {
  finaliseLiveMatch,
  resumePlayableMatchPhase,
  simulateMatchSegment,
} from './matchEngine.js';
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
    const selection = evaluatePlayableMomentSelection({
      moment:suspended.pendingPlayableMoment,
      session,
      liveState,
    });
    if (selection.selected) {
      const base = withLiveProgress(session, { liveState, currentPhase, allEvents });
      const pending = attachPendingPlayableMoment(base, {
        moment:suspended.pendingPlayableMoment,
        continuation:suspended.playableContinuation,
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
  const committed = commitPlayableMomentToSession(session, {
    momentId:session.pending.momentId,
    intent,
    resolution:authoritative.playableResolution,
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
