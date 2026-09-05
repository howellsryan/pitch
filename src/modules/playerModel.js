import {
  assignDefaultTraits,
  normalizeConfiguredTraits,
  settlePositionConversion,
  slotSuitability,
  traitAttributeModifier,
} from './playerPathways.js';
import { assignGrowthProfile, settlePlayerDevelopment } from './playerDevelopment.js';
import { settleRehabilitation } from './playerRehabilitation.js';

/*
 * modules/playerModel.js — canonical P3 player-model contract and selectors.
 *
 * This module is deliberately pure and DOM/DB-free. Durable football quality
 * remains the existing attack/midfield/defence/goalkeeping attributes; P3
 * derives short-term effective level from that baseline rather than storing a
 * competing overall rating. T1 adds a versioned six-attribute execution
 * profile while retaining the four headline ratings as compatibility fields.
 */

export const PLAYER_MODEL_VERSION = 5;
export const ATTRIBUTE_PROFILE_VERSION = 1;
export const DETAILED_ATTRIBUTE_KEYS = Object.freeze([
  'pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical',
]);
export const DEFAULT_INDIVIDUAL_MORALE = 50;
export const DEFAULT_SHARPNESS = 50;
export const MAX_PLAYER_TRAITS = 3;
export const PLAYING_TIME_WINDOW_WEEKS = 5;

export const EFFECTIVE_LEVEL_LIMITS = Object.freeze({
  positionFitPenalty:8,
  formSwing:3,
  moraleSwing:2,
  sharpnessSwing:3,
  fitnessPenalty:6,
  rehabilitationPenalty:5,
  traitSwing:2.5,
  maxUplift:6,
  maxDrop:15,
});

export const SQUAD_ROLE_DEFS = Object.freeze({
  crucial:{ id:'crucial', label:'Crucial', appearanceShare:.80, minuteShare:.68 },
  important:{ id:'important', label:'Important', appearanceShare:.65, minuteShare:.54 },
  rotation:{ id:'rotation', label:'Rotation', appearanceShare:.45, minuteShare:.34 },
  squad:{ id:'squad', label:'Squad', appearanceShare:.25, minuteShare:.18 },
  prospect:{ id:'prospect', label:'Prospect', appearanceShare:.15, minuteShare:.10 },
});

export const ATTACK_POSITIONS = Object.freeze(['ST', 'CF', 'RW', 'LW', 'CAM']);
export const MIDFIELD_POSITIONS = Object.freeze(['CM', 'CDM', 'CAM', 'RM', 'LM']);
export const DEFENCE_POSITIONS = Object.freeze(['CB', 'RB', 'LB']);

const ATTACK_SET = new Set(ATTACK_POSITIONS);
const MIDFIELD_SET = new Set(MIDFIELD_POSITIONS);
const DEFENCE_SET = new Set(DEFENCE_POSITIONS);
const SQUAD_ROLE_IDS = new Set(Object.keys(SQUAD_ROLE_DEFS));
const POSITION_GROUP_BY_POSITION = Object.freeze({
  ST:'ATT', CF:'ATT', RW:'ATT', LW:'ATT', CAM:'ATT',
  CM:'MID', CDM:'MID', RM:'MID', LM:'MID',
  CB:'DEF', RB:'DEF', LB:'DEF', GK:'GK',
});
const BASELINE_ATTRIBUTE_BY_POSITION = Object.freeze({
  ST:'attack', CF:'attack', RW:'attack', LW:'attack', CAM:'attack',
  CM:'midfield', CDM:'midfield', RM:'midfield', LM:'midfield',
  CB:'defence', RB:'defence', LB:'defence', GK:'goalkeeping',
});

const DETAILED_ATTRIBUTE_SET = new Set(DETAILED_ATTRIBUTE_KEYS);
const HEADLINE_ATTRIBUTE_KEYS = Object.freeze(['attack', 'midfield', 'defence', 'goalkeeping']);
const DETAILED_BY_HEADLINE = Object.freeze({
  attack:Object.freeze(['shooting', 'dribbling', 'pace', 'physical']),
  midfield:Object.freeze(['passing', 'dribbling', 'pace', 'physical']),
  defence:Object.freeze(['defending', 'physical', 'pace']),
  goalkeeping:Object.freeze([]),
});

// Effective level is queried frequently by match and market consumers. Keep a
// per-object/per-position memo guarded by every mutable input. Object ownership
// matters: world projection creates same-id copies at different lifecycle
// states, and sharing one cache entry between those copies causes invalidation
// thrash rather than a useful hit.
const EFFECTIVE_LEVEL_CACHE = new WeakMap();
const EMPTY_TRAITS = Object.freeze([]);

function playerModelClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampState(value, fallback) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return playerModelClamp(number, 0, 100);
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

