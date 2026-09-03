import {
  getAllPlayers,
  getAllTeams,
  getAllTransfers,
  getPlayer,
  getSave,
  getTeam,
  putPlayer,
  putPlayersBulk,
  putSave,
  putTeamsBulk,
} from './db.js';
import { coachingEffects } from './coaching.js';
import { scoutingCapacityBonus, trainingEfficiencyMultiplier } from './facilities.js';
import { normalizePlayerModel } from './playerModel.js';
import {
  ensureOpenRegistrationSpell,
  isAcademyPlayer,
  isLoanPlayer,
  isOwnedByTeam,
  isSeniorEligiblePlayer,
  normalizePlayerStatus,
  playerStatusNeedsNormalization,
  transitionPlayerStatus,
} from './playerStatus.js';
import {
  ACADEMY_PLAYER_CAP,
  advanceAcademyEvidence,
  advanceYouthScoutingState,
  applyLoanDevelopmentReport,
  academyPathwaysNeedsBackfill,
  academyReadiness,
  buildLoanDevelopmentReport,
  cancelYouthScoutingAssignment,
  createAcademyPathwaysState,
  createYouthScoutingAssignment,
  loanDestinationProjection,
  loanReportDue,
  normalizeAcademyPathwaysState,
} from './academyPathways.js';
import { generateYouthPlayer } from './youthAcademy.js';

/* modules/p9Runtime.js — P9 persistence/runtime facade. */

export const P9_CAREER_PATHWAYS_VERSION = 1;

function p9WeekKey(save) {
  return `${String(save?.season ?? 'unknown')}:${Number(save?.currentGameweek ?? 0)}`;
}

function p9StartYear(season) {
  const year = Number.parseInt(String(season ?? '').split('/')[0], 10);
  return Number.isFinite(year) ? year : 2025;
}

