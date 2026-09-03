/*
 * modules/playerStatus.js — P9 canonical player ownership/registration/status.
 *
 * One player ID survives academy -> first team -> loan -> return/free agency.
 * Legacy flags remain compatibility projections only; new code should ask the
 * selectors in this module instead of inferring lifecycle state itself.
 */

export const PLAYER_LIFECYCLE_VERSION = 1;
export const PLAYER_STATUSES = Object.freeze(['academy', 'first_team', 'loan', 'free_agent']);
export const MAX_REGISTRATION_SPELLS = 24;
export const MAX_LIFECYCLE_TRANSITION_KEYS = 24;

const STATUS_SET = new Set(PLAYER_STATUSES);

function asTeamId(value) {
  return value == null || value === '' ? null : String(value);
}

function clampPercent(value, fallback = 100) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : fallback;
}

function statSnapshot(player) {
  return {
    appearances:Math.max(0, Number(player?.appearances ?? 0)),
    starts:Math.max(0, Number(player?.starts ?? 0)),
    minutes:Math.max(0, Number(player?.minutes ?? 0)),
    goals:Math.max(0, Number(player?.goals ?? 0)),
    assists:Math.max(0, Number(player?.assists ?? 0)),
    cleanSheets:Math.max(0, Number(player?.cleanSheets ?? 0)),
    ratingTotal:Math.max(0, Number(player?.ratingTotal ?? 0)),
    ratingApps:Math.max(0, Number(player?.ratingApps ?? 0)),
  };
}

export function inferPlayerStatus(player) {
  if (!player) return null;
  if (STATUS_SET.has(player.playerStatus)) return player.playerStatus;
  if (player.teamId === 'free_agents') return 'free_agent';
  if (player.isYouth || player.youthTeamId) return 'academy';
  if (player.onLoan || player.loanedFrom || player.loanOriginalTeamId) return 'loan';
  return 'first_team';
}

export function normalizeLoanAgreement(agreement, player = null) {
  const status = inferPlayerStatus(player);
  if ((!agreement || typeof agreement !== 'object' || Array.isArray(agreement)) && status !== 'loan') return null;
  const source = agreement && typeof agreement === 'object' && !Array.isArray(agreement) ? agreement : {};
  const parentTeamId = asTeamId(source.parentTeamId ?? player?.contractTeamId ?? player?.owningTeamId ?? player?.loanOriginalTeamId ?? player?.loanedFrom);
  const loanTeamId = asTeamId(source.loanTeamId ?? player?.registeredTeamId ?? player?.loanedTo ?? player?.teamId);
  if (!parentTeamId || !loanTeamId) return null;
  const startSeason = source.startSeason ?? player?.loanSeason ?? null;
  const id = String(source.id ?? player?.activeAgreementId ?? `legacy-loan:${player?.id ?? 'player'}:${startSeason ?? 'unknown'}`);
  const baseline = source.baselineStats && typeof source.baselineStats === 'object'
    ? { ...source.baselineStats }
    : statSnapshot(player);
  return {
    id,
    status:source.status === 'returning' ? 'returning' : 'active',
    parentTeamId,
    loanTeamId,
    startSeason,
    startGameweek:Number.isFinite(Number(source.startGameweek)) ? Number(source.startGameweek) : null,
    dueSeason:source.dueSeason ?? startSeason,
    dueGameweek:Number.isFinite(Number(source.dueGameweek)) ? Number(source.dueGameweek) : null,
    recallAllowed:Boolean(source.recallAllowed ?? player?.loanRecallable),
    optionToBuy:Math.max(0, Number(source.optionToBuy ?? 0)),
    obligationToBuy:Math.max(0, Number(source.obligationToBuy ?? 0)),
    wageContributionPercentage:clampPercent(source.wageContributionPercentage, 100),
    expectedRole:source.expectedRole ?? player?.squadRole ?? 'rotation',
    baselineStats:baseline,
    lastReportStats:source.lastReportStats && typeof source.lastReportStats === 'object'
      ? { ...source.lastReportStats }
      : baseline,
    lastReportWeekKey:typeof source.lastReportWeekKey === 'string' ? source.lastReportWeekKey : null,
  };
}

function normalizeSpells(spells) {
  if (!Array.isArray(spells)) return [];
  return spells
    .filter(spell => spell && typeof spell === 'object' && spell.id)
    .map(spell => ({ ...spell }))
    .slice(-MAX_REGISTRATION_SPELLS);
}

