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
  getTeam,
  openDB,
  prepareActiveCareerSlotForNewSave,
  putFixturesBulk,
  putManagersBulk,
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
  attributeProfileFromSeed,
  normalizePlayerModel,
  playerModelNeedsNormalization,
} from './playerModel.js';
import { normalizePlayerStatus } from './playerStatus.js';
import { generateCohort } from './youthAcademy.js';
import { BOARD_CONTRACT_VERSION, boardContractNeedsBackfill, buildBoardContractBackfill, generateBoardContract, generateBoardObjective } from './boardContract.js';
import { FACILITIES_VERSION, buildFacilitiesBackfill, createFacilities, facilitiesNeedBackfill } from './facilities.js';
import { buildWorldBackfill, buildWorldLeagueSeason, groupTeamsByLeague } from './world.js';
import { buildWorldCompetitionState } from './worldCompetitions.js';
import { TACTICS_PLAN_VERSION, createManagerDNA, createUserTacticalPlan } from './tactics.js';
import { buildTransferMarketBackfill, createEmptyTransferMarket, transferMarketNeedsBackfill } from './transferMarket.js';
import { withDefaultCoaching } from './coaching.js';
import { createFreshP5SaveFields, ensureP5CareerDepth } from './p5Runtime.js';
import { createFreshP9SaveFields, ensureP9CareerPathways } from './p9Runtime.js';
import { MANAGER_MODEL_VERSION, buildManagersBackfill, createEmptyManagerMarket, createUserManager, generateAIManagerForClub, managersNeedBackfill } from './managers.js';
import { CLUB_PHILOSOPHY_VERSION, buildClubPhilosophyBackfill, clubPhilosophiesNeedBackfill, generateClubPhilosophy } from './clubPhilosophy.js';
import { CLUB_FINANCE_VERSION, buildClubFinanceBackfill, createClubFinance, financeNeedsBackfill } from './clubFinance.js';
import { buildCareerEventsBackfill, createCareerEventsState, careerEventsNeedBackfill } from './careerEvents.js';
import { seedVerifiedStartingFreeAgents } from './startingFreeAgents.js';

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

const P2_LEGACY_TEAM_INSTRUCTIONS = Object.freeze({
  buildUp:'balanced', tempo:'balanced', defensiveLine:'mid', pressing:'standard', width:'balanced',
  transition:'balanced', chanceCreation:'balanced', defensiveApproach:'balanced', setPieces:'balanced',
});

const P2_LEGACY_INSTRUCTION_VALUES = Object.freeze({
  buildUp:new Set(['patient','balanced','direct']),
  tempo:new Set(['slow','balanced','fast']),
  defensiveLine:new Set(['low','mid','high']),
  pressing:new Set(['passive','standard','aggressive']),
  width:new Set(['narrow','balanced','wide']),
  transition:new Set(['hold_shape','balanced','counter']),
  chanceCreation:new Set(['work_ball','balanced','early_delivery']),
  defensiveApproach:new Set(['compact','balanced','front_foot']),
  setPieces:new Set(['secure','balanced','attack']),
});

function normalizeP2LegacyInstructions(input = {}) {
  const out = { ...P2_LEGACY_TEAM_INSTRUCTIONS };
  for (const [key, allowed] of Object.entries(P2_LEGACY_INSTRUCTION_VALUES)) {
    if (allowed.has(input?.[key])) out[key] = input[key];
  }
  return out;
}

function createP2LegacyManagerDNA(current = {}) {
  return {
    version:1, matches:0, wins:0, draws:0, losses:0,
    formations:{}, mentalities:{},
    pressTotal:0, directnessTotal:0, possessionTotal:0, riskTotal:0,
    youthStarts:0, possessionObservedTotal:0,
    lastFingerprint:null,
    ...(current ?? {}),
    version:1,
  };
}

