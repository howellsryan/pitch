import { refreshLiveMatchState } from '../modules/matchEngine.js';

/**
 * src/game/formationChange.js — Mid-match formation and mentality changes for
 * the live match viewer. Pure, DOM-free.
 *
 * P2 keeps this as a thin state-command layer: after changing the controlled
 * side's shape/mentality, the authoritative match engine refreshes strength,
 * role suitability, tactical modifiers and possession weighting from the same
 * schema used by Quick Sim. That prevents live changes from silently dropping
 * team-instruction or player-role effects.
 */

const SIDE = {
  home: { active:'hActive', bench:'hBenchLeft', fitness:'hFitness', formation:'homeFormation', mentality:'homeMentality' },
  away: { active:'aActive', bench:'aBenchLeft', fitness:'aFitness', formation:'awayFormation', mentality:'awayMentality' },
};

function sideOf(userIsHome) { return userIsHome ? SIDE.home : SIDE.away; }

export function applyFormationChange(liveState, userIsHome, newFormation) {
  const side = sideOf(userIsHome);
  const fitMap = liveState[side.fitness];
  const newXI = liveState[side.active]
    .map(player => ({ ...player, fitness:fitMap.get(player.id) ?? player.fitness ?? 90 }));

  return refreshLiveMatchState({
    ...liveState,
    [side.active]:newXI,
    [side.bench]:liveState[side.bench],
    [side.formation]:newFormation,
  });
}

/**
 * Applies a mentality change to one side and immediately recomputes the P2
 * tactical state. The opponent mentality and both sides' tactical plans stay
 * untouched.
 */
export function applyMentalityChange(liveState, userIsHome, mentality) {
  const side = sideOf(userIsHome);
  return refreshLiveMatchState({
    ...liveState,
    [side.mentality]:mentality,
  });
}