function sameJson(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function playerModelStableHash(value) {
  let hash = 2166136261;
  for (const char of String(value ?? '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicDetailedJitter(player, attribute) {
  const hash = playerModelStableHash(`${player?.id ?? player?.name ?? 'player'}:${attribute}:t1`);
  return (hash % 5) - 2;
}

function finiteAttributeNumber(rawValue) {
  if (rawValue == null || rawValue === '') return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function finiteHeadline(player, attribute, fallback = 50) {
  const value = finiteAttributeNumber(player?.[attribute]);
  return value == null ? fallback : playerModelClamp(value, 1, 99);
}

function legacyDetailedBase(player, attribute) {
  const attack = finiteHeadline(player, 'attack');
  const midfield = finiteHeadline(player, 'midfield');
  const defence = finiteHeadline(player, 'defence');
  const goalkeeping = finiteHeadline(player, 'goalkeeping', 10);
  const position = String(player?.position ?? '').toUpperCase();

  if (position === 'GK') {
    const outfieldBase = playerModelClamp(Math.round((attack + midfield + defence) / 3), 10, 55);
    if (attribute === 'physical') return playerModelClamp(Math.max(outfieldBase, Math.round(goalkeeping * .62)), 10, 70);
    if (attribute === 'passing') return playerModelClamp(Math.max(midfield, Math.round(goalkeeping * .55)), 10, 65);
    return outfieldBase;
  }

  if (attribute === 'shooting') {
    if (['ST', 'CF'].includes(position)) return attack + 2;
    if (['RW', 'LW', 'CAM'].includes(position)) return attack + 1;
    if (['CB', 'RB', 'LB'].includes(position)) return attack - 3;
    return attack;
  }
  if (attribute === 'passing') {
    if (['CM', 'CDM', 'CAM', 'RM', 'LM'].includes(position)) return midfield + 2;
    if (['RW', 'LW', 'RB', 'LB'].includes(position)) return midfield + 1;
    return midfield;
  }
  if (attribute === 'dribbling') {
    if (['RW', 'LW', 'CAM'].includes(position)) return Math.max(attack, midfield) + 2;
    if (['ST', 'CF'].includes(position)) return Math.round((attack * 2 + midfield) / 3);
    if (['CB'].includes(position)) return midfield - 4;
    return midfield;
  }
  if (attribute === 'defending') {
    if (['CB', 'RB', 'LB', 'CDM'].includes(position)) return defence + 2;
    if (['ST', 'CF', 'RW', 'LW'].includes(position)) return defence - 2;
    return defence;
  }
  if (attribute === 'physical') {
    if (['CB', 'ST', 'CF', 'CDM'].includes(position)) return Math.max(defence, Math.round((attack + midfield) / 2)) + 1;
    return Math.round((attack + midfield + defence) / 3) + 1;
  }
  if (attribute === 'pace') {
    if (['RW', 'LW', 'RB', 'LB'].includes(position)) return Math.max(attack, midfield, defence) + 3;
    if (['ST', 'CF'].includes(position)) return attack + 1;
    if (position === 'CB') return Math.round((defence + midfield) / 2) - 1;
    return Math.round((attack + midfield) / 2);
  }
  return 50;
}

function profileSourceValue(profile, player, attribute) {
  const nested = finiteAttributeNumber(profile?.[attribute]);
  if (nested != null) return nested;
  return finiteAttributeNumber(player?.[attribute]);
}

export function normalizeAttributeProfile(profile, player = null) {
  const normalized = { version:ATTRIBUTE_PROFILE_VERSION };
  for (const attribute of DETAILED_ATTRIBUTE_KEYS) {
    const explicit = profileSourceValue(profile, player, attribute);
    const fallback = legacyDetailedBase(player, attribute) + deterministicDetailedJitter(player, attribute);
    normalized[attribute] = Math.round(playerModelClamp(explicit ?? fallback, 1, 99));
  }
  return normalized;
}

export function attributeProfileFromSeed(player, seedPlayer = null) {
  if (!player) return normalizeAttributeProfile(null, null);
  const existingComplete = player?.attributeProfile?.version === ATTRIBUTE_PROFILE_VERSION
    && DETAILED_ATTRIBUTE_KEYS.every(attribute => finiteAttributeNumber(player.attributeProfile?.[attribute]) != null);
  if (existingComplete) return normalizeAttributeProfile(player.attributeProfile, player);
  if (!seedPlayer) return normalizeAttributeProfile(player.attributeProfile, player);

  const seedProfile = normalizeAttributeProfile(seedPlayer.attributeProfile, seedPlayer);
  const savedBaseline = Number(baselineLevel(player));
  const seedBaseline = Number(baselineLevel(seedPlayer));
  const delta = Number.isFinite(savedBaseline) && Number.isFinite(seedBaseline)
    ? savedBaseline - seedBaseline
    : 0;
  const rescaled = { version:ATTRIBUTE_PROFILE_VERSION };
  for (const attribute of DETAILED_ATTRIBUTE_KEYS) {
    rescaled[attribute] = Math.round(playerModelClamp(seedProfile[attribute] + delta, 1, 99));
  }
  return rescaled;
}

export function detailedAttribute(player, attribute) {
  if (!player || !DETAILED_ATTRIBUTE_SET.has(attribute)) return undefined;
  const value = finiteAttributeNumber(player.attributeProfile?.[attribute]);
  if (value != null) return playerModelClamp(value, 1, 99);
  return normalizeAttributeProfile(player.attributeProfile, player)[attribute];
}

function roleDetailedPreferences(position) {
  const normalized = String(position ?? '').toUpperCase();
  if (['ST', 'CF'].includes(normalized)) return ['shooting', 'shooting', 'physical', 'pace'];
  if (['RW', 'LW', 'CAM'].includes(normalized)) return ['dribbling', 'dribbling', 'pace', 'passing', 'shooting'];
  if (['CM', 'RM', 'LM'].includes(normalized)) return ['passing', 'passing', 'dribbling', 'physical'];
  if (normalized === 'CDM') return ['defending', 'passing', 'physical', 'pace'];
  if (['CB', 'RB', 'LB'].includes(normalized)) return ['defending', 'defending', 'physical', 'pace'];
  return [];
}

function preferredDetailedAttributes(player, headline) {
  const plan = player?.developmentPlan?.id;
  if (plan === 'finishing') return ['shooting', 'shooting', 'shooting', 'dribbling', 'physical'];
  if (plan === 'creation') return ['passing', 'passing', 'dribbling'];
  if (plan === 'defending') return ['defending', 'defending', 'physical', 'pace'];
  if (plan === 'physical') return ['pace', 'physical'];
  if (plan === 'role') return roleDetailedPreferences(player?.position);
  if (plan === 'position_conversion') {
    return roleDetailedPreferences(player?.developmentPlan?.targetPosition ?? player?.positionConversion?.targetPosition);
  }
  return [];
}

function chooseDetailedDevelopmentAttribute(player, headline, seed) {
  const allowed = DETAILED_BY_HEADLINE[headline] ?? [];
  const candidates = preferredDetailedAttributes(player, headline)
    .filter(attribute => allowed.includes(attribute));
  if (candidates.length) {
    return candidates[playerModelStableHash(`${player?.id ?? player?.name}:${seed}:${headline}:plan`) % candidates.length];
  }
  if (!allowed.length) return null;
  // Balanced development catches up a relevant weakness before adding more
  // specialisation. Hash only breaks ties so retries remain deterministic.
  const profile = normalizeAttributeProfile(player?.attributeProfile, player);
  return [...allowed].sort((left, right) =>
    profile[left] - profile[right]
      || playerModelStableHash(`${player?.id}:${seed}:${left}`) - playerModelStableHash(`${player?.id}:${seed}:${right}`)
  )[0];
}

function chooseDetailedDeclineAttribute(player, headline, seed) {
  const allowed = DETAILED_BY_HEADLINE[headline] ?? [];
  if (!allowed.length) return null;
  const age = Number(player?.age ?? 28);
  const athleticBias = age >= 29 ? 3 : age >= 27 ? 2 : 1;
  const weighted = [];
  for (const attribute of allowed) {
    const repeats = ['pace', 'physical'].includes(attribute) ? athleticBias : 1;
    for (let index = 0; index < repeats; index++) weighted.push(attribute);
  }
  return weighted[playerModelStableHash(`${player?.id ?? player?.name}:${seed}:${headline}:decline`) % weighted.length];
}

/**
 * T1 keeps the existing four headline development/decline behaviour exactly,
 * then mirrors any durable change into the detailed profile. This lets training
 * and age curves start shaping future action attributes without changing the
 * current match engine before T2/T3.
 */
export function syncDetailedProfileAfterHeadlineChange(before, after, seed = 'development') {
  if (!before || !after || before === after) return after;
  const profile = normalizeAttributeProfile(after.attributeProfile ?? before.attributeProfile, before);
  let changed = false;
  for (const headline of HEADLINE_ATTRIBUTE_KEYS) {
    const beforeValue = Number(before[headline]);
    const afterValue = Number(after[headline]);
    if (!Number.isFinite(beforeValue) || !Number.isFinite(afterValue) || beforeValue === afterValue) continue;
    // Goalkeepers retain the existing single goalkeeping rating in T1. Do not
    // invent detailed shot-stopping/handling attributes from a headline delta.
    if (headline === 'goalkeeping') continue;
    const delta = afterValue - beforeValue;
    const detailed = delta < 0
      ? chooseDetailedDeclineAttribute(after, headline, seed)
      : chooseDetailedDevelopmentAttribute(after, headline, seed);
    if (!detailed) continue;
    profile[detailed] = Math.round(playerModelClamp(profile[detailed] + delta, 1, 99));
    changed = true;
  }
  return changed ? { ...after, attributeProfile:profile } : after;
}

/**
 * Preserve the established match-engine grouping exactly. CAM intentionally
 * resolves as ATT because the historical engine checked the attacking set
 * before the midfield set. Unknown legacy positions retain the MID fallback.
 */
export function playerPositionGroup(position) {
  return POSITION_GROUP_BY_POSITION[position] ?? 'MID';
}

export function baselineAttribute(position) {
  return BASELINE_ATTRIBUTE_BY_POSITION[position] ?? 'midfield';
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
      normalized[position] = playerModelClamp(suitability, 0, 1);
    }
  }
  if (primaryPosition) normalized[primaryPosition] = 1;
  return normalized;
}

export function normalizePlayerTraits(traits, player = null) {
  const normalized = normalizeConfiguredTraits(traits);
  if (normalized.length || !player) return normalized.slice(0, MAX_PLAYER_TRAITS);
  return assignDefaultTraits(player).slice(0, MAX_PLAYER_TRAITS);
}

export function normalizeSquadRole(role) {
  return SQUAD_ROLE_IDS.has(role) ? role : null;
}

function normalizePromiseHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(sample => sample && typeof sample === 'object' && typeof sample.key === 'string')
    .map(sample => ({
      key:sample.key,
      appeared:Boolean(sample.appeared),
      minutes:playerModelClamp(Math.round(nonNegativeNumber(sample.minutes)), 0, 90),
    }))
    .slice(-PLAYING_TIME_WINDOW_WEEKS);
}

export function createPlayingTimeAgreement(role, teamId) {
  const normalizedRole = normalizeSquadRole(role);
  if (!normalizedRole || !teamId || teamId === 'free_agents') return null;
  return {
    version:1,
    scope:'managed',
    teamId,
    role:normalizedRole,
    status:'settling',
    history:[],
    appearanceShare:0,
    minuteShare:0,
    deliveryScore:1,
    lastEvaluatedKey:null,
  };
}

export function normalizePlayingTimeAgreement(agreement, role, teamId) {
  const normalizedRole = normalizeSquadRole(role);
  if (!agreement || typeof agreement !== 'object' || Array.isArray(agreement)) return null;
  if (!normalizedRole || !teamId || teamId === 'free_agents') return null;
  const history = normalizePromiseHistory(agreement.history);
  const status = ['settling', 'fulfilled', 'at_risk', 'broken'].includes(agreement.status)
    ? agreement.status
    : 'settling';
  return {
    version:1,
    scope:'managed',
    teamId,
    role:normalizedRole,
    status,
    history,
    appearanceShare:round2(playerModelClamp(Number(agreement.appearanceShare) || 0, 0, 1)),
    minuteShare:round2(playerModelClamp(Number(agreement.minuteShare) || 0, 0, 1)),
    deliveryScore:round2(Math.max(0, Number(agreement.deliveryScore) || 0)),
    lastEvaluatedKey:settledWeekKey(agreement.lastEvaluatedKey),
  };
}

function inferredProspectRole(player) {
  const age = Number(player?.age ?? 99);
  return (player?.isYouth || player?.generated) && age <= 21 ? 'prospect' : null;
}

/**
 * Additive P3 row normaliser. It owns only P3/T1 player-state fields and spreads
 * every legacy/career field through unchanged. Settlement snapshots initialise
 * from cumulative stats so upgrading an old career never treats the season so
 * far as one week's activity.
 */
export function normalizePlayerModel(player) {
  if (!player) return player;
  const squadRole = normalizeSquadRole(player.squadRole) ?? inferredProspectRole(player);
  const squadRoleTeamId = squadRole
    ? (player.squadRoleTeamId ?? player.teamId ?? player.youthTeamId ?? null)
    : null;
  const playingTimeAgreement = normalizePlayingTimeAgreement(
    player.playingTimeAgreement,
    squadRole,
    squadRoleTeamId,
  );
  const developmentAppearances = nonNegativeNumber(player.developmentAppearances, nonNegativeNumber(player.appearances));
  const developmentMinutes = nonNegativeNumber(player.developmentMinutes, nonNegativeNumber(player.minutes));
  return {
    ...player,
    attributeProfile:normalizeAttributeProfile(player.attributeProfile, player),
    positionSuitability:normalizePositionSuitability(player.positionSuitability, player.position),
    positionConversion:player.positionConversion ?? null,
    traits:normalizePlayerTraits(player.traits, player),
    individualMorale:clampState(player.individualMorale, DEFAULT_INDIVIDUAL_MORALE),
    sharpness:clampState(player.sharpness, DEFAULT_SHARPNESS),
    squadRole,
    squadRoleSource:squadRole ? (player.squadRoleSource === 'manager' ? 'manager' : 'auto') : null,
    squadRoleTeamId,
    playingTimeAgreement,
    growthProfile:assignGrowthProfile(player),
    potentialKnowledge:round2(playerModelClamp(Number(player.potentialKnowledge ?? .35), 0, 1)),
    developmentProgress:nonNegativeNumber(player.developmentProgress, nonNegativeNumber(player.growthPoints)),
    developmentAppearances,
    developmentMinutes,
    developmentSettledKey:settledWeekKey(player.developmentSettledKey),
    rehabilitation:player.rehabilitation ?? null,
    rehabilitationMinutes:nonNegativeNumber(player.rehabilitationMinutes, nonNegativeNumber(player.minutes)),
    personalStateAppearances:nonNegativeNumber(player.personalStateAppearances, nonNegativeNumber(player.appearances)),
    personalStateMinutes:nonNegativeNumber(player.personalStateMinutes, nonNegativeNumber(player.minutes)),
    personalStateSettledKey:settledWeekKey(player.personalStateSettledKey),
  };
}

/** Avoid rewriting already-normalised rows if a migration is interrupted. */
export function playerModelNeedsNormalization(player) {
  if (!player) return false;
  const normalized = normalizePlayerModel(player);
  return !sameJson(player.attributeProfile, normalized.attributeProfile)
    || !sameObject(player.positionSuitability, normalized.positionSuitability)
    || !sameJson(player.positionConversion, normalized.positionConversion)
    || !sameArray(player.traits, normalized.traits)
    || player.individualMorale !== normalized.individualMorale
    || player.sharpness !== normalized.sharpness
    || player.squadRole !== normalized.squadRole
    || player.squadRoleSource !== normalized.squadRoleSource
    || player.squadRoleTeamId !== normalized.squadRoleTeamId
    || !sameJson(player.playingTimeAgreement, normalized.playingTimeAgreement)
    || !sameJson(player.growthProfile, normalized.growthProfile)
    || player.potentialKnowledge !== normalized.potentialKnowledge
    || player.developmentProgress !== normalized.developmentProgress
    || player.developmentAppearances !== normalized.developmentAppearances
    || player.developmentMinutes !== normalized.developmentMinutes
    || player.developmentSettledKey !== normalized.developmentSettledKey
    || !sameJson(player.rehabilitation, normalized.rehabilitation)
    || player.rehabilitationMinutes !== normalized.rehabilitationMinutes
    || player.personalStateAppearances !== normalized.personalStateAppearances
    || player.personalStateMinutes !== normalized.personalStateMinutes
    || player.personalStateSettledKey !== normalized.personalStateSettledKey;
}

export function positionSuitabilityFor(player, position = player?.position) {
  if (!player || !position) return 0;
  return slotSuitability(player, position);
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
    traits:round2(playerModelClamp(traitAttributeModifier(player, baselineAttribute(position)), 0, EFFECTIVE_LEVEL_LIMITS.traitSwing)),
  };
  const rawModifier = Object.values(contributions).reduce((sum, value) => sum + value, 0);
  const totalModifier = round2(playerModelClamp(
    rawModifier,
    -EFFECTIVE_LEVEL_LIMITS.maxDrop,
    EFFECTIVE_LEVEL_LIMITS.maxUplift,
  ));
  const effectiveLevel = round1(playerModelClamp(baseline + totalModifier, 1, 99));

  return {
    position,
    baseline,
    suitability,
    contributions,
    totalModifier,
    effectiveLevel,
  };
}

