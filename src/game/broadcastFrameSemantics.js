import { LEDGER_PRESENTATION_TIME_SCALE } from './broadcastSimulation.js';
import { advanceLiveMatchStory, createLiveMatchStoryState } from './liveMatchStory.js';

export const BROADCAST_FRAME_SEMANTICS_VERSION = 5;

const storyStateBySimulation = new WeakMap();

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
 * `commentaryGoalReady` is presentation-only handshake state. It never changes
 * football authority; it simply tells the legacy score/event reveal seam that
 * the narrated passage has finally reached its terminal "GOAL!" beat.
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

  const playersById = new Map((simulation.players ?? []).map(player => [player.id, player]));
  const scene = simulation.activePhase;
  const presentation = advanceLiveMatchStory(storyStateFor(simulation), {
    record:scene?.record ?? null,
    stage:scene?.stage ?? 'acquire',
    playersById,
    nowMs:commentaryClockMs(simulation),
  });

  if (presentation.action?.startsWith('GOAL!')) simulation.commentaryGoalReady = true;
  return presentation;
}
