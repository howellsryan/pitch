/*
 * modules/playerModel.js — canonical P3 player-model contract and selectors.
 *
 * This module is deliberately pure and DOM/DB-free. Durable football quality
 * remains the existing attack/midfield/defence/goalkeeping attributes; P3
 * derives short-term effective level from that baseline rather than storing a
 * competing overall rating.
 */

export const PLAYER_MODEL_VERSION = 2;
export const DEFAULT_INDIVIDUAL_MORALE = 50;
export const DEFAULT_SHARPNESS = 50;
export const MAX_PLAYER_TRAITS = 8;

export const EFFECTIVE_LEVEL_LIMITS = Object.freeze({
  positionFitPenalty:8,
  formSwing:3,
  moraleSwing:2,
  sharpnessSwing:3,
  fitnessPenalty:6,
  rehabilitationPenalty:5,
  maxUplift:6,
  maxDrop:15,
});

export const ATTACK_POSITIONS = Object.freeze(['ST', 'CF', 'RW', 'LW', 'CAM']);
export const MIDFIELD_POSITIONS = Object.freeze(['CM', 'CDM', 'CAM', 'RM', 'LM']);
export const DEFENCE_POSITIONS = Object.freeze(['CB', 'RB', 'LB']);

const ATTACK_SET = new Set(ATTACK_POSITIONS);
const MIDFIELD_SET = new Set(MIDFIELD_POSITIONS);
const DEFENCE_SET = new Set(DEFENCE_POSITIONS);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampState(value, fallback) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clamp(number, 0, 100);
}

