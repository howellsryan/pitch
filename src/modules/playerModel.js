/*
 * modules/playerModel.js — canonical P3 player-model contract and selectors.
 *
 * This module is deliberately pure and DOM/DB-free. Durable football quality
 * remains the existing attack/midfield/defence/goalkeeping attributes; P3
 * derives short-term effective level from that baseline rather than storing a
 * competing overall rating.
 */

export const PLAYER_MODEL_VERSION = 3;
export const DEFAULT_INDIVIDUAL_MORALE = 50;
export const DEFAULT_SHARPNESS = 50;
export const MAX_PLAYER_TRAITS = 8;
export const PLAYING_TIME_WINDOW_WEEKS = 5;

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
    scope:agreement.scope === 'managed' ? 'managed' : 'managed',
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
 * every legacy/career field through unchanged. The settlement snapshots are
 * initialised from the current cumulative stats, so upgrading an old career
 * never mistakes the whole season for one week's participation.
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
  return {
    ...player,
    positionSuitability:normalizePositionSuitability(player.positionSuitability, player.position),
    traits:normalizePlayerTraits(player.traits),
    individualMorale:clampState(player.individualMorale, DEFAULT_INDIVIDUAL_MORALE),
    sharpness:clampState(player.sharpness, DEFAULT_SHARPNESS),
    squadRole,
    squadRoleSource:squadRole ? (player.squadRoleSource === 'manager' ? 'manager' : 'auto') : null,
    squadRoleTeamId,
    playingTimeAgreement,
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
    || player.squadRoleSource !== normalized.squadRoleSource
    || player.squadRoleTeamId !== normalized.squadRoleTeamId
    || !sameJson(player.playingTimeAgreement, normalized.playingTimeAgreement)
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

function effectiveNonPositionModifier(player) {
  const rawModifier = centeredContribution(player.form, EFFECTIVE_LEVEL_LIMITS.formSwing)
    + centeredContribution(player.individualMorale, EFFECTIVE_LEVEL_LIMITS.moraleSwing, DEFAULT_INDIVIDUAL_MORALE)
    + centeredContribution(player.sharpness, EFFECTIVE_LEVEL_LIMITS.sharpnessSwing, DEFAULT_SHARPNESS)
    + penaltyFromReadiness(player.fitness, EFFECTIVE_LEVEL_LIMITS.fitnessPenalty)
    + penaltyFromReadiness(rehabilitationReadiness(player), EFFECTIVE_LEVEL_LIMITS.rehabilitationPenalty);
  return round2(clamp(rawModifier, -EFFECTIVE_LEVEL_LIMITS.maxDrop, EFFECTIVE_LEVEL_LIMITS.maxUplift));
}

/**
 * Apply the same personal-state delta to a concrete simulation attribute.
 * This hot path avoids allocating a full explainability breakdown for every
 * ATT/MID/DEF lookup while remaining mathematically identical for the player's
 * primary-position state modifier.
 */
export function effectiveAttribute(player, attribute) {
  if (!player) return undefined;
  const raw = Number(player[attribute]);
  if (!Number.isFinite(raw)) return undefined;
  return round1(clamp(raw + effectiveNonPositionModifier(player), 1, 99));
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

  const participation = weeklyParticipation(player);
  const participated = participation.appearanceDelta > 0 || participation.minuteDelta > 0;
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

  // Contract/loan context only nudges initial expectations; it never changes
  // ability. A fresh loan should expect meaningful minutes, while a player
  // effectively at contract end does not receive a new Crucial promise by default.
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

/**
 * Initialise/remap team-relative roles. Existing roles are preserved while the
 * player remains at the same club; transfers invalidate the old ownership key.
 * Rolling promise agreements are only created for the managed club.
 */
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
      const role = sameClubRole
        ? original.squadRole
        : defaultSquadRole(original, rank, ranked.length, currentYear);
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

export function settlePlayingTimeAgreement(player, gameweek, season = null) {
  if (!player?.playingTimeAgreement) return player;
  const agreement = normalizePlayingTimeAgreement(
    player.playingTimeAgreement,
    player.squadRole,
    player.squadRoleTeamId,
  );
  const weekKey = personalStateWeekKey(season, gameweek);
  if (!agreement || !weekKey || agreement.lastEvaluatedKey === weekKey) return player;
  if (agreement.teamId !== player.teamId) {
    return { ...player, playingTimeAgreement:null };
  }

  const participation = weeklyParticipation(player);
  const history = [
    ...agreement.history.filter(sample => sample.key !== weekKey),
    {
      key:weekKey,
      appeared:participation.appearanceDelta > 0,
      minutes:clamp(Math.round(participation.minuteDelta), 0, 90),
    },
  ].slice(-PLAYING_TIME_WINDOW_WEEKS);
  const evaluation = promiseStatus(history, player.squadRole);
  let morale = clampState(player.individualMorale, DEFAULT_INDIVIDUAL_MORALE);
  if (evaluation.status === 'broken') morale = clamp(morale - 2, 0, 100);
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
 * Build the bounded changed-row set for one world week. Managed-club promise
 * evidence shares the same participation snapshots as morale/sharpness; AI
 * players do not accumulate weekly promise history.
 */
export function buildPersonalStatePatches(players, gameweek, season = null) {
  const managedTeamId = inferManagedTeamId(players);
  const roleReady = assignDefaultSquadRoles(players, {
    currentYear:seasonStartYear(season),
    managedTeamId,
  });
  const patches = [];
  for (let index = 0; index < roleReady.length; index++) {
    const original = players[index];
    let settled = roleReady[index];
    if (managedTeamId && settled?.teamId === managedTeamId) {
      settled = settlePlayingTimeAgreement(settled, gameweek, season);
    }
    settled = settlePlayerPersonalState(settled, gameweek, season);
    if (settled !== original) patches.push(settled);
  }
  return patches;
}