export function buildP2SaveBackfill(save) {
  if (!save) return save;
  const rawInstructions = save.tactics?.instructions ?? save.tactics ?? {};
  return {
    ...save,
    tactics:{ version:1, source:'user', instructions:normalizeP2LegacyInstructions(rawInstructions) },
    playerRoles:save.playerRoles && typeof save.playerRoles === 'object' && !Array.isArray(save.playerRoles)
      ? { ...save.playerRoles }
      : {},
    managerDNA:createP2LegacyManagerDNA(save.managerDNA),
  };
}

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

export function buildTacticsV2SaveBackfill(save) {
  if (!save) return save;
  const tactics = createUserTacticalPlan(save.tactics?.instructions ?? save.tactics ?? {});
  return {
    ...save,
    tactics,
    managerDNA:{ ...createManagerDNA(), ...(save.managerDNA ?? {}), version:2 },
  };
}

export function tacticsV2NeedsBackfill(save) {
  if (!save) return false;
  const migrated = buildTacticsV2SaveBackfill(save);
  return Number(save.tactics?.version ?? 0) < TACTICS_PLAN_VERSION
    || save.tactics?.source !== 'user'
    || Number(save.managerDNA?.version ?? 0) < 2
    || JSON.stringify(save.tactics?.instructions ?? null) !== JSON.stringify(migrated.tactics.instructions);
}

export async function ensureTacticsV2(save) {
  if (!save || !tacticsV2NeedsBackfill(save)) return save;
  const migrated = buildTacticsV2SaveBackfill(save);
  await putSave(migrated);
  return migrated;
}

function roleContractChanged(before, after) {
  return before?.squadRole !== after?.squadRole
    || before?.squadRoleSource !== after?.squadRoleSource
    || before?.squadRoleTeamId !== after?.squadRoleTeamId
    || JSON.stringify(before?.playingTimeAgreement ?? null) !== JSON.stringify(after?.playingTimeAgreement ?? null);
}

function seedPlayersById(seedTeams) {
  const byId = new Map();
  for (const team of seedTeams ?? []) {
    for (const player of team?.players ?? []) {
      if (player?.id && !byId.has(player.id)) byId.set(player.id, player);
    }
  }
  return byId;
}

function normalizeMigratingPlayer(player, seedById) {
  if (!player) return player;
  const seedPlayer = seedById.get(player.id) ?? null;
  return normalizePlayerModel({
    ...player,
    attributeProfile:attributeProfileFromSeed(player, seedPlayer),
  });
}

export function buildP3PlayerModelBackfill(save, players = [], teams = [], seedTeams = getAllTeamData()) {
  if (!save || Number(save.playerModelVersion ?? 0) >= PLAYER_MODEL_VERSION) {
    return { save, playerPatches:[], teamPatches:[] };
  }

  const seedById = seedPlayersById(seedTeams);
  const normalizeForMigration = player => normalizeMigratingPlayer(player, seedById);
  const normalizedPlayers = players.map(normalizeForMigration);
  const preparedPlayers = assignDefaultSquadRoles(normalizedPlayers, {
    currentYear:seasonStartYear(save),
    managedTeamId:save.userTeamId,
  });
  const playerPatches = preparedPlayers.filter((player, index) =>
    playerModelNeedsNormalization(players[index]) || roleContractChanged(players[index], player)
  );

  const teamPatches = teams.flatMap(team => {
    if (!Array.isArray(team.youthPlayers)) return [];
    const normalizedYouth = team.youthPlayers.map(normalizeForMigration);
    const needsPatch = team.youthPlayers.some((player, index) => playerModelNeedsNormalization(player)
      || JSON.stringify(player.attributeProfile ?? null) !== JSON.stringify(normalizedYouth[index].attributeProfile));
    if (!needsPatch) return [];
    return [{ ...team, youthPlayers:normalizedYouth }];
  });

  const migratedSave = {
    ...save,
    ...(Array.isArray(save.youthCohort)
      ? { youthCohort:save.youthCohort.map(normalizeForMigration) }
      : {}),
    playerModelVersion:PLAYER_MODEL_VERSION,
  };

  return { save:migratedSave, playerPatches, teamPatches };
}