function effectiveCacheMatches(entry, player, position, baseline) {
  if (!entry || entry.primaryPosition !== player.position || !Object.is(entry.baseline, baseline)) return false;
  if (!Object.is(entry.rawSuitability, player.positionSuitability?.[position])) return false;
  if (!Object.is(entry.form, player.form)
    || !Object.is(entry.morale, player.individualMorale)
    || !Object.is(entry.sharpness, player.sharpness)
    || !Object.is(entry.fitness, player.fitness)
    || entry.injured !== Boolean(player.injured)) return false;
  const rehabilitation = player.rehabilitation;
  const hasRehabilitation = Boolean(rehabilitation && typeof rehabilitation === 'object' && !Array.isArray(rehabilitation));
  if (entry.hasRehabilitation !== hasRehabilitation) return false;
  if (hasRehabilitation && (
    !Object.is(entry.rehabMatchReadiness, rehabilitation.matchReadiness)
    || !Object.is(entry.rehabReadiness, rehabilitation.readiness)
  )) return false;
  const traits = Array.isArray(player.traits) ? player.traits : EMPTY_TRAITS;
  return sameArray(entry.traits, traits);
}

function cacheEffectiveLevel(player, position, baseline, value) {
  let byPosition = EFFECTIVE_LEVEL_CACHE.get(player);
  if (!byPosition) {
    byPosition = new Map();
    EFFECTIVE_LEVEL_CACHE.set(player, byPosition);
  }
  const rehabilitation = player.rehabilitation;
  const hasRehabilitation = Boolean(rehabilitation && typeof rehabilitation === 'object' && !Array.isArray(rehabilitation));
  const traits = Array.isArray(player.traits) ? player.traits : EMPTY_TRAITS;
  byPosition.set(position, {
    primaryPosition:player.position,
    baseline,
    rawSuitability:player.positionSuitability?.[position],
    form:player.form,
    morale:player.individualMorale,
    sharpness:player.sharpness,
    fitness:player.fitness,
    injured:Boolean(player.injured),
    hasRehabilitation,
    rehabMatchReadiness:hasRehabilitation ? rehabilitation.matchReadiness : undefined,
    rehabReadiness:hasRehabilitation ? rehabilitation.readiness : undefined,
    traits:[...traits],
    value,
  });
  return value;
}

