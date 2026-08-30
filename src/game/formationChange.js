import { teamStrength } from '../modules/matchEngine.js';

/**
 * src/game/formationChange.js — Mid-match formation change for the live
 * match viewer. Pure, DOM-free. Ported from ui/watchmatch.js's
 * _applyFormationChange (Phase 5, docs/plan/04-migration-phases.md).
 *
 * Re-shapes the current XI without silently moving bench players into the
 * match. Personnel changes must go through the substitution rules so they
 * consume a substitution and create a visible match event.
 */

const SIDE = {
  home: { active: 'hActive', bench: 'hBenchLeft', fitness: 'hFitness', str: 'hStr', formation: 'homeFormation' },
  away: { active: 'aActive', bench: 'aBenchLeft', fitness: 'aFitness', str: 'aStr', formation: 'awayFormation' },
};

function sideOf(userIsHome) { return userIsHome ? SIDE.home : SIDE.away; }
function oppSideOf(userIsHome) { return userIsHome ? SIDE.away : SIDE.home; }

export function applyFormationChange(liveState, userIsHome, newFormation) {
  const k = sideOf(userIsHome);
  const fitMap = liveState[k.fitness];
  const newXI = liveState[k.active]
    .map(p => ({ ...p, fitness: fitMap.get(p.id) ?? p.fitness ?? 90 }));
  const newStr = teamStrength(newXI);

  const oppK = oppSideOf(userIsHome);
  const hStr = userIsHome ? newStr : liveState[oppK.str];
  const aStr = userIsHome ? liveState[oppK.str] : newStr;
  const hMidShare = (hStr.midfield + aStr.midfield) > 0
    ? hStr.midfield / (hStr.midfield + aStr.midfield) : 0.5;

  return {
    ...liveState,
    [k.active]: newXI,
    [k.bench]: liveState[k.bench],
    [k.str]: newStr,
    [k.formation]: newFormation,
    hMidShare,
  };
}
