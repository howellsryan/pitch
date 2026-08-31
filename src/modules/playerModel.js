/*
 * modules/playerModel.js — canonical P3 player-model selectors.
 *
 * This module is deliberately pure and DOM/DB-free. Durable football quality
 * remains the existing attack/midfield/defence/goalkeeping attributes; P3
 * derives short-term effective level from that baseline rather than storing a
 * competing overall rating.
 */

export const PLAYER_MODEL_VERSION = 1;

export const ATTACK_POSITIONS = Object.freeze(['ST', 'CF', 'RW', 'LW', 'CAM']);
export const MIDFIELD_POSITIONS = Object.freeze(['CM', 'CDM', 'CAM', 'RM', 'LM']);
export const DEFENCE_POSITIONS = Object.freeze(['CB', 'RB', 'LB']);

const ATTACK_SET = new Set(ATTACK_POSITIONS);
const MIDFIELD_SET = new Set(MIDFIELD_POSITIONS);
const DEFENCE_SET = new Set(DEFENCE_POSITIONS);

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

/**
 * P3 compatibility seam. At kickoff effective level intentionally equals the
 * durable baseline. Later P3 slices add bounded position-fit/form/morale/
 * sharpness/recovery modifiers behind this selector without changing callers.
 */
export function currentEffectiveLevel(player, { position = player?.position } = {}) {
  return baselineLevel(player, position);
}