export async function ensureP3PlayerModel(save) {
  if (!save || Number(save.playerModelVersion ?? 0) >= PLAYER_MODEL_VERSION) return save;
  const [players, teams] = await Promise.all([getAllPlayers(), getAllTeams()]);
  const migration = buildP3PlayerModelBackfill(save, players, teams);
  if (migration.playerPatches.length) await putPlayersBulk(migration.playerPatches);
  if (migration.teamPatches.length) await putTeamsBulk(migration.teamPatches);
  await putSave(migration.save);
  return migration.save;
}

export async function ensureP4TransferMarket(save) {
  if (!save || !transferMarketNeedsBackfill(save)) return save;
  const migration = buildTransferMarketBackfill(save);
  await putSave(migration.save);
  return migration.save;
}

export async function ensureP6Managers(save) {
  if (!save || !managersNeedBackfill(save)) return save;
  const teams = await getAllTeams();
  const migration = buildManagersBackfill(save, teams);
  if (migration.managers.length) await putManagersBulk(migration.managers);
  if (migration.teamPatches.length) await putTeamsBulk(migration.teamPatches);
  await putSave(migration.save);
  return migration.save;
}

export async function ensureP7ClubPhilosophy(save) {
  if (!save || !clubPhilosophiesNeedBackfill(save)) return save;
  const teams = await getAllTeams();
  const migration = buildClubPhilosophyBackfill(save, teams);
  if (migration.teamPatches.length) await putTeamsBulk(migration.teamPatches);
  await putSave(migration.save);
  return migration.save;
}

export async function ensureP7ClubFinance(save) {
  if (!save || !financeNeedsBackfill(save)) return save;
  const teams = await getAllTeams();
  const migration = buildClubFinanceBackfill(save, teams);
  if (migration.teamPatches.length) await putTeamsBulk(migration.teamPatches);
  await putSave(migration.save);
  return migration.save;
}

export async function ensureP7BoardContract(save) {
  if (!save || !boardContractNeedsBackfill(save)) return save;
  const userTeam = await getTeam(save.userTeamId);
  const migration = buildBoardContractBackfill(save, userTeam, save.userLeague);
  await putSave(migration.save);
  return migration.save;
}

export async function ensureP7Facilities(save) {
  if (!save || !facilitiesNeedBackfill(save)) return save;
  const teams = await getAllTeams();
  const migration = buildFacilitiesBackfill(save, teams);
  if (migration.teamPatches.length) await putTeamsBulk(migration.teamPatches);
  await putSave(migration.save);
  return migration.save;
}

export async function ensureP8CareerEventsSave(save) {
  if (!save || !careerEventsNeedBackfill(save)) return save;
  const migrated = buildCareerEventsBackfill(save);
  await putSave(migrated);
  return migrated;
}