/** Numeric simulation selector: same bounds/formula as the explainable view, memoised by its raw inputs. */
export function currentEffectiveLevel(player, { position = player?.position } = {}) {
  if (!player) return undefined;
  const attribute = baselineAttribute(position);
  const baseline = Number(player[attribute]);
  if (!Number.isFinite(baseline)) return undefined;
  const cached = EFFECTIVE_LEVEL_CACHE.get(player)?.get(position);
  if (effectiveCacheMatches(cached, player, position, baseline)) return cached.value;

  const suitability = positionSuitabilityFor(player, position);
  const rawModifier = round2((suitability - 1) * EFFECTIVE_LEVEL_LIMITS.positionFitPenalty)
    + centeredContribution(player.form, EFFECTIVE_LEVEL_LIMITS.formSwing)
    + centeredContribution(player.individualMorale, EFFECTIVE_LEVEL_LIMITS.moraleSwing, DEFAULT_INDIVIDUAL_MORALE)
    + centeredContribution(player.sharpness, EFFECTIVE_LEVEL_LIMITS.sharpnessSwing, DEFAULT_SHARPNESS)
    + penaltyFromReadiness(player.fitness, EFFECTIVE_LEVEL_LIMITS.fitnessPenalty)
    + penaltyFromReadiness(rehabilitationReadiness(player), EFFECTIVE_LEVEL_LIMITS.rehabilitationPenalty)
    + round2(playerModelClamp(traitAttributeModifier(player, attribute), 0, EFFECTIVE_LEVEL_LIMITS.traitSwing));
  const totalModifier = round2(playerModelClamp(
    rawModifier,
    -EFFECTIVE_LEVEL_LIMITS.maxDrop,
    EFFECTIVE_LEVEL_LIMITS.maxUplift,
  ));
  const value = round1(playerModelClamp(baseline + totalModifier, 1, 99));
  return cacheEffectiveLevel(player, position, baseline, value);
}

