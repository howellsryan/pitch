/*
 * modules/playerModel.js — canonical P3 player-model contract and selectors.
 *
 * This module is deliberately pure and DOM/DB-free. Durable football quality
 * remains the existing attack/midfield/defence/goalkeeping attributes; P3
 * derives short-term effective level from that baseline rather than storing a
 * competing overall rating.
 */

export const PLAYER_MODEL_VERSION = 1;
export const DEFAULT_INDIVIDUAL_MORALE = 50;
export const DEFAULT_SHARPNESS = 50;
export const MAX_PLAYER_TRAITS = 8;

export const ATTACK_POSITIONS = Object.freeze(['ST', 'CF', 'RW', 'LW', 'CAM']);
export const MIDFIELD_POSITIONS = Object.freeze(['CM', 'CDM', 'CAM', 'RM', 'LM']);
export const DEFENCE_POSITIONS = Object.freeze(['CB', 'RB', 'LB']);

const ATTACK_SET = new Set(ATTACK_POSITIONS);
const MIDFIELD_SET = new Set(MIDFIELD_POSITIONS);
const DEFENCE_SET = new Set(DEFENCE_POSITIONS);

function clampState(value, fallback) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, number));
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
      normalized[position] = Math.max(0, Math.min(1, suitability));
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
 * Additive P3 row normaliser. It owns only P3's new player-state fields and
 * spreads every legacy/career field through unchanged. Later work packages can
 * bump PLAYER_MODEL_VERSION and extend this function without adding a second
 * migration mechanism.
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
    || player.rehabilitation !== normalized.rehabilitation;
}

/**
 * P3 compatibility seam. At kickoff effective level intentionally equals the
 * durable baseline. Later P3 slices add bounded position-fit/form/morale/
 * sharpness/recovery modifiers behind this selector without changing callers.
 */
export function currentEffectiveLevel(player, { position = player?.position } = {}) {
  return baselineLevel(player, position);
}
