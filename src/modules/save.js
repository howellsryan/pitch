import { BUNDESLIGA_TEAMS } from '../data/bundesliga.js';
import { CHAMPIONSHIP_TEAMS } from '../data/championship.js';
import { EREDIVISIE_TEAMS } from '../data/eredivisie.js';
import { EXTRA_LEAGUES_TEAMS } from '../data/extraLeagues.js';
import { LA_LIGA_TEAMS } from '../data/laLiga.js';
import { LEAGUE_ONE_TEAMS } from '../data/leagueOne.js';
import { LEAGUE_TWO_TEAMS } from '../data/leagueTwo.js';
import { LIGUE_1_TEAMS } from '../data/ligue1.js';
import { PL_TEAMS } from '../data/plTeams.js';
import { SERIE_A_TEAMS } from '../data/serieA.js';
import {
  getAllFixtures,
  getAllPlayers,
  getAllStandings,
  getAllTeams,
  getSave,
  openDB,
  putFixturesBulk,
  putPlayersBulk,
  putSave,
  putStandingsBulk,
  putTeamsBulk,
  replaceAllFixtures,
  replaceAllStandings,
} from './db.js';
import { selectEleven } from './matchEngine.js';
import { assignCups, buildInitialCupState } from './cups.js';
import { assignPotentials } from './potential.js';
import {
  PLAYER_MODEL_VERSION,
  assignDefaultSquadRoles,
  normalizePlayerModel,
  playerModelNeedsNormalization,
} from './playerModel.js';
import { generateCohort } from './youthAcademy.js';
import { generateBoardObjective } from './season.js';
import { buildWorldBackfill, buildWorldLeagueSeason, groupTeamsByLeague } from './world.js';
import { buildWorldCompetitionState } from './worldCompetitions.js';
import { createManagerDNA, createUserTacticalPlan } from './tactics.js';
import { buildTransferMarketBackfill, createEmptyTransferMarket, transferMarketNeedsBackfill } from './transferMarket.js';

/** modules/save.js — New game creation, save state management. Supports the full P2 world. */

export function getAllTeamData() {
  const sources = [
    typeof PL_TEAMS             !== 'undefined' ? PL_TEAMS             : [],
    typeof EXTRA_LEAGUES_TEAMS  !== 'undefined' ? EXTRA_LEAGUES_TEAMS  : [],
    typeof LA_LIGA_TEAMS        !== 'undefined' ? LA_LIGA_TEAMS        : [],
    typeof SERIE_A_TEAMS        !== 'undefined' ? SERIE_A_TEAMS        : [],
    typeof BUNDESLIGA_TEAMS     !== 'undefined' ? BUNDESLIGA_TEAMS     : [],
    typeof LIGUE_1_TEAMS        !== 'undefined' ? LIGUE_1_TEAMS        : [],
    typeof CHAMPIONSHIP_TEAMS   !== 'undefined' ? CHAMPIONSHIP_TEAMS   : [],
    typeof LEAGUE_ONE_TEAMS     !== 'undefined' ? LEAGUE_ONE_TEAMS     : [],
    typeof LEAGUE_TWO_TEAMS     !== 'undefined' ? LEAGUE_TWO_TEAMS     : [],
    typeof SEGUNDA_TEAMS        !== 'undefined' ? SEGUNDA_TEAMS        : [],
    typeof ZWEITE_LIGA_TEAMS    !== 'undefined' ? ZWEITE_LIGA_TEAMS    : [],
    typeof SERIE_B_TEAMS        !== 'undefined' ? SERIE_B_TEAMS        : [],
    typeof LIGUE_2_TEAMS        !== 'undefined' ? LIGUE_2_TEAMS        : [],
    typeof EREDIVISIE_TEAMS     !== 'undefined' ? EREDIVISIE_TEAMS     : [],
  ];
  return sources.flat();
}

function seasonStartYear(save) {
  const parsed = parseInt(String(save?.season ?? '').split('/')[0], 10);
  return Number.isFinite(parsed) ? parsed : 2025;
}

export function calculateWorldTotalGameweeks(teams) {
  let max = 0;
  for (const leagueTeams of groupTeamsByLeague(teams).values()) {
    max = Math.max(max, Math.max(0, (leagueTeams.length - 1) * 2));
  }
  return max;
}

function backfillP1PlayerStats(player) {
  return {
    ...player,
    appearances:player.appearances ?? 0,
    starts:player.starts ?? 0,
    minutes:player.minutes ?? 0,
    goals:player.goals ?? 0,
    assists:player.assists ?? 0,
    cleanSheets:player.cleanSheets ?? 0,
    yellowCards:player.yellowCards ?? 0,
    redCards:player.redCards ?? 0,
    ratingTotal:player.ratingTotal ?? 0,
    ratingApps:player.ratingApps ?? 0,
    averageRating:player.averageRating ?? null,
    lastMatchRating:player.lastMatchRating ?? null,
    seasonMajorInjuries:player.seasonMajorInjuries ?? [],
    suspensionGWsLeft:player.suspensionGWsLeft ?? 0,
  };
}