function effectiveStateModifier(player) {
  const rawModifier = centeredContribution(player.form, EFFECTIVE_LEVEL_LIMITS.formSwing)
    + centeredContribution(player.individualMorale, EFFECTIVE_LEVEL_LIMITS.moraleSwing, DEFAULT_INDIVIDUAL_MORALE)
    + centeredContribution(player.sharpness, EFFECTIVE_LEVEL_LIMITS.sharpnessSwing, DEFAULT_SHARPNESS)
    + penaltyFromReadiness(player.fitness, EFFECTIVE_LEVEL_LIMITS.fitnessPenalty)
    + penaltyFromReadiness(rehabilitationReadiness(player), EFFECTIVE_LEVEL_LIMITS.rehabilitationPenalty);
  return round2(playerModelClamp(rawModifier, -EFFECTIVE_LEVEL_LIMITS.maxDrop, EFFECTIVE_LEVEL_LIMITS.maxUplift));
}

/** Hot simulation path: no explainability object allocation. */
export function effectiveAttribute(player, attribute) {
  if (!player) return undefined;
  const raw = Number(player[attribute]);
  if (!Number.isFinite(raw)) return undefined;
  const trait = playerModelClamp(traitAttributeModifier(player, attribute), 0, EFFECTIVE_LEVEL_LIMITS.traitSwing);
  return round1(playerModelClamp(raw + effectiveStateModifier(player) + trait, 1, 99));
}

