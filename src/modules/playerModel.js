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
 * competing overall rating.
 */

export const PLAYER_MODEL_VERSION = 4;
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

function sameJson(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
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
      minutes:clamp(Math.round(nonNegativeNumber(sample.minutes)), 0, 90),
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
    appearanceShare:round2(clamp(Number(agreement.appearanceShare) || 0, 0, 1)),
    minuteShare:round2(clamp(Number(agreement.minuteShare) || 0, 0, 1)),
    deliveryScore:round2(Math.max(0, Number(agreement.deliveryScore) || 0)),
    lastEvaluatedKey:settledWeekKey(agreement.lastEvaluatedKey),
  };
}

function inferredProspectRole(player) {
  const age = Number(player?.age ?? 99);
  return (player?.isYouth || player?.generated) && age <= 21 ? 'prospect' : null;
}

/**
 * Additive P3 row normaliser. It owns only P3's player-state fields and spreads
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
    potentialKnowledge:round2(clamp(Number(player.potentialKnowledge ?? .35), 0, 1)),
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
  return !sameObject(player.positionSuitability, normalized.positionSuitability)
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
    traits:round2(clamp(traitAttributeModifier(player, baselineAttribute(position)), 0, EFFECTIVE_LEVEL_LIMITS.traitSwing)),
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

function effectiveStateModifier(player) {
  const rawModifier = centeredContribution(player.form, EFFECTIVE_LEVEL_LIMITS.formSwing)
    + centeredContribution(player.individualMorale, EFFECTIVE_LEVEL_LIMITS.moraleSwing, DEFAULT_INDIVIDUAL_MORALE)
    + centeredContribution(player.sharpness, EFFECTIVE_LEVEL_LIMITS.sharpnessSwing, DEFAULT_SHARPNESS)
    + penaltyFromReadiness(player.fitness, EFFECTIVE_LEVEL_LIMITS.fitnessPenalty)
    + penaltyFromReadiness(rehabilitationReadiness(player), EFFECTIVE_LEVEL_LIMITS.rehabilitationPenalty);
  return round2(clamp(rawModifier, -EFFECTIVE_LEVEL_LIMITS.maxDrop, EFFECTIVE_LEVEL_LIMITS.maxUplift));
}

/** Hot simulation path: no explainability object allocation. */
export function effectiveAttribute(player, attribute) {
  if (!player) return undefined;
  const raw = Number(player[attribute]);
  if (!Number.isFinite(raw)) return undefined;
  const trait = clamp(traitAttributeModifier(player, attribute), 0, EFFECTIVE_LEVEL_LIMITS.traitSwing);
  return round1(clamp(raw + effectiveStateModifier(player) + trait, 1, 99));
}

export function personalStateWeekKey(season, gameweek) {
  const gw = Number(gameweek);
  if (!Number.isInteger(gw) || gw < 0) return null;
  return `${String(season ?? 'unknown')}:${gw}`;
}

function seasonStartYear(season) {
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
  if (!weekKey) return player;

  const participation = weeklyParticipation(player);
  const alreadySettled = player.personalStateSettledKey === weekKey;
  const participated = participation.appearanceDelta > 0 || participation.minuteDelta > 0;
  if (alreadySettled && !participated) return player;

  const currentMorale = clampState(player.individualMorale, DEFAULT_INDIVIDUAL_MORALE);
  const currentSharpness = clampState(player.sharpness, DEFAULT_SHARPNESS);
  let nextMorale = currentMorale;
  let nextSharpness = currentSharpness;

  if (participated) {
    const exposureGain = clamp(Math.round(2 + Math.min(6, participation.minuteDelta / 30)), 2, 8);
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
  } else if (!alreadySettled) {
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
    appearanceShare:round2(clamp(appearanceShare, 0, 1)),
    minuteShare:round2(clamp(minuteShare, 0, 1)),
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

  const participation = weeklyParticipation(player);
  const alreadyEvaluated = agreement.lastEvaluatedKey === weekKey;
  const newExposure = participation.appearanceDelta > 0 || participation.minuteDelta > 0;
  if (alreadyEvaluated && !newExposure) return player;

  const existingSample = agreement.history.find(sample => sample.key === weekKey);
  const weeklySample = {
    key:weekKey,
    appeared:Boolean(existingSample?.appeared) || participation.appearanceDelta > 0,
    minutes:clamp(Math.round((existingSample?.minutes ?? 0) + participation.minuteDelta), 0, 90),
  };
  const history = [
    ...agreement.history.filter(sample => sample.key !== weekKey),
    weeklySample,
  ].slice(-PLAYING_TIME_WINDOW_WEEKS);
  const evaluation = promiseStatus(history, player.squadRole);
  let morale = clampState(player.individualMorale, DEFAULT_INDIVIDUAL_MORALE);
  if (alreadyEvaluated) {
    morale = clamp(morale + promiseMoralePenalty(evaluation.status) - promiseMoralePenalty(agreement.status), 0, 100);
  } else if (evaluation.status === 'broken') morale = clamp(morale - 2, 0, 100);
  else if (evaluation.status === 'at_risk') morale = clamp(morale - 1, 0, 100);
  else if (evaluation.status === 'fulfilled' && ['at_risk', 'broken'].includes(agreement.status)) morale = clamp(morale + 1, 0, 100);

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
 * Build the bounded changed-row set for one world week. This is the canonical
 * P3 weekly lifecycle: promises/personal state, development/conversion, then
 * rehabilitation. League projection may run the first slice before same-week
 * cup/European records, so snapshot-based subsystems reconcile additional
 * exposure while once-only conversion/rehab keys remain idempotent.
 */
export function buildPersonalStatePatches(players, gameweek, season = null) {
  const managedTeamId = inferManagedTeamId(players);
  const roleReady = refreshChangedSquadRoles(players, seasonStartYear(season), managedTeamId);
  const patches = [];
  for (let index = 0; index < roleReady.length; index++) {
    const original = players[index];
    let settled = roleReady[index];
    if (managedTeamId && settled?.teamId === managedTeamId) {
      settled = settlePlayingTimeAgreement(settled, gameweek, season);
    }
    settled = settlePlayerPersonalState(settled, gameweek, season);
    settled = settlePlayerDevelopment(settled, gameweek, season);
    settled = settlePositionConversion(settled, gameweek, season);
    settled = settleRehabilitation(settled, gameweek, season);
    if (settled !== original) patches.push(settled);
  }
  return patches;
}