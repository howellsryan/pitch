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
import { generateCohort } from './youthAcademy.js';
import { generateBoardObjective } from './season.js';
import { buildWorldBackfill, buildWorldLeagueSeason } from './world.js';

/** modules/save.js — New game creation, save state management. Supports the full P1 world. */

// ALL_TEAMS is populated at runtime from all *_TEAMS arrays (auto-discovered).
// To add a new league: just create the data file with csv_to_league.py — no code changes needed.
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
 * Lazy P0 -> P1 domain migration. No IndexedDB store or save-envelope shape
 * changes, so save schema V2 remains valid: we only add fields to rows already
 * covered by the existing envelope and create the missing league rows/schedule.
 */
export async function ensureLivingWorld(save) {
  if (!save) return;
  const [teams, fixtures, standings, players] = await Promise.all([
    getAllTeams(), getAllFixtures(), getAllStandings(), getAllPlayers(),
  ]);
  if (!teams.length) return;

  const patch = buildWorldBackfill(teams, fixtures, standings, seasonStartYear(save));
  if (patch.fixturesToAdd.length) await putFixturesBulk(patch.fixturesToAdd);
  if (patch.standingsToAdd.length) await putStandingsBulk(patch.standingsToAdd);

  const playerPatches = players
    .filter(player => player.appearances == null || player.minutes == null || player.yellowCards == null || player.ratingApps == null)
    .map(backfillP1PlayerStats);
  if (playerPatches.length) await putPlayersBulk(playerPatches);
}

export async function initApp() {
  await openDB();
  const save = await getSave();
  if (save && save._deleted) return null;
  if (save) await ensureLivingWorld(save);
  return save ?? null;
}

/**
 * The budget a club actually starts a career with, from its reputation.
 * Deliberately deterministic, unlike season.js's seasonal refresh.
 */
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
  const initialCohort = generateCohort(userTeamId, userTeamData.reputation ?? 70, `${seasonYear}/${String(seasonYear + 1).slice(2)}`, userLeague);

  const save = {
    userTeamId,
    userLeague,
    managerName:     managerName || 'The Manager',
    currentDate:     new Date(seasonYear, 7, 9).toISOString(),
    season:          `${seasonYear}/${String(seasonYear + 1).slice(2)}`,
    currentGameweek: 1,
    totalGameweeks:  (leagueTeams.length - 1) * 2,
    cups:            buildInitialCupState(assignCups(userTeamData), userTeamId, userLeague),
    formation:       '4-3-3',
    mentality:       'balanced',
    lineup:          null,
    inboundOffers:   [],
    collapsedDeals:  [],
    inbox:           [],
    youthCohort:     initialCohort,
    boardObjective:  generateBoardObjective(userTeamData, userLeague),
    jobSecurity:     65,
    sacked:          false,
  };

  const teams = allTeamData.map(({ players: _, ...rest }) => ({
    ...rest,
    budget: startingBudget(rest.reputation ?? 70),
    academyInvestment: 0,
  }));

  const players = allTeamData.flatMap(team =>
    (team.players ?? []).map(p => backfillP1PlayerStats({
      ...p, teamId: team.id,
      fitness: 100, injured: false, suspended: false,
      inSquad: true, goals: 0, assists: 0, cleanSheets: 0, form: 50,
      transferListed: false,
      contractExpiry: seasonYear + 1 + Math.floor(Math.random() * 4),
    }))
  );

  // P1: fixtures and tables exist for the whole football world from day one.
  const world = buildWorldLeagueSeason(teams, seasonYear);

  await putTeamsBulk(teams);
  const assignedPlayers = assignPotentials(players);
  await putPlayersBulk(assignedPlayers);
  await replaceAllStandings(world.standings);
  await replaceAllFixtures(world.fixtures);

  // Auto-generate starting lineup so player can immediately play.
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
