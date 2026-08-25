import { teamStrength } from '../modules/matchEngine.js';

/**
 * src/game/substitutions.js — User-substitution rules for the live match
 * viewer. Pure, DOM-free: computes new live-match state, never renders it.
 * Ported from ui/watchmatch.js's _wmSubClick/_applyUserSub (Phase 5,
 * docs/plan/04-migration-phases.md) — same rules, same liveState shape
 * (src/modules/matchEngine.js's buildLiveMatchState/simulateMatchSegment),
 * just testable in isolation instead of only reachable through the DOM.
 *
 * AI substitutions are a different concern (in-simulation, no user choice)
 * and stay inline in matchEngine.js's simulateMatch/simulateMatchSegment —
 * this file is only the rules for a user-initiated swap.
 */

const SIDE = {
  home: { active: 'hActive', bench: 'hBenchLeft', fitness: 'hFitness', subsLeft: 'hSubsLeft', str: 'hStr' },
  away: { active: 'aActive', bench: 'aBenchLeft', fitness: 'aFitness', subsLeft: 'aSubsLeft', str: 'aStr' },
};

function sideOf(userIsHome) { return userIsHome ? SIDE.home : SIDE.away; }
function oppSideOf(userIsHome) { return userIsHome ? SIDE.away : SIDE.home; }

// ── Who can come off for a given bench player ─────────────────
// GK can only replace GK; outfield can only replace outfield. Fittest first.
export function eligibleSubOutTargets(liveState, userIsHome, subInPlayer) {
  const k = sideOf(userIsHome);
  const active = liveState[k.active];
  const fitMap = liveState[k.fitness];
  const pool = subInPlayer.position === 'GK'
    ? active.filter(p => p.position === 'GK')
    : active.filter(p => p.position !== 'GK');
  return [...pool].sort((a, b) => (fitMap.get(a.id) ?? 90) - (fitMap.get(b.id) ?? 90));
}

// ── Can this substitution happen? ──────────────────────────────
export function validateSubstitution(liveState, userIsHome, subInId, subOutId) {
  const k = sideOf(userIsHome);
  if (liveState[k.subsLeft] <= 0) return { ok: false, reason: 'no-subs-left' };

  const subIn  = liveState[k.bench].find(p => p.id === subInId);
  const subOut = liveState[k.active].find(p => p.id === subOutId);
  if (!subIn || !subOut) return { ok: false, reason: 'player-not-found' };
  if (subIn.injured) return { ok: false, reason: 'sub-in-injured' };
  if (subIn.position === 'GK' && subOut.position !== 'GK') return { ok: false, reason: 'gk-outfield-mismatch' };
  if (subIn.position !== 'GK' && subOut.position === 'GK') return { ok: false, reason: 'gk-outfield-mismatch' };

  return { ok: true, subIn, subOut };
}

// ── Apply a validated substitution, returning new state + the sub event ──
// Fitness Maps are mutated in place, matching matchEngine.js's own
// convention (simulateMatchSegment mutates hFitness/aFitness the same way);
// every other liveState field is replaced, not mutated.
export function applySubstitution(liveState, userIsHome, subInId, subOutId, minute, teamId) {
  const check = validateSubstitution(liveState, userIsHome, subInId, subOutId);
  if (!check.ok) return { ok: false, reason: check.reason, liveState };

  const { subIn, subOut } = check;
  const k = sideOf(userIsHome);
  const fitMap = liveState[k.fitness];
  fitMap.set(subIn.id, Math.min(100, subIn.fitness ?? 90));

  const newActive = liveState[k.active].map(p => (p.id === subOutId ? subIn : p));
  const newBench  = liveState[k.bench].filter(p => p.id !== subInId);
  const newStr    = teamStrength(newActive);

  const oppK  = oppSideOf(userIsHome);
  const hStr  = userIsHome ? newStr : liveState[oppK.str];
  const aStr  = userIsHome ? liveState[oppK.str] : newStr;
  const hMidShare = (hStr.midfield + aStr.midfield) > 0
    ? hStr.midfield / (hStr.midfield + aStr.midfield) : 0.5;

  const updated = {
    ...liveState,
    [k.active]: newActive,
    [k.bench]: newBench,
    [k.subsLeft]: Math.max(0, liveState[k.subsLeft] - 1),
    [k.str]: newStr,
    hMidShare,
  };

  const event = { type: 'sub', minute, teamId, outId: subOut.id, outName: subOut.name, inId: subIn.id, inName: subIn.name };
  return { ok: true, liveState: updated, event };
}
