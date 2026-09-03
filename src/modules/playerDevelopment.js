import { developmentPlanAttributePreference, developmentPlanProgressMultiplier } from './training.js';
import { isAcademyPlayer } from './playerStatus.js';

/*
 * modules/playerDevelopment.js — pure P3 development and potential knowledge.
 *
 * True potential remains the existing hidden potentialRating. This module owns
 * deterministic growth-profile assignment, user-facing potential estimates and
 * once-per-world-week development projections. No DB or UI imports.
 * P5 development plans only shape this existing boundary; they do not add a
 * second growth clock. P9 academy players feed this same clock from their
 * separate aggregate academyEvidence ledger; senior/loan players continue to
 * use the authoritative P1 appearance/minute ledger.
 */

export const GROWTH_PROFILE_DEFS = Object.freeze({
  early_peak:{ id:'early_peak', label:'Early peak', growthRate:1.10, peakOffset:-2, declineRate:1.18 },
  normal:{ id:'normal', label:'Normal', growthRate:1.00, peakOffset:0, declineRate:1.00 },
  late_developer:{ id:'late_developer', label:'Late developer', growthRate:.92, peakOffset:2, declineRate:.92 },
  extended_peak:{ id:'extended_peak', label:'Extended peak', growthRate:.96, peakOffset:3, declineRate:.76 },
  rapid_decline:{ id:'rapid_decline', label:'Rapid decline', growthRate:1.02, peakOffset:-1, declineRate:1.42 },
});

const PROFILE_IDS = Object.keys(GROWTH_PROFILE_DEFS);
const PROFILE_SET = new Set(PROFILE_IDS);

function devClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function devRound2(value) { return Math.round(value * 100) / 100; }