function lifecycleIds(player, status, agreement) {
  if (status === 'free_agent') return { contractTeamId:null, registeredTeamId:'free_agents' };
  if (status === 'loan') {
    return {
      contractTeamId:asTeamId(player.contractTeamId ?? player.owningTeamId ?? agreement?.parentTeamId ?? player.loanOriginalTeamId ?? player.loanedFrom),
      registeredTeamId:asTeamId(player.registeredTeamId ?? agreement?.loanTeamId ?? player.loanedTo ?? player.teamId),
    };
  }
  if (status === 'academy') {
    const teamId = asTeamId(player.contractTeamId ?? player.owningTeamId ?? player.youthTeamId ?? player.teamId);
    return { contractTeamId:teamId, registeredTeamId:teamId };
  }
  const teamId = asTeamId(player.registeredTeamId ?? player.teamId ?? player.contractTeamId ?? player.owningTeamId);
  return { contractTeamId:asTeamId(player.contractTeamId ?? player.owningTeamId ?? teamId), registeredTeamId:teamId };
}

export function normalizePlayerStatus(player) {
  if (!player) return player;
  const playerStatus = inferPlayerStatus(player);
  const activeLoanAgreement = playerStatus === 'loan' ? normalizeLoanAgreement(player.activeLoanAgreement, player) : null;
  const ids = lifecycleIds(player, playerStatus, activeLoanAgreement);
  const transitionKeys = Array.isArray(player.lifecycleTransitionKeys)
    ? player.lifecycleTransitionKeys.filter(key => typeof key === 'string').slice(-MAX_LIFECYCLE_TRANSITION_KEYS)
    : [];
  const normalized = {
    ...player,
    lifecycleVersion:PLAYER_LIFECYCLE_VERSION,
    playerStatus,
    contractTeamId:ids.contractTeamId,
    registeredTeamId:ids.registeredTeamId,
    activeAgreementId:activeLoanAgreement?.id ?? null,
    activeLoanAgreement,
    registrationSpells:normalizeSpells(player.registrationSpells),
    lifecycleTransitionKeys:transitionKeys,
  };

  // Compatibility projections. These are deliberately derived from canonical
  // status so old consumers remain stable while P9 callers migrate to selectors.
  normalized.teamId = playerStatus === 'academy'
    ? ids.contractTeamId
    : ids.registeredTeamId;
  normalized.isYouth = playerStatus === 'academy';
  normalized.youthTeamId = playerStatus === 'academy' ? ids.contractTeamId : null;
  normalized.onLoan = playerStatus === 'loan';
  normalized.loanedFrom = playerStatus === 'loan' ? ids.contractTeamId : null;
  normalized.loanOriginalTeamId = playerStatus === 'loan' ? ids.contractTeamId : null;
  normalized.loanedTo = playerStatus === 'loan' ? ids.registeredTeamId : null;
  normalized.loanRecallable = playerStatus === 'loan' ? Boolean(activeLoanAgreement?.recallAllowed) : false;
  if (playerStatus === 'academy' || playerStatus === 'free_agent') normalized.inSquad = false;
  else if (normalized.inSquad == null) normalized.inSquad = true;
  if (playerStatus === 'academy' && !normalized.squadRole) normalized.squadRole = 'prospect';
  return normalized;
}

export function playerStatusNeedsNormalization(player) {
  if (!player) return false;
  const normalized = normalizePlayerStatus(player);
  return player.lifecycleVersion !== normalized.lifecycleVersion
    || player.playerStatus !== normalized.playerStatus
    || player.contractTeamId !== normalized.contractTeamId
    || player.registeredTeamId !== normalized.registeredTeamId
    || player.activeAgreementId !== normalized.activeAgreementId
    || JSON.stringify(player.activeLoanAgreement ?? null) !== JSON.stringify(normalized.activeLoanAgreement ?? null)
    || player.teamId !== normalized.teamId
    || player.isYouth !== normalized.isYouth
    || player.youthTeamId !== normalized.youthTeamId
    || player.onLoan !== normalized.onLoan
    || player.loanedFrom !== normalized.loanedFrom
    || player.loanOriginalTeamId !== normalized.loanOriginalTeamId
    || player.loanedTo !== normalized.loanedTo
    || player.loanRecallable !== normalized.loanRecallable
    || player.inSquad !== normalized.inSquad;
}

export function isAcademyPlayer(player, teamId = null) {
  const normalized = normalizePlayerStatus(player);
  if (!normalized || normalized.playerStatus !== 'academy') return false;
  return teamId == null || normalized.contractTeamId === String(teamId);
}

export function isFreeAgentPlayer(player) {
  return normalizePlayerStatus(player)?.playerStatus === 'free_agent';
}

export function isLoanPlayer(player) {
  return normalizePlayerStatus(player)?.playerStatus === 'loan';
}

export function isSeniorEligiblePlayer(player, teamId = null) {
  const normalized = normalizePlayerStatus(player);
  if (!normalized || !['first_team', 'loan'].includes(normalized.playerStatus)) return false;
  if (normalized.inSquad === false) return false;
  return teamId == null || normalized.registeredTeamId === String(teamId);
}

