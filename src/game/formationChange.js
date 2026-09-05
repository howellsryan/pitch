import { refreshLiveMatchState } from '../modules/matchEngine.js';
import { normalizeTeamInstructions } from '../modules/tactics.js';

/**
 * src/game/formationChange.js — Mid-match tactical commands for the live match
 * viewer. Pure, DOM-free.
 *
 * T4 keeps formation, mentality and team-instruction changes in one thin state
 * command layer. Every command refreshes the same authoritative match state
 * used by Quick Sim, preventing the live viewer from growing a second tactics
 * schema or a presentation-only set of instructions.
 */

const SIDE = {
  home: {
    active:'hActive', bench:'hBenchLeft', fitness:'hFitness', formation:'homeFormation',
    mentality:'homeMentality', tactics:'homeTactics',
  },
  away: {
    active:'aActive', bench:'aBenchLeft', fitness:'aFitness', formation:'awayFormation',
    mentality:'awayMentality', tactics:'awayTactics',
  },
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
 * Applies a mentality change to one side and immediately recomputes the shared
 * tactical state. The opponent mentality and both sides' instructions remain
 * untouched.
 */
export function applyMentalityChange(liveState, userIsHome, mentality) {
  const side = sideOf(userIsHome);
  return refreshLiveMatchState({
    ...liveState,
    [side.mentality]:mentality,
  });
}

/**
 * Applies one canonical tactics-v2 instruction to the controlled side. The
 * normalizer owns validation and compatibility aliases, so Squad, Quick Sim and
 * Watch all consume the same shape. Invalid values naturally normalize back to
 * the current/default value instead of entering live state.
 */
export function applyTeamInstructionChange(liveState, userIsHome, instructionId, value) {
  const side = sideOf(userIsHome);
  const current = normalizeTeamInstructions(liveState?.[side.tactics] ?? {});
  const next = normalizeTeamInstructions({ ...current, [instructionId]:value });

  return refreshLiveMatchState({
    ...liveState,
    [side.tactics]:next,
  });
}
