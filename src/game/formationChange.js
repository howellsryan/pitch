import { selectEleven, teamStrength } from '../modules/matchEngine.js';

/**
 * src/game/formationChange.js — Mid-match formation change for the live
 * match viewer. Pure, DOM-free. Ported from ui/watchmatch.js's
 * _applyFormationChange (Phase 5, docs/plan/04-migration-phases.md).
 *
 * Re-picks the best XI for the new formation out of everyone still
 * available (current active + bench — injured/suspended players are
 * already excluded by selectEleven), recomputes team strength and the
 * possession split, and leaves the fitness Map untouched (a formation
 * change doesn't sub anyone off, so nobody's fitness should reset).
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
  const available = [...liveState[k.active], ...liveState[k.bench]]
    .map(p => ({ ...p, fitness: fitMap.get(p.id) ?? p.fitness ?? 90, inSquad: true }));

  const newXI    = selectEleven(available, newFormation);
  const usedIds  = new Set(newXI.map(p => p.id));
  const newBench = available.filter(p => !usedIds.has(p.id));
  const newStr   = teamStrength(newXI);

  const oppK = oppSideOf(userIsHome);
  const hStr = userIsHome ? newStr : liveState[oppK.str];
  const aStr = userIsHome ? liveState[oppK.str] : newStr;
  const hMidShare = (hStr.midfield + aStr.midfield) > 0
    ? hStr.midfield / (hStr.midfield + aStr.midfield) : 0.5;

  return {
    ...liveState,
    [k.active]: newXI,
    [k.bench]: newBench,
    [k.str]: newStr,
    [k.formation]: newFormation,
    hMidShare,
  };
}
