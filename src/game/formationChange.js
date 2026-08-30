import { getMentalityMods, teamStrength } from '../modules/matchEngine.js';

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
  home: { active: 'hActive', bench: 'hBenchLeft', fitness: 'hFitness', str: 'hStr', formation: 'homeFormation', mentality: 'homeMentality', mods: 'hMods' },
  away: { active: 'aActive', bench: 'aBenchLeft', fitness: 'aFitness', str: 'aStr', formation: 'awayFormation', mentality: 'awayMentality', mods: 'aMods' },
};

function sideOf(userIsHome) { return userIsHome ? SIDE.home : SIDE.away; }
function oppSideOf(userIsHome) { return userIsHome ? SIDE.away : SIDE.home; }

function midfieldShare(hStr, aStr, hMods, aMods) {
  const raw = (hStr.midfield + aStr.midfield) > 0
    ? hStr.midfield / (hStr.midfield + aStr.midfield) : 0.5;
  return Math.min(0.85, Math.max(0.15, raw + hMods.midShareBoost - aMods.midShareBoost));
}

export function applyFormationChange(liveState, userIsHome, newFormation) {
  const k = sideOf(userIsHome);
  const fitMap = liveState[k.fitness];
  const newXI = liveState[k.active]
    .map(p => ({ ...p, fitness: fitMap.get(p.id) ?? p.fitness ?? 90 }));
  const newStr = teamStrength(newXI);

  const oppK = oppSideOf(userIsHome);
  const hStr = userIsHome ? newStr : liveState[oppK.str];
  const aStr = userIsHome ? liveState[oppK.str] : newStr;
  const hMidShare = midfieldShare(hStr, aStr, liveState.hMods, liveState.aMods);

  return {
    ...liveState,
    [k.active]: newXI,
    [k.bench]: liveState[k.bench],
    [k.str]: newStr,
    [k.formation]: newFormation,
    hMidShare,
  };
}

/**
 * Applies a mentality change to the active side of a watched match. The
 * simulation reads hMods/aMods and hMidShare on every subsequent segment, so
 * all three must be updated together rather than waiting for the next match.
 */
export function applyMentalityChange(liveState, userIsHome, mentality) {
  const k = sideOf(userIsHome);
  const hMentality = userIsHome ? mentality : liveState.homeMentality;
  const aMentality = userIsHome ? liveState.awayMentality : mentality;
  const hMods = getMentalityMods(hMentality);
  const aMods = getMentalityMods(aMentality);

  return {
    ...liveState,
    [k.mentality]: mentality,
    [k.mods]: userIsHome ? hMods : aMods,
    hMods,
    aMods,
    hMidShare: midfieldShare(liveState.hStr, liveState.aStr, hMods, aMods),
  };
}
