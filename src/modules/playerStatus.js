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

const PLAYER_STATUS_SET = new Set(PLAYER_STATUSES);

function playerStatusTeamId(value) {
  return value == null || value === '' ? null : String(value);
}

function playerStatusPercent(value, fallback = 100) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : fallback;
}

function playerStatusStats(player) {
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

/**
 * Legacy writers remain in P4/season while P9 rolls through the codebase, so
 * their concrete registration flags deliberately win over an older explicit
 * status. This makes normalisation a compatibility boundary rather than a trap:
 * a direct legacy loan, return, release or transfer is absorbed on the next P9
 * pass instead of being reverted by stale lifecycle metadata.
 */
export function inferPlayerStatus(player) {
  if (!player) return null;
  if (player.teamId === 'free_agents') return 'free_agent';
  if (player.onLoan || player.loanedFrom || player.loanOriginalTeamId || player.loanedTo) return 'loan';
  if (player.isYouth || player.youthTeamId) return 'academy';
  if (player.playerStatus === 'free_agent' && player.teamId == null) return 'free_agent';
  if (player.playerStatus === 'academy' && player.inSquad === false && player.contractTeamId) return 'academy';
  if (player.playerStatus === 'loan'
    && player.activeLoanAgreement
    && player.registeredTeamId
    && player.contractTeamId
    && String(player.registeredTeamId) !== String(player.contractTeamId)) return 'loan';
  return PLAYER_STATUS_SET.has(player.playerStatus) && player.playerStatus === 'first_team'
    ? 'first_team'
    : 'first_team';
}

export function normalizeLoanAgreement(agreement, player = null) {
  const status = inferPlayerStatus(player);
  if ((!agreement || typeof agreement !== 'object' || Array.isArray(agreement)) && status !== 'loan') return null;
  const source = agreement && typeof agreement === 'object' && !Array.isArray(agreement) ? agreement : {};
  const parentTeamId = playerStatusTeamId(
    source.parentTeamId
    ?? player?.loanOriginalTeamId
    ?? player?.loanedFrom
    ?? player?.contractTeamId
    ?? player?.owningTeamId,
  );
  const loanTeamId = playerStatusTeamId(
    source.loanTeamId
    ?? player?.loanedTo
    ?? player?.teamId
    ?? player?.registeredTeamId,
  );
  if (!parentTeamId || !loanTeamId) return null;
  const startSeason = source.startSeason ?? player?.loanSeason ?? null;
  const id = String(source.id ?? player?.activeAgreementId ?? `legacy-loan:${player?.id ?? 'player'}:${startSeason ?? 'unknown'}`);
  const baseline = source.baselineStats && typeof source.baselineStats === 'object'
    ? { ...source.baselineStats }
    : playerStatusStats(player);
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
    wageContributionPercentage:playerStatusPercent(source.wageContributionPercentage, 100),
    expectedRole:source.expectedRole ?? player?.squadRole ?? 'rotation',
    baselineStats:baseline,
    lastReportStats:source.lastReportStats && typeof source.lastReportStats === 'object'
      ? { ...source.lastReportStats }
      : baseline,
    lastReportWeekKey:typeof source.lastReportWeekKey === 'string' ? source.lastReportWeekKey : null,
  };
}

function playerStatusSpells(spells) {
  if (!Array.isArray(spells)) return [];
  return spells
    .filter(spell => spell && typeof spell === 'object' && spell.id)
    .map(spell => ({ ...spell }))
    .slice(-MAX_REGISTRATION_SPELLS);
}

function playerStatusIds(player, status, agreement) {
  if (status === 'free_agent') return { contractTeamId:null, registeredTeamId:'free_agents' };
  if (status === 'loan') {
    return {
      contractTeamId:playerStatusTeamId(
        player.loanOriginalTeamId
        ?? player.loanedFrom
        ?? agreement?.parentTeamId
        ?? player.contractTeamId
        ?? player.owningTeamId,
      ),
      registeredTeamId:playerStatusTeamId(
        player.loanedTo
        ?? player.teamId
        ?? agreement?.loanTeamId
        ?? player.registeredTeamId,
      ),
    };
  }
  if (status === 'academy') {
    const teamId = playerStatusTeamId(player.youthTeamId ?? player.teamId ?? player.contractTeamId ?? player.owningTeamId);
    return { contractTeamId:teamId, registeredTeamId:teamId };
  }
  // A legacy permanent transfer writes teamId only. In first-team state that
  // current concrete registration is also ownership, so it must beat stale P9
  // fields from the seller or normalisation would silently undo the transfer.
  const teamId = playerStatusTeamId(player.teamId ?? player.registeredTeamId ?? player.contractTeamId ?? player.owningTeamId);
  return { contractTeamId:teamId, registeredTeamId:teamId };
}

