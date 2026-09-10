import { LEDGER_PRESENTATION_TIME_SCALE } from './broadcastSimulation.js';
import {
  advanceLiveMatchStory,
  createLiveMatchStoryState,
  resetLiveMatchStoryForHalfTime,
} from './liveMatchStory.js';

export const BROADCAST_FRAME_SEMANTICS_VERSION = 8;

const storyStateBySimulation = new WeakMap();

export function matchesCommentaryGoal(revealed, event) {
  return Boolean(revealed && event && revealed.teamId === event.teamId
    && revealed.playerId === event.playerId && revealed.minute === event.minute);
}

// A resumed committed moment may replay its notice after the score was restored.
// Read engine totals instead of incrementing presentation state a second time.
export function revealCommentaryGoal(event, liveState, revealedGoals, homeTeamId, awayTeamId) {
  const homeGoals = liveState.hGoals ?? 0;
  const awayGoals = liveState.aGoals ?? 0;
  const teamGoals = event.teamId === homeTeamId ? homeGoals : event.teamId === awayTeamId ? awayGoals : 0;
  const alreadyShown = revealedGoals.filter(goal => goal.teamId === event.teamId).length;
  return {
    homeGoals,
    awayGoals,
    goals:alreadyShown < teamGoals ? [...revealedGoals, event] : revealedGoals,
  };
}

function storyStateFor(simulation) {
  let state = storyStateBySimulation.get(simulation);
  if (!state) {
    state = createLiveMatchStoryState();
    storyStateBySimulation.set(simulation, state);
  }
  return state;
}

function commentaryClockMs(simulation) {
  const presentationClock = Number(simulation?.clock ?? 0);
  if (!Number.isFinite(presentationClock) || presentationClock <= 0) return 0;
  return presentationClock / Math.max(1, Number(LEDGER_PRESENTATION_TIME_SCALE) || 1);
}

/**
 * Text-first presentation adapter for the existing ledger-driven Broadcast.
 * The authoritative simulation may advance quickly, while liveMatchStory owns
 * the human reading pace and admits only a bounded set of meaningful passages.
 *
 * The two flags written onto the simulation are presentation-only handshakes:
 * - commentaryGoalReady means the reader has reached its terminal "GOAL!" beat.
 * - commentaryBusy means an authoritative goal passage still deserves to finish
 *   before full time, or normal in-match commentary is still being read.
 * Neither flag changes RNG, score, ledger records or any football outcome.
 */
export function describeBroadcastFrame(frame, simulation) {
  if (!simulation || typeof simulation !== 'object') {
    return {
      phaseLabel:frame?.phaseLabel ?? 'Opening exchanges',
      action:'The match is beginning to take shape',
      detail:frame?.carrierName
        ? `${frame.carrierName} helps the next spell of possession develop as both teams settle into their shape.`
        : 'Both teams are feeling their way into the game and looking for the first sustained spell of pressure.',
    };
  }

  const state = storyStateFor(simulation);

  const atHalfTime = frame?.mode === 'half-time';
  const hasGoalPassage = state.current?.record?.finish === 'goal'
    || state.queue.some(event => event.record.finish === 'goal');
  if (atHalfTime && !hasGoalPassage) {
    // Half time comes from the authoritative phase boundary. Clear any routine
    // first-half backlog so second-half commentary cannot replay stale passages.
    resetLiveMatchStoryForHalfTime(state);
    simulation.commentaryBusy = false;
    return {
      phaseLabel:'Half time',
      action:'HALF TIME',
      detail:'The first half is complete. Play is paused before the teams return for the second half.',
    };
  }

  const playersById = new Map((simulation.players ?? []).map(player => [player.id, player]));
  const scene = simulation.activePhase;
  const matchComplete = Number(simulation.phase) >= 120;
  const presentation = advanceLiveMatchStory(state, {
    record:scene?.record ?? null,
    stage:scene?.stage ?? 'acquire',
    playersById,
    nowMs:commentaryClockMs(simulation),
    matchComplete:matchComplete || atHalfTime,
  });

  const goalReady = presentation.action?.startsWith('GOAL!');
  const current = state.current;
  // A reveal belongs to a specific ledger record and fires once. A boolean
  // derived from a lingering GOAL headline could release the NEXT team's goal.
  if (goalReady && !current.goalRevealed) {
    current.goalRevealed = true;
    simulation.commentaryGoalReady = true;
    simulation.commentaryGoalEvent = {
      teamId:current.record.teamId,
      playerId:current.record.shotId,
      minute:current.record.minute,
    };
  }

  if (atHalfTime && !state.current && !state.queue.length) {
    return describeBroadcastFrame(frame, simulation);
  }

  // Once phase 120 has finished, stale routine text must never prevent the
  // full-time screen. The only commentary allowed to hold closure is a real
  // authoritative goal passage that has not yet reached its GOAL terminal beat.
  simulation.commentaryBusy = matchComplete
    ? Boolean(state.current?.record?.finish === 'goal' && !goalReady)
    : Boolean(state.current || state.queue.length);

  return presentation;
}