/**
 * Lazy P0 -> P1 domain migration. No IndexedDB store or save-envelope version
 * changes: all new state is additive inside rows already covered by schema V2.
 */
export async function ensureLivingWorld(save) {
  if (!save) return save;
  const [teams, fixtures, standings, players] = await Promise.all([
    getAllTeams(), getAllFixtures(), getAllStandings(), getAllPlayers(),
  ]);
  if (!teams.length) return save;

  const patch = buildWorldBackfill(teams, fixtures, standings, seasonStartYear(save));
  if (patch.fixturesToAdd.length) await putFixturesBulk(patch.fixturesToAdd);
  if (patch.standingsToAdd.length) await putStandingsBulk(patch.standingsToAdd);

  const playerPatches = players
    .filter(player => player.appearances == null || player.minutes == null || player.yellowCards == null || player.ratingApps == null)
    .map(backfillP1PlayerStats);
  if (playerPatches.length) await putPlayersBulk(playerPatches);

  const worldTotalGameweeks = calculateWorldTotalGameweeks(teams);
  const hasCurrentCompetitionWorld = Boolean(
    save.worldCompetitions?.competitions && save.worldCompetitions?.season === save.season,
  );
  const worldCompetitions = hasCurrentCompetitionWorld
    ? save.worldCompetitions
    : buildWorldCompetitionState(teams, save.season, save.userTeamId, save.currentGameweek ?? 1);
  if (save.worldTotalGameweeks !== worldTotalGameweeks || !hasCurrentCompetitionWorld) {
    const migrated = { ...save, worldTotalGameweeks, worldCompetitions };
    await putSave(migrated);
    return migrated;
  }
  return save;
}

/**
 * Pure P2 save backfill. Tactical instructions, role assignments and Manager
 * DNA are manager/career state, so they live on the existing save row rather
 * than mutating universal player/team data or introducing another DB store.
 */
export function buildP2SaveBackfill(save) {
  if (!save) return save;
  return {
    ...save,
    tactics:createUserTacticalPlan(save.tactics?.instructions ?? save.tactics ?? {}),
    playerRoles:save.playerRoles && typeof save.playerRoles === 'object' && !Array.isArray(save.playerRoles)
      ? { ...save.playerRoles }
      : {},
    managerDNA:{ ...createManagerDNA(), ...(save.managerDNA ?? {}) },
  };
}

/**
 * Lazy P1 -> P2 migration. Existing formation, mentality and lineup are spread
 * through untouched. The V2 save envelope and IndexedDB schema remain valid.
 */
export async function ensureP2Tactics(save) {
  if (!save) return save;
  const migrated = buildP2SaveBackfill(save);
  const needsMigration = !save.tactics
    || save.tactics.source !== 'user'
    || !save.playerRoles
    || !save.managerDNA;
  if (needsMigration) {
    await putSave(migrated);
    return migrated;
  }
  return save;
}

function roleContractChanged(before, after) {
  return before?.squadRole !== after?.squadRole
    || before?.squadRoleSource !== after?.squadRoleSource
    || before?.squadRoleTeamId !== after?.squadRoleTeamId
    || JSON.stringify(before?.playingTimeAgreement ?? null) !== JSON.stringify(after?.playingTimeAgreement ?? null);
}

/**
 * Pure P3 migration plan. The save-level marker is the single contract version
 * for this domain. Player/team rows intentionally carry no second version tag.
 */
export function buildP3PlayerModelBackfill(save, players = [], teams = []) {
  if (!save || Number(save.playerModelVersion ?? 0) >= PLAYER_MODEL_VERSION) {
    return { save, playerPatches:[], teamPatches:[] };
  }

  const normalizedPlayers = players.map(normalizePlayerModel);
  const preparedPlayers = assignDefaultSquadRoles(normalizedPlayers, {
    currentYear:seasonStartYear(save),
    managedTeamId:save.userTeamId,
  });
  const playerPatches = preparedPlayers.filter((player, index) =>
    playerModelNeedsNormalization(players[index]) || roleContractChanged(players[index], player)
  );

  const teamPatches = teams.flatMap(team => {
    if (!Array.isArray(team.youthPlayers)) return [];
    const needsPatch = team.youthPlayers.some(playerModelNeedsNormalization);
    if (!needsPatch) return [];
    return [{ ...team, youthPlayers:team.youthPlayers.map(normalizePlayerModel) }];
  });

  const migratedSave = {
    ...save,
    ...(Array.isArray(save.youthCohort)
      ? { youthCohort:save.youthCohort.map(normalizePlayerModel) }
      : {}),
    playerModelVersion:PLAYER_MODEL_VERSION,
  };

  return { save:migratedSave, playerPatches, teamPatches };
}

/**
 * One-time additive P2 -> P3 migration. The marker is persisted last: if any
 * preceding write is interrupted, the next load safely rebuilds the plan and
 * rewrites only rows that still need normalisation.
 */