/**
 * Detailed-action selector for T2/T3. T1 exposes it without wiring it into the
 * authoritative match engine. It inherits the same bounded transient delta as
 * the player's current effective level so form/readiness stay single-source.
 */
export function effectiveDetailedAttribute(player, attribute, { position = player?.position } = {}) {
  const raw = detailedAttribute(player, attribute);
  if (!Number.isFinite(raw)) return undefined;
  const baseline = Number(baselineLevel(player, position));
  const effective = Number(currentEffectiveLevel(player, { position }));
  const delta = Number.isFinite(baseline) && Number.isFinite(effective) ? effective - baseline : 0;
  return round1(playerModelClamp(raw + delta, 1, 99));
}

export function personalStateWeekKey(season, gameweek) {
  const gw = Number(gameweek);
  if (!Number.isInteger(gw) || gw < 0) return null;
  return `${String(season ?? 'unknown')}:${gw}`;
}

function playerModelSeasonStartYear(season) {
  const parsed = parseInt(String(season ?? '').split('/')[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function weeklyParticipation(player) {
  const currentAppearances = nonNegativeNumber(player.appearances);
  const currentMinutes = nonNegativeNumber(player.minutes);
  const storedAppearances = nonNegativeNumber(player.personalStateAppearances, currentAppearances);
  const storedMinutes = nonNegativeNumber(player.personalStateMinutes, currentMinutes);
  const seasonStatsReset = currentAppearances < storedAppearances || currentMinutes < storedMinutes;
  const previousAppearances = seasonStatsReset ? 0 : storedAppearances;
  const previousMinutes = seasonStatsReset ? 0 : storedMinutes;
  return {
    currentAppearances,
    currentMinutes,
    storedAppearances,
    storedMinutes,
    appearanceDelta:Math.max(0, currentAppearances - previousAppearances),
    minuteDelta:Math.max(0, currentMinutes - previousMinutes),
  };
}

export function settlePlayerPersonalState(player, gameweek, season = null) {
  if (!player) return player;
  const weekKey = personalStateWeekKey(season, gameweek);
  if (!weekKey || player.personalStateSettledKey === weekKey) return player;

  const participation = weeklyParticipation(player);
  const participated = participation.appearanceDelta > 0 || participation.minuteDelta > 0;
  const currentMorale = clampState(player.individualMorale, DEFAULT_INDIVIDUAL_MORALE);
  const currentSharpness = clampState(player.sharpness, DEFAULT_SHARPNESS);
  let nextMorale = currentMorale;
  let nextSharpness = currentSharpness;

  if (participated) {
    const exposureGain = playerModelClamp(Math.round(2 + Math.min(6, participation.minuteDelta / 30)), 2, 8);
    nextSharpness = playerModelClamp(currentSharpness + exposureGain, 0, 100);
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
    nextMorale = playerModelClamp(currentMorale + moraleDelta, 0, 100);
  } else {
    nextSharpness = moveToward(currentSharpness, DEFAULT_SHARPNESS, 4);
    nextMorale = moveToward(currentMorale, DEFAULT_INDIVIDUAL_MORALE, 2);
  }

  const snapshotsChanged = participation.currentAppearances !== participation.storedAppearances
    || participation.currentMinutes !== participation.storedMinutes;
  const stateChanged = nextMorale !== currentMorale || nextSharpness !== currentSharpness;
  if (!snapshotsChanged && !stateChanged) return player;

  return {
    ...player,
    individualMorale:nextMorale,
    sharpness:nextSharpness,
    personalStateAppearances:participation.currentAppearances,
    personalStateMinutes:participation.currentMinutes,
    personalStateSettledKey:weekKey,
  };
}

function defaultSquadRole(player, rank, squadSize, currentYear) {
  const age = Number(player?.age ?? 25);
  let role;
  if (age <= 21 && rank >= Math.min(8, Math.max(3, Math.floor(squadSize * .35)))) role = 'prospect';
  else if (rank < 3) role = 'crucial';
  else if (rank < 8) role = 'important';
  else if (rank < 15) role = 'rotation';
  else role = 'squad';
  if ((player?.onLoan || player?.loanedFrom) && ['squad', 'prospect'].includes(role)) role = 'rotation';
  if (Number.isFinite(currentYear) && Number(player?.contractExpiry) <= currentYear && role === 'crucial') role = 'important';
  return role;
}

export function setPlayerSquadRole(player, role, { source = 'manager', teamId = player?.teamId } = {}) {
  const normalizedRole = normalizeSquadRole(role);
  if (!player || !normalizedRole || !teamId || teamId === 'free_agents') return player;
  return {
    ...player,
    squadRole:normalizedRole,
    squadRoleSource:source === 'manager' ? 'manager' : 'auto',
    squadRoleTeamId:teamId,
    playingTimeAgreement:createPlayingTimeAgreement(normalizedRole, teamId),
  };
}

function inferManagedTeamId(players) {
  const counts = new Map();
  for (const player of players ?? []) {
    const agreement = player?.playingTimeAgreement;
    if (agreement?.scope !== 'managed' || !agreement.teamId) continue;
    counts.set(agreement.teamId, (counts.get(agreement.teamId) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a,b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] ?? null;
}

export function assignDefaultSquadRoles(players, { currentYear = null, managedTeamId = null } = {}) {
  const result = [...(players ?? [])];
  const byTeam = new Map();
  for (let index = 0; index < result.length; index++) {
    const player = result[index];
    if (!player?.teamId || player.teamId === 'free_agents') continue;
    if (!byTeam.has(player.teamId)) byTeam.set(player.teamId, []);
    byTeam.get(player.teamId).push({ player, index });
  }

  for (const [teamId, entries] of byTeam) {
    const ranked = [...entries].sort((a,b) =>
      Number(baselineLevel(b.player) ?? 0) - Number(baselineLevel(a.player) ?? 0)
      || String(a.player.id).localeCompare(String(b.player.id))
    );
    ranked.forEach((entry, rank) => {
      const original = entry.player;
      const sameClubRole = normalizeSquadRole(original.squadRole) && original.squadRoleTeamId === teamId;
      const role = sameClubRole ? original.squadRole : defaultSquadRole(original, rank, ranked.length, currentYear);
      const source = sameClubRole ? (original.squadRoleSource === 'manager' ? 'manager' : 'auto') : 'auto';
      const shouldHaveAgreement = teamId === managedTeamId;
      const currentAgreement = sameClubRole
        ? normalizePlayingTimeAgreement(original.playingTimeAgreement, role, teamId)
        : null;
      const agreement = shouldHaveAgreement
        ? (currentAgreement ?? createPlayingTimeAgreement(role, teamId))
        : null;
      if (original.squadRole === role
        && original.squadRoleSource === source
        && original.squadRoleTeamId === teamId
        && sameJson(original.playingTimeAgreement, agreement)) return;
      result[entry.index] = {
        ...original,
        squadRole:role,
        squadRoleSource:source,
        squadRoleTeamId:teamId,
        playingTimeAgreement:agreement,
      };
    });
  }

  for (let index = 0; index < result.length; index++) {
    const player = result[index];
    if (player?.teamId !== 'free_agents') continue;
    if (player.squadRole == null && player.squadRoleTeamId == null && player.playingTimeAgreement == null) continue;
    result[index] = {
      ...player,
      squadRole:null,
      squadRoleSource:null,
      squadRoleTeamId:null,
      playingTimeAgreement:null,
    };
  }
  return result;
}

function roleNeedsRefresh(player, managedTeamId) {
  if (!player) return false;
  if (player.teamId === 'free_agents') {
    return player.squadRole != null || player.squadRoleTeamId != null || player.playingTimeAgreement != null;
  }
  if (!player.teamId) return false;
  const role = normalizeSquadRole(player.squadRole);
  if (!role || player.squadRoleTeamId !== player.teamId) return true;
  if (player.teamId === managedTeamId) {
    return normalizePlayingTimeAgreement(player.playingTimeAgreement, role, player.teamId) == null;
  }
  return player.playingTimeAgreement != null;
}

/**
 * Fresh careers and P3 migration assign every club role up front. Weekly
 * settlement therefore only re-ranks clubs whose contract became stale after a
 * transfer/free-agent move instead of sorting all 186 squads every gameweek.
 */
function refreshChangedSquadRoles(players, currentYear, managedTeamId) {
  const teamIds = new Set();
  let resetFreeAgents = false;
  for (const player of players ?? []) {
    if (!roleNeedsRefresh(player, managedTeamId)) continue;
    if (player.teamId === 'free_agents') resetFreeAgents = true;
    else if (player.teamId) teamIds.add(player.teamId);
  }
  if (!teamIds.size && !resetFreeAgents) return players;

  const candidates = (players ?? []).filter(player =>
    teamIds.has(player?.teamId) || (resetFreeAgents && player?.teamId === 'free_agents')
  );
  const refreshed = assignDefaultSquadRoles(candidates, { currentYear, managedTeamId });
  const refreshedById = new Map(refreshed.map(player => [player.id, player]));
  return (players ?? []).map(player => refreshedById.get(player?.id) ?? player);
}

function promiseStatus(history, role) {
  const target = SQUAD_ROLE_DEFS[role] ?? SQUAD_ROLE_DEFS.squad;
  const weeks = history.length;
  const appearanceShare = weeks ? history.filter(sample => sample.appeared).length / weeks : 0;
  const minuteShare = weeks ? history.reduce((sum, sample) => sum + sample.minutes, 0) / (weeks * 90) : 0;
  const deliveryScore = Math.max(
    target.appearanceShare > 0 ? appearanceShare / target.appearanceShare : 1,
    target.minuteShare > 0 ? minuteShare / target.minuteShare : 1,
  );
  let status = 'settling';
  if (weeks >= 3) {
    if (deliveryScore >= .90) status = 'fulfilled';
    else if (weeks >= PLAYING_TIME_WINDOW_WEEKS && deliveryScore < .60) status = 'broken';
    else status = 'at_risk';
  }
  return {
    status,
    appearanceShare:round2(playerModelClamp(appearanceShare, 0, 1)),
    minuteShare:round2(playerModelClamp(minuteShare, 0, 1)),
    deliveryScore:round2(deliveryScore),
  };
}

function promiseMoralePenalty(status) {
  if (status === 'broken') return -2;
  if (status === 'at_risk') return -1;
  return 0;
}

export function settlePlayingTimeAgreement(player, gameweek, season = null) {
  if (!player?.playingTimeAgreement) return player;
  const agreement = normalizePlayingTimeAgreement(
    player.playingTimeAgreement,
    player.squadRole,
    player.squadRoleTeamId,
  );
  const weekKey = personalStateWeekKey(season, gameweek);
  if (!agreement || !weekKey) return player;
  if (agreement.teamId !== player.teamId) return { ...player, playingTimeAgreement:null };
  if (agreement.lastEvaluatedKey === weekKey) return player;

  const participation = weeklyParticipation(player);
  const weeklySample = {
    key:weekKey,
    appeared:participation.appearanceDelta > 0,
    minutes:playerModelClamp(Math.round(participation.minuteDelta), 0, 90),
  };
  const history = [
    ...agreement.history.filter(sample => sample.key !== weekKey),
    weeklySample,
  ].slice(-PLAYING_TIME_WINDOW_WEEKS);
  const evaluation = promiseStatus(history, player.squadRole);
  let morale = clampState(player.individualMorale, DEFAULT_INDIVIDUAL_MORALE);
  if (evaluation.status === 'broken') morale = playerModelClamp(morale - 2, 0, 100);
  else if (evaluation.status === 'at_risk') morale = playerModelClamp(morale - 1, 0, 100);
  else if (evaluation.status === 'fulfilled' && ['at_risk', 'broken'].includes(agreement.status)) morale = playerModelClamp(morale + 1, 0, 100);

  return {
    ...player,
    individualMorale:morale,
    playingTimeAgreement:{
      ...agreement,
      ...evaluation,
      history,
      lastEvaluatedKey:weekKey,
    },
  };
}

/**
 * Build the bounded changed-row set for one completed world week. This is the
 * canonical P3 weekly lifecycle: promises/personal state, development/
 * conversion, then rehabilitation. The caller must wait until all league,
 * domestic-cup and European participation for each player is known; settled
 * week keys make retries strict no-ops.
 */
export function buildPersonalStatePatches(players, gameweek, season = null) {
  const managedTeamId = inferManagedTeamId(players);
  const roleReady = refreshChangedSquadRoles(players, playerModelSeasonStartYear(season), managedTeamId);
  const patches = [];
  for (let index = 0; index < roleReady.length; index++) {
    const original = players[index];
    let settled = roleReady[index];
    if (managedTeamId && settled?.teamId === managedTeamId) {
      settled = settlePlayingTimeAgreement(settled, gameweek, season);
    }
    settled = settlePlayerPersonalState(settled, gameweek, season);
    const beforeDevelopment = settled;
    settled = settlePlayerDevelopment(settled, gameweek, season);
    settled = syncDetailedProfileAfterHeadlineChange(beforeDevelopment, settled, `${String(season ?? 'unknown')}:${gameweek}`);
    settled = settlePositionConversion(settled, gameweek, season);
    settled = settleRehabilitation(settled, gameweek, season);
    if (settled !== original) patches.push(settled);
  }
  return patches;
}