export function isOwnedByTeam(player, teamId) {
  const normalized = normalizePlayerStatus(player);
  return Boolean(normalized && normalized.contractTeamId === String(teamId));
}

function closeActiveSpell(spells, player, season, gameweek, reason) {
  if (!spells.length) return spells;
  const last = spells[spells.length - 1];
  if (last.endSeason != null) return spells;
  return [
    ...spells.slice(0, -1),
    {
      ...last,
      endSeason:season ?? null,
      endGameweek:Number.isFinite(Number(gameweek)) ? Number(gameweek) : null,
      endStats:statSnapshot(player),
      endAcademyEvidence:player.academyEvidence ? { ...player.academyEvidence } : null,
      endReason:reason ?? null,
    },
  ];
}

function openSpell(player, status, contractTeamId, registeredTeamId, season, gameweek, reason) {
  return {
    id:`spell:${player.id}:${status}:${season ?? 'season'}:${Number(gameweek) || 0}:${registeredTeamId ?? contractTeamId ?? 'none'}`,
    status,
    contractTeamId,
    registeredTeamId,
    startSeason:season ?? null,
    startGameweek:Number.isFinite(Number(gameweek)) ? Number(gameweek) : null,
    startStats:statSnapshot(player),
    startAcademyEvidence:player.academyEvidence ? { ...player.academyEvidence } : null,
    reason:reason ?? null,
    endSeason:null,
    endGameweek:null,
  };
}

/**
 * Pure idempotent lifecycle transition. The returned row always keeps the same
 * player ID; callers persist that row rather than deleting/copying the player.
 */
export function transitionPlayerStatus(playerInput, transition = {}) {
  const player = normalizePlayerStatus(playerInput);
  if (!player) return player;
  const idempotencyKey = transition.idempotencyKey ? String(transition.idempotencyKey) : null;
  if (idempotencyKey && player.lifecycleTransitionKeys.includes(idempotencyKey)) return player;
  const targetStatus = STATUS_SET.has(transition.status) ? transition.status : player.playerStatus;
  const season = transition.season ?? null;
  const gameweek = transition.gameweek ?? null;
  const loanAgreement = targetStatus === 'loan'
    ? normalizeLoanAgreement(transition.activeLoanAgreement ?? player.activeLoanAgreement, {
        ...player,
        playerStatus:'loan',
        contractTeamId:transition.contractTeamId ?? player.contractTeamId,
        registeredTeamId:transition.registeredTeamId ?? player.registeredTeamId,
        teamId:transition.registeredTeamId ?? player.registeredTeamId,
      })
    : null;
  const contractTeamId = targetStatus === 'free_agent'
    ? null
    : asTeamId(transition.contractTeamId ?? loanAgreement?.parentTeamId ?? player.contractTeamId);
  const registeredTeamId = targetStatus === 'free_agent'
    ? 'free_agents'
    : asTeamId(transition.registeredTeamId ?? loanAgreement?.loanTeamId ?? (targetStatus === 'academy' ? contractTeamId : player.registeredTeamId ?? player.teamId));

  let spells = closeActiveSpell(normalizeSpells(player.registrationSpells), player, season, gameweek, transition.reason);
  const prior = spells[spells.length - 1];
  const materiallyChanged = targetStatus !== player.playerStatus
    || contractTeamId !== player.contractTeamId
    || registeredTeamId !== player.registeredTeamId
    || (loanAgreement?.id ?? null) !== player.activeAgreementId;
  if (materiallyChanged || !prior) {
    spells = [...spells, openSpell(player, targetStatus, contractTeamId, registeredTeamId, season, gameweek, transition.reason)].slice(-MAX_REGISTRATION_SPELLS);
  }

  return normalizePlayerStatus({
    ...player,
    playerStatus:targetStatus,
    contractTeamId,
    registeredTeamId,
    activeLoanAgreement:loanAgreement,
    activeAgreementId:loanAgreement?.id ?? null,
    registrationSpells:spells,
    lifecycleTransitionKeys:idempotencyKey
      ? [...player.lifecycleTransitionKeys, idempotencyKey].slice(-MAX_LIFECYCLE_TRANSITION_KEYS)
      : player.lifecycleTransitionKeys,
    ...(transition.patch ?? {}),
  });
}

export function ensureOpenRegistrationSpell(playerInput, { season = null, gameweek = null } = {}) {
  const player = normalizePlayerStatus(playerInput);
  if (!player || player.registrationSpells.some(spell => spell.endSeason == null)) return player;
  return {
    ...player,
    registrationSpells:[
      ...player.registrationSpells,
      openSpell(player, player.playerStatus, player.contractTeamId, player.registeredTeamId, season, gameweek, 'migration'),
    ].slice(-MAX_REGISTRATION_SPELLS),
  };
}
