import { assignGrowthProfile, potentialEstimate } from './playerDevelopment.js';
import { baselineLevel } from './playerModel.js';

/**
 * modules/potential.js — compatibility facade over the canonical P3 development model.
 *
 * Runtime growth/decline now settles once per completed world week in
 * playerModel.buildPersonalStatePatches(). This module retains the historical
 * public helpers used by save/season/UI callers without running a second,
 * per-match random development system.
 */

function potentialClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function potentialStableHash(value) {
  let h = 2166136261;
  for (const ch of String(value ?? '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function potentialDeterministicUnit(seed) {
  let t = (potentialStableHash(seed) + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ─── Assign initial potentials ────────────────────────────────
export function assignPotentials(players) {
  return (players ?? []).map(p => {
    const cur = _primaryRating(p);
    const age = p.age ?? 24;
    const hasBakedPot = Number(p.potentialRating) > 0;
    const isWonderkid = p.isWonderkid === true || (
      (age <= 18 && cur >= 75) ||
      (age <= 20 && cur >= 80) ||
      (age <= 22 && cur >= 85)
    );
    const seeded = { ...p, isWonderkid };
    const potentialRating = hasBakedPot ? Number(p.potentialRating) : calcPotential(seeded);
    const growthProfile = assignGrowthProfile({ ...seeded, potentialRating });
    return {
      ...seeded,
      potentialRating,
      growthPoints:Number(p.growthPoints ?? 0),
      peakAge:growthProfile?.peakAge ?? calcPeakAge(seeded),
      growthProfile,
      potentialKnowledge:potentialClamp(Number(p.potentialKnowledge ?? .35), 0, 1),
    };
  });
}

/** Deterministic fallback ceiling for generated/legacy players without one. */
export function calcPotential(p) {
  const current = _primaryRating(p);
  const age = p.age ?? 24;
  const range =
    age <= 17 ? [10, 21] :
    age <= 19 ? [8, 17] :
    age <= 21 ? [5, 13] :
    age <= 23 ? [2, 9] :
    age <= 26 ? [0, 4] :
    age <= 29 ? [0, 2] : [0, 0];
  const roll = potentialDeterministicUnit(`${p.id ?? p.name}:${age}:potential`);
  const headroom = range[0] + Math.floor(roll * (range[1] - range[0] + 1));
  return Math.min(99, Math.max(current, current + headroom));
}

export function calcPeakAge(p) {
  return assignGrowthProfile(p)?.peakAge ?? 28;
}

// Runtime growth is intentionally retired here. Existing callers can continue
// awaiting this function while the canonical once-per-world-week lifecycle owns
// all mutations and replay keys.
export async function applyDevelopment(_matchResults) {
  return 0;
}

export function growthThreshold(age, currentRating, potential) {
  const gap = potential - currentRating;
  const base = age <= 20 ? 18 : age <= 23 ? 24 : age <= 26 ? 35 : age <= 29 ? 50 : age <= 32 ? 70 : 120;
  const gapMult = gap <= 2 ? 3.0 : gap <= 5 ? 2.0 : gap <= 10 ? 1.4 : 1.0;
  return Math.round(base * gapMult);
}

/** Compatibility-only deterministic single-point boost helper. */
export function applyStatBoost(player) {
  const p = { ...player };
  const pos = p.position;
  const roll = potentialDeterministicUnit(`${p.id ?? p.name}:${p.growthPoints ?? 0}:legacy-boost`);
  if (['ST','CF'].includes(pos)) {
    if (roll < .65) p.attack = Math.min(99, Number(p.attack ?? 50) + 1);
    else if (roll < .85) p.midfield = Math.min(99, Number(p.midfield ?? 50) + 1);
    else p.defence = Math.min(99, Number(p.defence ?? 50) + 1);
  } else if (['RW','LW','CAM'].includes(pos)) {
    if (roll < .50) p.attack = Math.min(99, Number(p.attack ?? 50) + 1);
    else if (roll < .85) p.midfield = Math.min(99, Number(p.midfield ?? 50) + 1);
    else p.defence = Math.min(99, Number(p.defence ?? 50) + 1);
  } else if (['CM','CDM','RM','LM'].includes(pos)) {
    if (roll < .55) p.midfield = Math.min(99, Number(p.midfield ?? 50) + 1);
    else if (roll < .80) p.attack = Math.min(99, Number(p.attack ?? 50) + 1);
    else p.defence = Math.min(99, Number(p.defence ?? 50) + 1);
  } else if (['CB','RB','LB'].includes(pos)) {
    if (roll < .60) p.defence = Math.min(99, Number(p.defence ?? 50) + 1);
    else if (roll < .85) p.midfield = Math.min(99, Number(p.midfield ?? 50) + 1);
    else p.attack = Math.min(99, Number(p.attack ?? 50) + 1);
  } else if (pos === 'GK') {
    if (roll < .75) p.goalkeeping = Math.min(99, Number(p.goalkeeping ?? 50) + 1);
    else p.defence = Math.min(99, Number(p.defence ?? 50) + 1);
  }
  p.value = updatedValue(p);
  return p;
}

export function updatedValue(p) {
  const rating = _primaryRating(p);
  const age = p.age ?? 24;
  const ageMult = age <= 20 ? .7 : age <= 23 ? .9 : age <= 27 ? 1 : age <= 29 ? .95 : age <= 31 ? .85 : age <= 33 ? .70 : .50;
  const norm = Math.max(0, (rating - 50) / 49);
  const baseVal = Math.pow(norm, 2.2) * 220_000_000;
  return Math.max(500_000, Math.round(baseVal * ageMult));
}

export function _primaryRating(p) {
  return Number(baselineLevel(p) ?? 0);
}

export function getPotentialEstimate(player, knowledge = player?.potentialKnowledge) {
  return potentialEstimate(player, knowledge);
}

// UI/filter compatibility: stars use the centre of the observed estimate, not
// the hidden true ceiling. Better knowledge therefore improves precision rather
// than exposing potentialRating directly.
export function getPotentialStars(player) {
  const estimate = getPotentialEstimate(player);
  const observed = Math.round((estimate.min + estimate.max) / 2);
  if (observed >= 88) return 5;
  if (player.isWonderkid && observed >= 86) return 5;
  if (observed >= 82) return 4;
  if (observed >= 74) return 3;
  if (observed >= 66) return 2;
  return 1;
}

/** Shared P3 potential language used by Transfers and Academy. */
export function getPotentialLabel(player) {
  const estimate = getPotentialEstimate(player);
  return `${estimate.min}–${estimate.max} · ${estimate.confidence} confidence`;
}

export function agingValueAdjust(player) {
  const age = (player.age ?? 24) + 1;
  const pot = Number(player.potentialRating ?? _primaryRating(player));
  const cur = _primaryRating(player);
  const headroom = pot - cur;
  const potBonus = age <= 23 && headroom > 10 ? 1.15 : 1.0;
  const m = age < 20 ? 1.12 : age < 24 ? 1.06 : age < 28 ? 1.02 : age < 30 ? .97 : age < 32 ? .92 : age < 34 ? .85 : age < 36 ? .75 : .60;
  return Math.max(500_000, Math.round((Number(player.value) || 10_000_000) * m * potBonus));
}

// Decline now belongs to the seeded weekly growth profile. Retain the helper as
// an identity-compatible copy for end-of-season callers until WP7 removes the
// old adapter completely.
export function applyAgingDecline(player) {
  return { ...player };
}