function devStableHash(value) {
  let h = 2166136261;
  for (const ch of String(value ?? '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function devDeterministicUnit(seed) {
  let t = (devStableHash(seed) + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function primaryAttribute(position) {
  if (['ST','CF','RW','LW','CAM'].includes(position)) return 'attack';
  if (['CM','CDM','RM','LM'].includes(position)) return 'midfield';
  if (['CB','RB','LB'].includes(position)) return 'defence';
  return 'goalkeeping';
}

export function durableLevel(player) {
  const value = Number(player?.[primaryAttribute(player?.position)]);
  return Number.isFinite(value) ? value : 50;
}

function defaultPeakAge(player) {
  if (Number.isFinite(Number(player?.peakAge))) return Number(player.peakAge);
  if (player?.position === 'GK' || player?.position === 'CB') return 30;
  if (['RB','LB','CDM'].includes(player?.position)) return 29;
  if (['RW','LW'].includes(player?.position)) return 27;
  return 28;
}

export function normalizeGrowthProfile(profile, player = null) {
  const id = PROFILE_SET.has(profile?.id) ? profile.id : null;
  if (!id) return null;
  const def = GROWTH_PROFILE_DEFS[id];
  return {
    id,
    peakAge:devClamp(Math.round(Number(profile.peakAge) || (defaultPeakAge(player) + def.peakOffset)), 22, 36),
  };
}

export function assignGrowthProfile(player) {
  if (!player) return null;
  const existing = normalizeGrowthProfile(player.growthProfile, player);
  if (existing) return existing;
  const roll = devDeterministicUnit(`${player.id ?? player.name}:growth-profile`);
  let id = 'normal';
  if (roll < .15) id = 'early_peak';
  else if (roll < .34) id = 'late_developer';
  else if (roll < .47) id = 'extended_peak';
  else if (roll < .57) id = 'rapid_decline';
  const def = GROWTH_PROFILE_DEFS[id];
  return { id, peakAge:devClamp(defaultPeakAge(player) + def.peakOffset, 22, 36) };
}

export function potentialEstimate(player, knowledge = player?.potentialKnowledge ?? .35) {
  const current = durableLevel(player);
  const hidden = devClamp(Number(player?.potentialRating ?? current), current, 99);
  const k = devClamp(Number(knowledge) || 0, 0, 1);
  const uncertainty = Math.max(1, Math.round(10 - k * 8));
  const biasSeed = devDeterministicUnit(`${player?.id ?? player?.name}:potential-view`) - .5;
  const centre = devClamp(Math.round(hidden + biasSeed * uncertainty * .8), current, 99);
  const min = devClamp(centre - uncertainty, current, 99);
  const max = devClamp(centre + uncertainty, min, 99);
  const confidence = k >= .8 ? 'High' : k >= .5 ? 'Medium' : 'Low';
  return { min, max, confidence, knowledge:devRound2(k) };
}

function developmentSnapshot(player) {
  if (isAcademyPlayer(player)) {
    const evidence = player?.academyEvidence ?? {};
    return {
      appearances:Math.max(0, Number(evidence.appearances ?? 0)),
      minutes:Math.max(0, Number(evidence.minutes ?? 0)),
    };
  }
  return {
    appearances:Math.max(0, Number(player?.appearances ?? 0)),
    minutes:Math.max(0, Number(player?.minutes ?? 0)),
  };
}

function developmentRating(player) {
  const value = isAcademyPlayer(player) ? player?.academyEvidence?.lastRating : player?.lastMatchRating;
  const rating = Number(value);
  return Number.isFinite(rating) ? rating : null;
}

function weeklyExposure(player) {
  const current = developmentSnapshot(player);
  const storedApps = Math.max(0, Number(player?.developmentAppearances ?? current.appearances));
  const storedMinutes = Math.max(0, Number(player?.developmentMinutes ?? current.minutes));
  const reset = current.appearances < storedApps || current.minutes < storedMinutes;
  const previousApps = reset ? 0 : storedApps;
  const previousMinutes = reset ? 0 : storedMinutes;
  return {
    current,
    appeared:current.appearances > previousApps,
    minutes:Math.max(0, current.minutes - previousMinutes),
    snapshotsChanged:current.appearances !== storedApps || current.minutes !== storedMinutes,
  };
}

function developmentThreshold(player, profile) {
  const age = Number(player?.age ?? 24);
  const current = durableLevel(player);
  const potential = Math.max(current, Number(player?.potentialRating ?? current));
  const gap = potential - current;
  const ageBase = age <= 20 ? 16 : age <= 23 ? 22 : age <= 26 ? 30 : age <= 29 ? 42 : 62;
  const gapMult = gap <= 2 ? 2.8 : gap <= 5 ? 1.8 : gap <= 10 ? 1.3 : 1;
  return Math.max(10, Math.round(ageBase * gapMult / profile.growthRate));
}

function boostAttribute(player, seed, preferredAttribute = null) {
  const next = { ...player };
  const primary = primaryAttribute(player.position);
  const roll = devDeterministicUnit(seed);
  const secondary = primary === 'attack' ? 'midfield'
    : primary === 'midfield' ? (roll < .5 ? 'attack' : 'defence')
      : primary === 'defence' ? 'midfield'
        : 'defence';
  const validPreference = ['attack','midfield','defence','goalkeeping'].includes(preferredAttribute) ? preferredAttribute : null;
  const attribute = validPreference && roll < .72 ? preferredAttribute : roll < .78 ? primary : secondary;
  next[attribute] = Math.min(99, Number(next[attribute] ?? 50) + 1);
  return next;
}

function declineAttribute(player, seed) {
  const next = { ...player };
  const primary = primaryAttribute(player.position);
  const roll = devDeterministicUnit(seed);
  const alternatives = ['attack','midfield','defence'].filter(attr => attr !== primary);
  const attribute = roll < .7 || player.position === 'GK'
    ? primary
    : alternatives[Math.floor(devDeterministicUnit(`${seed}:secondary`) * alternatives.length)] ?? primary;
  next[attribute] = Math.max(1, Number(next[attribute] ?? 50) - 1);
  return next;
}

/**
 * Pure once-per-completed-world-week development. The caller supplies the
 * player's total league/cup/European exposure for the week before settlement;
 * a matching key is therefore a strict replay no-op. P5 training changes only
 * the bounded progress/focus inputs to this same settlement. P9 academy rows
 * use academyEvidence as their exposure source without touching senior stats.
 */
export function settlePlayerDevelopment(player, gameweek, season = null) {
  if (!player) return player;
  const key = `${String(season ?? 'unknown')}:${Number(gameweek)}`;
  if (!Number.isInteger(Number(gameweek)) || Number(gameweek) < 0) return player;
  if (player.developmentSettledKey === key) return player;

  const profileState = assignGrowthProfile(player);
  const profile = GROWTH_PROFILE_DEFS[profileState.id];
  const exposure = weeklyExposure(player);
  const currentLevel = durableLevel(player);
  const potential = Math.max(currentLevel, Number(player.potentialRating ?? currentLevel));
  const age = Number(player.age ?? 24);
  const planMultiplier = developmentPlanProgressMultiplier(player, player.developmentPlan?.coachingMultiplier ?? 1);
  const preferredAttribute = developmentPlanAttributePreference(player);
  let next = { ...player, growthProfile:profileState };
  let progress = Math.max(0, Number(player.developmentProgress ?? player.growthPoints ?? 0));
  let boostedThisWeek = false;

  if (exposure.appeared && currentLevel < potential && age <= profileState.peakAge + 1) {
    const rating = developmentRating(player);
    const ratingBonus = Number.isFinite(rating) ? devClamp((rating - 6) * 1.2, -1, 3) : 0;
    const minutesScore = devClamp(exposure.minutes / 45, .35, 2);
    const morale = devClamp(Number(player.individualMorale ?? 50), 0, 100);
    const sharpness = devClamp(Number(player.sharpness ?? 50), 0, 100);
    const readinessMult = .82 + morale / 500 + sharpness / 625;
    const variance = .9 + devDeterministicUnit(`${player.id}:${key}:growth`) * .2;
    progress += Math.max(0, (minutesScore + ratingBonus) * profile.growthRate * readinessMult * variance * planMultiplier);
    const threshold = developmentThreshold(player, profile);
    if (progress >= threshold) {
      next = boostAttribute(next, `${player.id}:${key}:boost`, preferredAttribute);
      progress -= threshold;
      boostedThisWeek = true;
    }
  }

  if (age > profileState.peakAge + 1) {
    const yearsPast = age - profileState.peakAge - 1;
    const declineChance = devClamp((.045 + yearsPast * .035) * profile.declineRate, 0, .55);
    if (devDeterministicUnit(`${player.id}:${key}:decline`) < declineChance) {
      next = declineAttribute(next, `${player.id}:${key}:decline-attr`);
    }
  }

  const changedFootball = ['attack','midfield','defence','goalkeeping'].some(attr => next[attr] !== player[attr]);
  const progressChanged = devRound2(progress) !== devRound2(Number(player.developmentProgress ?? player.growthPoints ?? 0));
  const boostKeyChanged = boostedThisWeek && player.developmentBoostedKey !== key;
  if (!changedFootball && !progressChanged && !exposure.snapshotsChanged && !boostKeyChanged && player.growthProfile?.id === profileState.id) return player;

  return {
    ...next,
    developmentProgress:devRound2(progress),
    growthPoints:devRound2(progress),
    developmentAppearances:exposure.current.appearances,
    developmentMinutes:exposure.current.minutes,
    developmentSettledKey:key,
    ...(boostedThisWeek ? { developmentBoostedKey:key } : {}),
  };
}

export function buildDevelopmentPatches(players, gameweek, season = null) {
  const patches = [];
  for (const player of players ?? []) {
    const next = settlePlayerDevelopment(player, gameweek, season);
    if (next !== player) patches.push(next);
  }
  return patches;
}