export async function ensureP3PlayerModel(save) {
  if (!save || Number(save.playerModelVersion ?? 0) >= PLAYER_MODEL_VERSION) return save;
  const [players, teams] = await Promise.all([getAllPlayers(), getAllTeams()]);
  const migration = buildP3PlayerModelBackfill(save, players, teams);
  if (migration.playerPatches.length) await putPlayersBulk(migration.playerPatches);
  if (migration.teamPatches.length) await putTeamsBulk(migration.teamPatches);
  await putSave(migration.save);
  return migration.save;
}

/** One-time additive P4 migration. Legacy inbound offers remain as a derived
 * compatibility projection while the persisted market becomes authoritative. */
export async function ensureP4TransferMarket(save) {
  if (!save || !transferMarketNeedsBackfill(save)) return save;
  const migration = buildTransferMarketBackfill(save);
  await putSave(migration.save);
  return migration.save;
}

export async function initApp() {
  await openDB();
  let save = await getSave();
  if (save && save._deleted) return null;
  if (save) {
    save = await ensureLivingWorld(save);
    save = await ensureP2Tactics(save);
    save = await ensureP3PlayerModel(save);
    save = await ensureP4TransferMarket(save);
  }
  return save ?? null;
}

export function startingBudget(reputation) {
  const rep = Number.isFinite(reputation) ? reputation : 70;
  return Math.round(
    rep >= 95 ? 180_000_000 + (rep - 95) * 10_000_000 :
    rep >= 90 ? 120_000_000 + (rep - 90) * 12_000_000 :
    rep >= 85 ? 75_000_000  + (rep - 85) *  9_000_000 :
    rep >= 80 ? 45_000_000  + (rep - 80) *  6_000_000 :
    rep >= 75 ? 28_000_000  + (rep - 75) *  3_400_000 :
    rep >= 70 ? 18_000_000  + (rep - 70) *  2_000_000 :
    rep >= 65 ? 10_000_000  + (rep - 65) *  1_600_000 :
                 5_000_000  + rep * 77_000
  );
}

export async function startNewGame(userTeamId, managerName) {
  await openDB();

  const allTeamData  = getAllTeamData();
  const userTeamData = allTeamData.find(t => t.id === userTeamId);
  if (!userTeamData) throw new Error(`Unknown team: ${userTeamId}`);

  const userLeague  = userTeamData.league ?? 'Premier League';
  const leagueTeams = allTeamData.filter(t => (t.league ?? 'Premier League') === userLeague);

  const seasonYear = 2025;
  const season = `${seasonYear}/${String(seasonYear + 1).slice(2)}`;
  const initialCohort = generateCohort(userTeamId, userTeamData.reputation ?? 70, season, userLeague)
    .map(normalizePlayerModel);

  const teams = allTeamData.map(({ players: _, ...rest }) => ({
    ...rest,
    budget: startingBudget(rest.reputation ?? 70),
    academyInvestment: 0,
  }));

  const save = {
    userTeamId,
    userLeague,
    managerName:     managerName || 'The Manager',
    currentDate:     new Date(seasonYear, 7, 9).toISOString(),
    season,
    currentGameweek: 1,
    totalGameweeks:  (leagueTeams.length - 1) * 2,
    worldTotalGameweeks: calculateWorldTotalGameweeks(teams),
    cups:            buildInitialCupState(assignCups(userTeamData), userTeamId, userLeague),
    worldCompetitions: buildWorldCompetitionState(teams, season, userTeamId, 1),
    formation:       '4-3-3',
    mentality:       'balanced',
    lineup:          null,
    tactics:         createUserTacticalPlan(),
    playerRoles:     {},
    managerDNA:      createManagerDNA(),
    playerModelVersion: PLAYER_MODEL_VERSION,
    inboundOffers:   [],
    collapsedDeals:  [],
    transferMarket:  createEmptyTransferMarket(),
    inbox:           [],
    youthCohort:     initialCohort,
    boardObjective:  generateBoardObjective(userTeamData, userLeague),
    jobSecurity:     65,
    sacked:          false,
  };

  const players = allTeamData.flatMap(team =>
    (team.players ?? []).map(p => backfillP1PlayerStats({
      ...p, teamId: team.id,
      fitness: 100, injured: false, suspended: false,
      inSquad: true, goals: 0, assists: 0, cleanSheets: 0, form: 50,
      transferListed: false,
      contractExpiry: seasonYear + 1 + Math.floor(Math.random() * 4),
    }))
  );

  const world = buildWorldLeagueSeason(teams, seasonYear);

  await putTeamsBulk(teams);
  const assignedPlayers = assignDefaultSquadRoles(
    assignPotentials(players).map(normalizePlayerModel),
    { currentYear:seasonYear, managedTeamId:userTeamId },
  );
  await putPlayersBulk(assignedPlayers);
  await replaceAllStandings(world.standings);
  await replaceAllFixtures(world.fixtures);

  const userPlayers = assignedPlayers.filter(p => p.teamId === userTeamId);
  const xi = selectEleven(userPlayers, save.formation, null);
  save.lineup = xi.map(p => p.id);

  await putSave(save);
  return save;
}

export async function patchSave(patch) {
  const current = await getSave();
  const updated  = { ...current, ...patch };
  await putSave(updated);
  return updated;
}