export function normalizePlayerStatus(player) {
  if (!player) return player;
  const playerStatus = inferPlayerStatus(player);
  const activeLoanAgreement = playerStatus === 'loan' ? normalizeLoanAgreement(player.activeLoanAgreement, player) : null;
  const ids = playerStatusIds(player, playerStatus, activeLoanAgreement);
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
    registrationSpells:playerStatusSpells(player.registrationSpells),
    lifecycleTransitionKeys:transitionKeys,
  };

  // Compatibility projections. These are deliberately derived from canonical
  // status so old consumers remain stable while P9 callers migrate to selectors.
  normalized.teamId = playerStatus === 'academy' ? ids.contractTeamId : ids.registeredTeamId;
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

function playerStatusCloseSpell(spells, player, season, gameweek, reason) {
  if (!spells.length) return spells;
  const last = spells[spells.length - 1];
  if (last.endSeason != null) return spells;
  return [
    ...spells.slice(0, -1),
    {
      ...last,
      endSeason:season ?? null,
      endGameweek:Number.isFinite(Number(gameweek)) ? Number(gameweek) : null,
      endStats:playerStatusStats(player),
      endAcademyEvidence:player.academyEvidence ? { ...player.academyEvidence } : null,
      endReason:reason ?? null,
    },
  ];
}

function playerStatusOpenSpell(player, status, contractTeamId, registeredTeamId, season, gameweek, reason) {
  return {
    id:`spell:${player.id}:${status}:${season ?? 'season'}:${Number(gameweek) || 0}:${registeredTeamId ?? contractTeamId ?? 'none'}`,
    status,
    contractTeamId,
    registeredTeamId,
    startSeason:season ?? null,
    startGameweek:Number.isFinite(Number(gameweek)) ? Number(gameweek) : null,
    startStats:playerStatusStats(player),
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
  const targetStatus = PLAYER_STATUS_SET.has(transition.status) ? transition.status : player.playerStatus;
  const season = transition.season ?? null;
  const gameweek = transition.gameweek ?? null;
  const requestedContractTeamId = targetStatus === 'free_agent'
    ? null
    : playerStatusTeamId(transition.contractTeamId ?? player.contractTeamId);
  const requestedRegisteredTeamId = targetStatus === 'free_agent'
    ? 'free_agents'
    : playerStatusTeamId(
        transition.registeredTeamId
        ?? (targetStatus === 'academy' ? requestedContractTeamId : player.registeredTeamId ?? player.teamId),
      );
  const loanAgreement = targetStatus === 'loan'
    ? normalizeLoanAgreement(transition.activeLoanAgreement ?? player.activeLoanAgreement, {
        ...player,
        playerStatus:'loan',
        teamId:requestedRegisteredTeamId,
        contractTeamId:requestedContractTeamId,
        registeredTeamId:requestedRegisteredTeamId,
        onLoan:true,
        loanOriginalTeamId:requestedContractTeamId,
        loanedFrom:requestedContractTeamId,
        loanedTo:requestedRegisteredTeamId,
      })
    : null;
  const contractTeamId = targetStatus === 'loan'
    ? playerStatusTeamId(transition.contractTeamId ?? loanAgreement?.parentTeamId ?? player.contractTeamId)
    : requestedContractTeamId;
  const registeredTeamId = targetStatus === 'loan'
    ? playerStatusTeamId(transition.registeredTeamId ?? loanAgreement?.loanTeamId ?? player.registeredTeamId)
    : requestedRegisteredTeamId;

  let spells = playerStatusCloseSpell(playerStatusSpells(player.registrationSpells), player, season, gameweek, transition.reason);
  const prior = spells[spells.length - 1];
  const materiallyChanged = targetStatus !== player.playerStatus
    || contractTeamId !== player.contractTeamId
    || registeredTeamId !== player.registeredTeamId
    || (loanAgreement?.id ?? null) !== player.activeAgreementId;
  if (materiallyChanged || !prior) {
    spells = [
      ...spells,
      playerStatusOpenSpell(player, targetStatus, contractTeamId, registeredTeamId, season, gameweek, transition.reason),
    ].slice(-MAX_REGISTRATION_SPELLS);
  }

  const compatibility = {
    teamId:targetStatus === 'academy' ? contractTeamId : registeredTeamId,
    isYouth:targetStatus === 'academy',
    youthTeamId:targetStatus === 'academy' ? contractTeamId : null,
    onLoan:targetStatus === 'loan',
    loanedFrom:targetStatus === 'loan' ? contractTeamId : null,
    loanOriginalTeamId:targetStatus === 'loan' ? contractTeamId : null,
    loanedTo:targetStatus === 'loan' ? registeredTeamId : null,
    loanRecallable:targetStatus === 'loan' ? Boolean(loanAgreement?.recallAllowed) : false,
  };
  return normalizePlayerStatus({
    ...player,
    ...compatibility,
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
      playerStatusOpenSpell(player, player.playerStatus, player.contractTeamId, player.registeredTeamId, season, gameweek, 'migration'),
    ].slice(-MAX_REGISTRATION_SPELLS),
  };
}
