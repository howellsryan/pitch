import { advanceLiveMatchStory, createLiveMatchStoryState } from './liveMatchStory.js';

export const BROADCAST_FRAME_SEMANTICS_VERSION = 3;

const storyStateBySimulation = new WeakMap();

function storyStateFor(simulation) {
  let state = storyStateBySimulation.get(simulation);
  if (!state) {
    state = createLiveMatchStoryState();
    storyStateBySimulation.set(simulation, state);
  }
  return state;
}

/**
 * Text-first presentation adapter for the existing ledger-driven Broadcast
 * sequencer. Broadcast still paces the authoritative record, but its internal
 * acquire/route/contest stages are translated into one evolving passage of
 * football commentary rather than exposed as separate debug-like snippets.
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
  return advanceLiveMatchStory(storyStateFor(simulation), {
    record:scene?.record ?? null,
    stage:scene?.stage ?? 'acquire',
    playersById,
  });
}