export async function initApp() {
  await openDB();
  let save = await getSave();
  if (save && save._deleted) return null;
  if (save) {
    save = await ensureLivingWorld(save);
    save = await ensureP2Tactics(save);
    save = await ensureTacticsV2(save);
    save = await ensureP3PlayerModel(save);
    save = await ensureP4TransferMarket(save);
    save = await ensureP5CareerDepth(save);
    save = await ensureP6Managers(save);
    save = await ensureP7ClubPhilosophy(save);
    save = await ensureP7ClubFinance(save);
    save = await ensureP7BoardContract(save);
    save = await ensureP7Facilities(save);
    save = await ensureP9CareerPathways(save);
    save = await ensureP8CareerEventsSave(save);
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
  const allTeamData  = getAllTeamData();
  const userTeamData = allTeamData.find(t => t.id === userTeamId);
  if (!userTeamData) throw new Error(`Unknown team: ${userTeamId}`);

  // The active pointer selects the destination slot. Empty every one of its
  // stores before rebuilding so interrupted setup or an earlier career can
  // never leak players, history or transfer rows into this save.
  await prepareActiveCareerSlotForNewSave();

  const userLeague  = userTeamData.league ?? 'Premier League';
  const leagueTeams = allTeamData.filter(t => (t.league ?? 'Premier League') === userLeague);

  const seasonYear = 2025;
  const season = `${seasonYear}/${String(seasonYear + 1).slice(2)}`;
  const initialCohort = generateCohort(userTeamId, userTeamData.reputation ?? 70, season, userLeague)
    .map(normalizePlayerModel);
  const canonicalInitialCohort = initialCohort.map(player => normalizePlayerStatus({
    ...player,
    teamId:userTeamId,
    youthTeamId:userTeamId,
    isYouth:true,
    playerStatus:'academy',
    contractTeamId:userTeamId,
    registeredTeamId:userTeamId,
    inSquad:false,
    onLoan:false,
    contractExpiry:null,
  }));

  const currentDate = new Date(seasonYear, 7, 9).toISOString();
  const userManager = createUserManager({ name:managerName, currentClubId:userTeamId, currentDate });
  const aiManagers = allTeamData
    .filter(team => team.id !== userTeamId)
    .map(team => generateAIManagerForClub(team, { currentDate, seasonStartYear:seasonYear }));
  const managerIdByClub = new Map([[userTeamId, userManager.id], ...aiManagers.map(m => [m.currentClubId, m.id])]);

  const teams = allTeamData.map(({ players: _, ...rest }) => {
    const budget = startingBudget(rest.reputation ?? 70);
    return withDefaultCoaching({
      ...rest,
      budget,
      academyInvestment: 0,
      managerId: managerIdByClub.get(rest.id) ?? null,
      philosophy: generateClubPhilosophy(rest, rest.league ?? userLeague),
      finance: createClubFinance(budget),
      facilities: createFacilities(),
    });
  });

  const save = {
    userTeamId,
    userLeague,
    managerName:     managerName || 'The Manager',
    managerModelVersion: MANAGER_MODEL_VERSION,
    clubPhilosophyVersion: CLUB_PHILOSOPHY_VERSION,
    clubFinanceVersion: CLUB_FINANCE_VERSION,
    facilitiesVersion: FACILITIES_VERSION,
    userManagerId:   userManager.id,
    managerMarket:   createEmptyManagerMarket(),
    currentDate,
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
    ...createFreshP5SaveFields(),
    ...createFreshP9SaveFields(),
    inbox:           [],
    careerEvents:    createCareerEventsState(),
    boardObjective:  generateBoardObjective(userTeamData, userLeague),
    boardContract:   generateBoardContract(userTeamData, userLeague),
    boardContractVersion: BOARD_CONTRACT_VERSION,
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
  await putManagersBulk([userManager, ...aiManagers]);
  const assignedPlayers = assignDefaultSquadRoles(
    assignPotentials(players).map(normalizePlayerModel),
    { currentYear:seasonYear, managedTeamId:userTeamId },
  );
  await putPlayersBulk([...assignedPlayers, ...canonicalInitialCohort]);
  await replaceAllStandings(world.standings);
  await replaceAllFixtures(world.fixtures);

  const userPlayers = assignedPlayers.filter(p => p.teamId === userTeamId);
  const xi = selectEleven(userPlayers, save.formation, null);
  save.lineup = xi.map(p => p.id);

  await putSave(save);
  await seedVerifiedStartingFreeAgents();
  await ensureP9CareerPathways(save);
  return await getSave();
}

export async function patchSave(patch) {
  const current = await getSave();
  const updated  = { ...current, ...patch };
  await putSave(updated);
  return updated;
}