function p9SameRow(a, b) {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function p9StatSnapshot(player) {
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

function p9CanonicalAcademyPlayer(raw, teamId, save) {
  const base = normalizePlayerModel({
    ...raw,
    teamId,
    youthTeamId:teamId,
    isYouth:true,
    inSquad:false,
    onLoan:false,
    loanedFrom:null,
    loanedTo:null,
    loanOriginalTeamId:null,
    playerStatus:'academy',
    contractTeamId:teamId,
    registeredTeamId:teamId,
    activeAgreementId:null,
    activeLoanAgreement:null,
    contractExpiry:null,
    signedThisSeason:false,
    developmentAppearances:Number(raw?.academyEvidence?.appearances ?? 0),
    developmentMinutes:Number(raw?.academyEvidence?.minutes ?? 0),
  });
  return ensureOpenRegistrationSpell(normalizePlayerStatus(base), {
    season:save?.season ?? null,
    gameweek:save?.currentGameweek ?? 0,
  });
}

function p9LatestLoanHistory(player, transfers) {
  const rows = (transfers ?? [])
    .filter(move => move?.type === 'loan' && String(move.playerId) === String(player.id))
    .filter(move => !player.teamId || String(move.toTeamId) === String(player.teamId))
    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
  return rows[0] ?? null;
}

function p9EnrichLoanAgreement(playerInput, transfers, save) {
  let player = normalizePlayerStatus(playerInput);
  if (!isLoanPlayer(player)) return player;
  const history = p9LatestLoanHistory(player, transfers);
  if (!history) return ensureOpenRegistrationSpell(player, { season:save?.season, gameweek:save?.currentGameweek });
  const terms = history.terms ?? {};
  const agreement = player.activeLoanAgreement;
  const baseline = agreement?.baselineStats ?? p9StatSnapshot(player);
  const exact = {
    ...(agreement ?? {}),
    id:String(history.dealId ?? agreement?.id ?? `loan:${player.id}:${save?.season ?? 'season'}`),
    status:'active',
    parentTeamId:String(history.fromTeamId ?? player.contractTeamId),
    loanTeamId:String(history.toTeamId ?? player.registeredTeamId ?? player.teamId),
    startSeason:history.season ?? player.loanSeason ?? save?.season ?? null,
    startGameweek:agreement?.startGameweek ?? null,
    dueSeason:agreement?.dueSeason ?? history.season ?? player.loanSeason ?? save?.season ?? null,
    dueGameweek:agreement?.dueGameweek ?? null,
    recallAllowed:Boolean(terms.loan?.recall ?? player.loanRecallable),
    optionToBuy:Math.max(0, Number(terms.loan?.optionToBuy ?? 0)),
    obligationToBuy:Math.max(0, Number(terms.loan?.obligationToBuy ?? 0)),
    wageContributionPercentage:Math.max(0, Math.min(100, Number(terms.loan?.wageContributionPercentage ?? 100))),
    expectedRole:terms.contract?.squadRole ?? agreement?.expectedRole ?? player.squadRole ?? 'rotation',
    baselineStats:baseline,
    lastReportStats:agreement?.lastReportStats ?? baseline,
    lastReportWeekKey:agreement?.lastReportWeekKey ?? null,
  };
  player = transitionPlayerStatus(player, {
    status:'loan',
    contractTeamId:exact.parentTeamId,
    registeredTeamId:exact.loanTeamId,
    activeLoanAgreement:exact,
    season:save?.season,
    gameweek:save?.currentGameweek,
    reason:'loan_agreement_projection',
  });
  return ensureOpenRegistrationSpell(player, { season:save?.season, gameweek:save?.currentGameweek });
}

function p9NormalizeExistingPlayer(player, transfers, save) {
  const normalized = ensureOpenRegistrationSpell(normalizePlayerStatus(player), {
    season:save?.season,
    gameweek:save?.currentGameweek,
  });
  return isLoanPlayer(normalized) ? p9EnrichLoanAgreement(normalized, transfers, save) : normalized;
}

export function createFreshP9SaveFields() {
  return {
    careerPathwaysVersion:P9_CAREER_PATHWAYS_VERSION,
    academyPathways:createAcademyPathwaysState(),
    youthCohort:[],
  };
}

export function buildP9CareerPathwaysBackfill(save, players = [], teams = [], transfers = []) {
  if (!save) return { save, playerPatches:[], teamPatches:[] };
  const byId = new Map(players.map(player => [String(player.id), player]));
  const candidateRows = new Map();
  const userLegacy = Array.isArray(save.youthCohort) ? save.youthCohort : [];
  for (const raw of userLegacy) {
    if (!raw?.id || byId.has(String(raw.id))) continue;
    candidateRows.set(String(raw.id), p9CanonicalAcademyPlayer(raw, save.userTeamId, save));
  }
  for (const team of teams) {
    for (const raw of Array.isArray(team.youthPlayers) ? team.youthPlayers : []) {
      if (!raw?.id || byId.has(String(raw.id)) || candidateRows.has(String(raw.id))) continue;
      candidateRows.set(String(raw.id), p9CanonicalAcademyPlayer(raw, team.id, save));
    }
  }

  const playerPatches = [];
  for (const player of players) {
    const next = p9NormalizeExistingPlayer(player, transfers, save);
    if (playerStatusNeedsNormalization(player) || !p9SameRow(player, next)) playerPatches.push(next);
  }
  playerPatches.push(...candidateRows.values());

  const teamPatches = teams
    .filter(team => Array.isArray(team.youthPlayers) && team.youthPlayers.length > 0)
    .map(team => ({ ...team, youthPlayers:[] }));
  const nextSave = {
    ...save,
    careerPathwaysVersion:P9_CAREER_PATHWAYS_VERSION,
    academyPathways:academyPathwaysNeedsBackfill(save)
      ? createAcademyPathwaysState()
      : normalizeAcademyPathwaysState(save.academyPathways),
    youthCohort:[],
  };
  return { save:nextSave, playerPatches, teamPatches };
}

/**
 * Idempotent recovery migration: player rows are written before the legacy
 * arrays are cleared. A tab close can therefore leave duplicate references but
 * cannot lose a prospect; replay uses the same player ID and then retires them.
 */
export async function ensureP9CareerPathways(saveInput = null) {
  const save = saveInput ?? await getSave();
  if (!save) return save;
  const [players, teams, transfers] = await Promise.all([getAllPlayers(), getAllTeams(), getAllTransfers()]);
  const migration = buildP9CareerPathwaysBackfill(save, players, teams, transfers);
  if (migration.playerPatches.length) await putPlayersBulk(migration.playerPatches);
  if (migration.teamPatches.length) await putTeamsBulk(migration.teamPatches);
  if (!p9SameRow(save, migration.save)) await putSave(migration.save);
  return migration.save;
}

function p9ScoutingFacilityLevel(team) {
  return Math.max(1, Number(team?.facilities?.scouting?.level ?? 1));
}

function p9AssignmentProspectId(assignment) {
  return `academy_scout_${String(assignment.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function p9GenerateScoutedProspect(assignment, team, save, existingIds) {
  const wanted = {
    GK:new Set(['GK']),
    DEF:new Set(['CB','RB','LB']),
    MID:new Set(['CDM','CM','CAM','RM','LM']),
    ATT:new Set(['RW','LW','CF','ST']),
  }[assignment.positionGroup] ?? new Set(['CM']);
  let generated = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = generateYouthPlayer(
      team.id,
      team.reputation ?? 70,
      save.season,
      100 + Number(assignment.weeks ?? 0) * 10 + attempt,
      team.league ?? save.userLeague,
      false,
      team.academyInvestment ?? 0,
    );
    if (!generated) generated = row;
    if (wanted.has(row.position)) { generated = row; break; }
  }
  if (!generated) return null;
  const id = p9AssignmentProspectId(assignment);
  if (existingIds.has(id)) return null;
  const band = assignment.report?.potentialBand;
  const projectedPotential = band
    ? Math.max(Number(generated.potentialRating ?? 65), Math.round((Number(band.min) + Number(band.max)) / 2))
    : generated.potentialRating;
  return p9CanonicalAcademyPlayer({
    ...generated,
    id,
    potentialRating:Math.max(1, Math.min(99, projectedPotential)),
    academySource:{
      type:'regional_scouting',
      assignmentId:assignment.id,
      region:assignment.region,
      nation:assignment.nation,
      role:assignment.role,
      style:assignment.style,
      confidence:assignment.report?.confidence ?? null,
    },
  }, team.id, save);
}

/**
 * Runs before P3 settlement: academy evidence exists first, then the existing P3
 * development clock reads that evidence. Senior/loan participation has already
 * been projected by P1 by this boundary.
 */
export async function advanceP9PreDevelopmentWeek(saveInput = null) {
  let save = await ensureP9CareerPathways(saveInput ?? await getSave());
  if (!save) return { save, academyEvidencePatches:[], scoutingCompleted:[], prospectsAdded:[] };
  const [players, teams] = await Promise.all([getAllPlayers(), getAllTeams()]);
  const teamsById = new Map(teams.map(team => [team.id, team]));
  const playerPatches = [];
  for (const raw of players) {
    const player = normalizePlayerStatus(raw);
    if (!isAcademyPlayer(player)) continue;
    const team = teamsById.get(player.contractTeamId);
    const next = advanceAcademyEvidence(player, {
      season:save.season,
      gameweek:save.currentGameweek,
      coachingMultiplier:coachingEffects(team, player).development,
      trainingMultiplier:trainingEfficiencyMultiplier(team),
    });
    if (!p9SameRow(raw, next)) playerPatches.push(next);
  }
  if (playerPatches.length) await putPlayersBulk(playerPatches);

  const userTeam = teamsById.get(save.userTeamId);
  const scouting = advanceYouthScoutingState(save.academyPathways, {
    season:save.season,
    gameweek:save.currentGameweek,
    reputation:userTeam?.reputation ?? 65,
    academyInvestment:userTeam?.academyInvestment ?? 0,
    scoutingLevel:p9ScoutingFacilityLevel(userTeam),
  });
  let academyPathways = scouting.state;
  const academyRows = players
    .map(player => playerPatches.find(patch => String(patch.id) === String(player.id)) ?? player)
    .filter(player => isAcademyPlayer(player, save.userTeamId));
  const existingIds = new Set(players.map(player => String(player.id)));
  const prospectsAdded = [];
  const remainingCapacity = Math.max(0, ACADEMY_PLAYER_CAP - academyRows.length);
  for (const assignment of scouting.completed.slice(0, remainingCapacity)) {
    if (assignment.prospectId) continue;
    const prospect = p9GenerateScoutedProspect(assignment, userTeam, save, existingIds);
    if (!prospect) continue;
    prospectsAdded.push(prospect);
    existingIds.add(String(prospect.id));
    academyPathways = {
      ...academyPathways,
      youthScoutingAssignments:academyPathways.youthScoutingAssignments.map(item => item.id === assignment.id
        ? { ...item, prospectId:prospect.id }
        : item),
    };
  }
  if (prospectsAdded.length) await putPlayersBulk(prospectsAdded);
  if (!p9SameRow(save.academyPathways, academyPathways)) {
    save = { ...save, academyPathways };
    await putSave(save);
  }
  return { save, academyEvidencePatches:playerPatches, scoutingCompleted:scouting.completed, prospectsAdded };
}

/**
 * Runs after the P4 market tick. This catches freshly-settled loans from both AI
 * and user activity, projects their P4 agreement onto the same player row and
 * emits bounded reports from real P1 participation.
 */
export async function advanceP9PostMarketWeek(saveInput = null) {
  const save = saveInput ?? await getSave();
  if (!save) return { loanReports:[], playerPatches:[] };
  const [players, transfers] = await Promise.all([getAllPlayers(), getAllTransfers()]);
  const patches = [];
  const loanReports = [];
  for (const raw of players) {
    let player = p9NormalizeExistingPlayer(raw, transfers, save);
    if (isLoanPlayer(player)
      && (isOwnedByTeam(player, save.userTeamId) || player.registeredTeamId === save.userTeamId)
      && loanReportDue(player, { season:save.season, gameweek:save.currentGameweek })) {
      const report = buildLoanDevelopmentReport(player, { season:save.season, gameweek:save.currentGameweek });
      if (report) {
        const withReport = applyLoanDevelopmentReport(player, report);
        if (withReport !== player) {
          player = withReport;
          loanReports.push(report);
        }
      }
    }
    if (!p9SameRow(raw, player)) patches.push(player);
  }
  if (patches.length) await putPlayersBulk(patches);
  return { loanReports, playerPatches:patches };
}

export async function getManagedAcademyPlayers() {
  const save = await ensureP9CareerPathways();
  if (!save) return [];
  const players = await getAllPlayers();
  return players
    .map(normalizePlayerStatus)
    .filter(player => isAcademyPlayer(player, save.userTeamId))
    .sort((a,b) => academyReadiness(b).score - academyReadiness(a).score || String(a.name).localeCompare(String(b.name)));
}

export async function getManagedLoanPathways() {
  const save = await ensureP9CareerPathways();
  if (!save) return { outgoing:[], incoming:[] };
  const players = (await getAllPlayers()).map(normalizePlayerStatus);
  const outgoing = players.filter(player => isLoanPlayer(player) && isOwnedByTeam(player, save.userTeamId));
  const incoming = players.filter(player => isLoanPlayer(player) && player.registeredTeamId === save.userTeamId);
  return { outgoing, incoming };
}

export async function compareLoanDestinations(playerId, { limit = 8 } = {}) {
  const save = await ensureP9CareerPathways();
  const [rawPlayer, teams, players] = await Promise.all([getPlayer(playerId), getAllTeams(), getAllPlayers()]);
  const player = normalizePlayerStatus(rawPlayer);
  if (!save || !player || !isOwnedByTeam(player, save.userTeamId)) throw new Error('PLAYER_NOT_OWNED');
  const blocked = new Set([player.contractTeamId, player.registeredTeamId, 'free_agents']);
  const key = p9WeekKey(save);
  return teams
    .filter(team => !blocked.has(team.id))
    .map(team => loanDestinationProjection(player, team, players, { weekKey:key }))
    .filter(Boolean)
    .sort((a,b) => b.pathwayScore - a.pathwayScore || b.expectedMinutes - a.expectedMinutes)
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 8)));
}

export async function promoteManagedAcademyPlayer(playerId) {
  const save = await ensureP9CareerPathways();
  const [player, allPlayers] = await Promise.all([getPlayer(playerId), getAllPlayers()]);
  const normalized = normalizePlayerStatus(player);
  if (!save || !normalized || !isAcademyPlayer(normalized, save.userTeamId)) throw new Error('ACADEMY_PLAYER_NOT_FOUND');
  const seniorCount = allPlayers.filter(candidate => isSeniorEligiblePlayer(candidate, save.userTeamId)).length;
  if (seniorCount >= 30) throw new Error('SQUAD_FULL');
  const year = p9StartYear(save.season);
  const wage = Math.max(1_000, Math.round(Number(normalized.value ?? 100_000) * .05 / 52));
  const promoted = transitionPlayerStatus(normalized, {
    status:'first_team',
    contractTeamId:save.userTeamId,
    registeredTeamId:save.userTeamId,
    season:save.season,
    gameweek:save.currentGameweek,
    reason:'academy_promotion',
    idempotencyKey:`academy-promotion:${playerId}:${p9WeekKey(save)}`,
    patch:{
      inSquad:true,
      wage,
      contractExpiry:year + 3,
      signedThisSeason:true,
      squadRole:'prospect',
      developmentAppearances:0,
      developmentMinutes:0,
    },
  });
  await putPlayer(promoted);
  return promoted;
}

export async function releaseManagedAcademyPlayer(playerId) {
  const save = await ensureP9CareerPathways();
  const player = normalizePlayerStatus(await getPlayer(playerId));
  if (!save || !player || !isAcademyPlayer(player, save.userTeamId)) throw new Error('ACADEMY_PLAYER_NOT_FOUND');
  const released = transitionPlayerStatus(player, {
    status:'free_agent',
    season:save.season,
    gameweek:save.currentGameweek,
    reason:'academy_release',
    idempotencyKey:`academy-release:${playerId}:${p9WeekKey(save)}`,
    patch:{ inSquad:false, contractExpiry:null, wage:0, signedThisSeason:false, squadRole:null },
  });
  await putPlayer(released);
  return released;
}

export async function recallManagedLoan(playerId) {
  const save = await ensureP9CareerPathways();
  const player = normalizePlayerStatus(await getPlayer(playerId));
  if (!save || !player || !isLoanPlayer(player) || !isOwnedByTeam(player, save.userTeamId)) throw new Error('LOAN_NOT_FOUND');
  if (!player.activeLoanAgreement?.recallAllowed) throw new Error('LOAN_NOT_RECALLABLE');
  const returned = transitionPlayerStatus(player, {
    status:'first_team',
    contractTeamId:save.userTeamId,
    registeredTeamId:save.userTeamId,
    season:save.season,
    gameweek:save.currentGameweek,
    reason:'loan_recall',
    idempotencyKey:`loan-recall:${player.activeAgreementId}:${p9WeekKey(save)}`,
    patch:{ inSquad:true },
  });
  await putPlayer(returned);
  return returned;
}

export async function createManagedYouthScoutingAssignment(input) {
  const save = await ensureP9CareerPathways();
  const team = await getTeam(save.userTeamId);
  const assignmentCap = Math.min(4, 2 + scoutingCapacityBonus(team));
  const academyPathways = createYouthScoutingAssignment(save.academyPathways, input, {
    teamId:save.userTeamId,
    season:save.season,
    gameweek:save.currentGameweek,
    assignmentCap,
  });
  const nextSave = { ...save, academyPathways };
  await putSave(nextSave);
  return academyPathways;
}

export async function cancelManagedYouthScoutingAssignment(assignmentId) {
  const save = await ensureP9CareerPathways();
  const academyPathways = cancelYouthScoutingAssignment(save.academyPathways, assignmentId);
  await putSave({ ...save, academyPathways });
  return academyPathways;
}