function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function settledWeekKey(value) {
  return typeof value === 'string' && value ? value : null;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function centeredContribution(value, swing, fallback = 50) {
  const normalized = clampState(value, fallback);
  return round2(((normalized - 50) / 50) * swing);
}

function penaltyFromReadiness(readiness, maxPenalty, fallback = 100) {
  const normalized = clampState(readiness, fallback);
  return round2(-((100 - normalized) / 100) * maxPenalty);
}

function moveToward(value, target, step) {
  if (value < target) return Math.min(target, value + step);
  if (value > target) return Math.max(target, value - step);
  return value;
}

function sameArray(left, right) {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function sameObject(left, right) {
  if (!left || typeof left !== 'object' || Array.isArray(left)) return false;
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) return false;
  return rightEntries.every(([key, value]) => left[key] === value);
}

/**
 * Preserve the established match-engine grouping exactly. CAM intentionally
 * resolves as ATT because the historical engine checked the attacking set
 * before the midfield set. Unknown legacy positions retain the MID fallback.
 */
export function playerPositionGroup(position) {
  if (ATTACK_SET.has(position)) return 'ATT';
  if (MIDFIELD_SET.has(position)) return 'MID';
  if (DEFENCE_SET.has(position)) return 'DEF';
  if (position === 'GK') return 'GK';
  return 'MID';
}

export function baselineAttribute(position) {
  const group = playerPositionGroup(position);
  if (group === 'ATT') return 'attack';
  if (group === 'MID') return 'midfield';
  if (group === 'DEF') return 'defence';
  return 'goalkeeping';
}

/** Durable football level for a position, with no form/fitness/morale effects. */
export function baselineLevel(player, position = player?.position) {
  if (!player) return undefined;
  return player[baselineAttribute(position)];
}

export function normalizePositionSuitability(positionSuitability, primaryPosition) {
  const normalized = {};
  if (positionSuitability && typeof positionSuitability === 'object' && !Array.isArray(positionSuitability)) {
    for (const [position, rawSuitability] of Object.entries(positionSuitability)) {
      if (!position) continue;
      const suitability = Number(rawSuitability);
      if (!Number.isFinite(suitability)) continue;
      normalized[position] = clamp(suitability, 0, 1);
    }
  }
  if (primaryPosition) normalized[primaryPosition] = 1;
  return normalized;
}

export function normalizePlayerTraits(traits) {
  if (!Array.isArray(traits)) return [];
  const normalized = [];
  const seen = new Set();
  for (const value of traits) {
    if (typeof value !== 'string') continue;
    const trait = value.trim();
    if (!trait || seen.has(trait)) continue;
    normalized.push(trait);
    seen.add(trait);
    if (normalized.length >= MAX_PLAYER_TRAITS) break;
  }
  return normalized;
}

/**
 * Additive P3 row normaliser. It owns only P3's player-state fields and spreads
 * every legacy/career field through unchanged. The settlement snapshots are
 * initialised from the current cumulative stats, so upgrading an old career
 * never mistakes the whole season for one week's participation.
 */
export function normalizePlayerModel(player) {
  if (!player) return player;
  return {
    ...player,
    positionSuitability:normalizePositionSuitability(player.positionSuitability, player.position),
    traits:normalizePlayerTraits(player.traits),
    individualMorale:clampState(player.individualMorale, DEFAULT_INDIVIDUAL_MORALE),
    sharpness:clampState(player.sharpness, DEFAULT_SHARPNESS),
    squadRole:player.squadRole ?? null,
    playingTimeAgreement:player.playingTimeAgreement ?? null,
    growthProfile:player.growthProfile ?? null,
    rehabilitation:player.rehabilitation ?? null,
    personalStateAppearances:nonNegativeNumber(player.personalStateAppearances, nonNegativeNumber(player.appearances)),
    personalStateMinutes:nonNegativeNumber(player.personalStateMinutes, nonNegativeNumber(player.minutes)),
    personalStateSettledKey:settledWeekKey(player.personalStateSettledKey),
  };
}

/** Avoid rewriting already-normalised rows if a migration is interrupted. */
export function playerModelNeedsNormalization(player) {
  if (!player) return false;
  const normalized = normalizePlayerModel(player);
  return !sameObject(player.positionSuitability, normalized.positionSuitability)
    || !sameArray(player.traits, normalized.traits)
    || player.individualMorale !== normalized.individualMorale
    || player.sharpness !== normalized.sharpness
    || player.squadRole !== normalized.squadRole
    || player.playingTimeAgreement !== normalized.playingTimeAgreement
    || player.growthProfile !== normalized.growthProfile
    || player.rehabilitation !== normalized.rehabilitation
    || player.personalStateAppearances !== normalized.personalStateAppearances
    || player.personalStateMinutes !== normalized.personalStateMinutes
    || player.personalStateSettledKey !== normalized.personalStateSettledKey;
}

/**
 * Missing secondary-position suitability stays compatibility-neutral until WP4
 * explicitly teaches the player a secondary position. Once an entry exists,
 * its cost is deterministic and bounded.
 */
export function positionSuitabilityFor(player, position = player?.position) {
  if (!player || !position || position === player.position) return 1;
  const raw = player.positionSuitability?.[position];
  if (raw == null) return 1;
  const suitability = Number(raw);
  return Number.isFinite(suitability) ? clamp(suitability, 0, 1) : 1;
}

export function rehabilitationReadiness(player) {
  if (!player) return 100;
  if (player.injured && !player.rehabilitation) return 0;
  const rehabilitation = player.rehabilitation;
  if (!rehabilitation || typeof rehabilitation !== 'object' || Array.isArray(rehabilitation)) return 100;
  const readiness = rehabilitation.matchReadiness ?? rehabilitation.readiness;
  return clampState(readiness, 100);
}

/**
 * Explainable effective-level projection. Every short-term input owns one
 * bounded contribution; the combined result is capped again so transient state
 * can never become a hidden competing overall rating.
 */
export function effectiveLevelBreakdown(player, { position = player?.position } = {}) {
  if (!player) return undefined;
  const baseline = Number(baselineLevel(player, position));
  if (!Number.isFinite(baseline)) return undefined;

  const suitability = positionSuitabilityFor(player, position);
  const contributions = {
    positionFit:round2((suitability - 1) * EFFECTIVE_LEVEL_LIMITS.positionFitPenalty),
    form:centeredContribution(player.form, EFFECTIVE_LEVEL_LIMITS.formSwing),
    morale:centeredContribution(player.individualMorale, EFFECTIVE_LEVEL_LIMITS.moraleSwing, DEFAULT_INDIVIDUAL_MORALE),
    sharpness:centeredContribution(player.sharpness, EFFECTIVE_LEVEL_LIMITS.sharpnessSwing, DEFAULT_SHARPNESS),
    fitness:penaltyFromReadiness(player.fitness, EFFECTIVE_LEVEL_LIMITS.fitnessPenalty),
    rehabilitation:penaltyFromReadiness(rehabilitationReadiness(player), EFFECTIVE_LEVEL_LIMITS.rehabilitationPenalty),
  };
  const rawModifier = Object.values(contributions).reduce((sum, value) => sum + value, 0);
  const totalModifier = round2(clamp(
    rawModifier,
    -EFFECTIVE_LEVEL_LIMITS.maxDrop,
    EFFECTIVE_LEVEL_LIMITS.maxUplift,
  ));
  const effectiveLevel = round1(clamp(baseline + totalModifier, 1, 99));

  return {
    position,
    baseline,
    suitability,
    contributions,
    totalModifier,
    effectiveLevel,
  };
}

export function currentEffectiveLevel(player, options = {}) {
  return effectiveLevelBreakdown(player, options)?.effectiveLevel;
}

/** Apply the same personal-state delta to a concrete attribute for simulation. */
export function effectiveAttribute(player, attribute) {
  if (!player) return undefined;
  const raw = Number(player[attribute]);
  if (!Number.isFinite(raw)) return undefined;
  const breakdown = effectiveLevelBreakdown(player);
  if (!breakdown) return raw;
  const nonPositionModifier = breakdown.totalModifier - breakdown.contributions.positionFit;
  return round1(clamp(raw + nonPositionModifier, 1, 99));
}

export function personalStateWeekKey(season, gameweek) {
  const gw = Number(gameweek);
  if (!Number.isInteger(gw) || gw < 0) return null;
  return `${String(season ?? 'unknown')}:${gw}`;
}

/**
 * Settle morale/sharpness once at a completed world-gameweek boundary. The
 * cumulative appearance/minute snapshots provide canonical participation
 * evidence across league and cup projections without storing another result
 * ledger. Rows already settled for this season-scoped week key are returned by
 * identity, so a gameweek number repeating next season cannot suppress work.
 */
export function settlePlayerPersonalState(player, gameweek, season = null) {
  if (!player) return player;
  const weekKey = personalStateWeekKey(season, gameweek);
  if (!weekKey) return player;
  if (player.personalStateSettledKey === weekKey) return player;

  const currentAppearances = nonNegativeNumber(player.appearances);
  const currentMinutes = nonNegativeNumber(player.minutes);
  const storedAppearances = nonNegativeNumber(player.personalStateAppearances, currentAppearances);
  const storedMinutes = nonNegativeNumber(player.personalStateMinutes, currentMinutes);
  const seasonStatsReset = currentAppearances < storedAppearances || currentMinutes < storedMinutes;
  const previousAppearances = seasonStatsReset ? 0 : storedAppearances;
  const previousMinutes = seasonStatsReset ? 0 : storedMinutes;
  const appearanceDelta = Math.max(0, currentAppearances - previousAppearances);
  const minuteDelta = Math.max(0, currentMinutes - previousMinutes);
  const participated = appearanceDelta > 0 || minuteDelta > 0;

  const currentMorale = clampState(player.individualMorale, DEFAULT_INDIVIDUAL_MORALE);
  const currentSharpness = clampState(player.sharpness, DEFAULT_SHARPNESS);
  let nextMorale = currentMorale;
  let nextSharpness = currentSharpness;

  if (participated) {
    const exposureGain = clamp(Math.round(2 + Math.min(6, minuteDelta / 30)), 2, 8);
    nextSharpness = clamp(currentSharpness + exposureGain, 0, 100);

    const rating = Number(player.lastMatchRating);
    let moraleDelta = Number.isFinite(rating)
      ? rating >= 8 ? 4
        : rating >= 7.2 ? 3
          : rating >= 6.5 ? 1
            : rating < 5.5 ? -3
              : rating < 6 ? -1
                : 0
      : 0;
    const form = clampState(player.form, 50);
    if (form >= 70) moraleDelta += 1;
    else if (form <= 35) moraleDelta -= 1;
    nextMorale = clamp(currentMorale + moraleDelta, 0, 100);
  } else {
    // Match sharpness and confidence settle back toward neutral when unused;
    // neutral players therefore require no weekly write at all.
    nextSharpness = moveToward(currentSharpness, DEFAULT_SHARPNESS, 4);
    nextMorale = moveToward(currentMorale, DEFAULT_INDIVIDUAL_MORALE, 2);
  }

  const snapshotsChanged = currentAppearances !== storedAppearances || currentMinutes !== storedMinutes;
  const stateChanged = nextMorale !== currentMorale || nextSharpness !== currentSharpness;
  if (!snapshotsChanged && !stateChanged) return player;

  return {
    ...player,
    individualMorale:nextMorale,
    sharpness:nextSharpness,
    personalStateAppearances:currentAppearances,
    personalStateMinutes:currentMinutes,
    personalStateSettledKey:weekKey,
  };
}

/** Build the bounded write-set for one settled world gameweek. */
export function buildPersonalStatePatches(players, gameweek, season = null) {
  const patches = [];
  for (const player of players ?? []) {
    const settled = settlePlayerPersonalState(player, gameweek, season);
    if (settled !== player) patches.push(settled);
  }
  return patches;
}
