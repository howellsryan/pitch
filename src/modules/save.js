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
import { getSave, openDB, putFixturesBulk, putPlayersBulk, putSave, putStandingsBulk, putTeamsBulk } from './db.js';
import { selectEleven } from './matchEngine.js';
import { blankStandingRow } from './standings.js';
import { generateLeagueFixtures } from './fixtures.js';
import { assignCups, buildInitialCupState } from './cups.js';
import { assignPotentials } from './potential.js';
import { generateCohort } from './youthAcademy.js';
import { generateBoardObjective } from './season.js';

/** modules/save.js — New game creation, save state management. Supports all leagues. */

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

export async function initApp() {
  await openDB();
  const save = await getSave();
  if (save && save._deleted) return null;
  return save ?? null;
}

export async function startNewGame(userTeamId, managerName) {
  await openDB();

  const allTeamData  = getAllTeamData();
  const userTeamData = allTeamData.find(t => t.id === userTeamId);
  if (!userTeamData) throw new Error(`Unknown team: ${userTeamId}`);

  // Determine which league to simulate for standings/fixtures
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

  // Store all teams (strip players array) with reputation-scaled budgets
  const teams = allTeamData.map(({ players: _, ...rest }) => {
    // Apply reputation-based starting budget using reputationBudget formula
    const isUser = rest.id === userTeamId;
    const rep = rest.reputation ?? 70;
    const repBudget = Math.round(
      rep >= 95 ? 180_000_000 + (rep - 95) * 10_000_000 :
      rep >= 90 ? 120_000_000 + (rep - 90) * 12_000_000 :
      rep >= 85 ? 75_000_000  + (rep - 85) *  9_000_000 :
      rep >= 80 ? 45_000_000  + (rep - 80) *  6_000_000 :
      rep >= 75 ? 28_000_000  + (rep - 75) *  3_400_000 :
      rep >= 70 ? 18_000_000  + (rep - 70) *  2_000_000 :
      rep >= 65 ? 10_000_000  + (rep - 65) *  1_600_000 :
                   5_000_000  + rep * 77_000
    );
    return { ...rest, budget: repBudget };
  });

  // Store all players with teamId. Contracts run 1-4 years so the whole
  // league doesn't come out of contract in the same season.
  const players = allTeamData.flatMap(team =>
    (team.players ?? []).map(p => ({
      ...p, teamId: team.id,
      fitness: 100, injured: false, suspended: false,
      inSquad: true, goals: 0, assists: 0, cleanSheets: 0, form: 50,
      transferListed: false,
      contractExpiry: seasonYear + 1 + Math.floor(Math.random() * 4),
    }))
  );

  // Only generate fixtures + standings for the user's own league
  const standings = leagueTeams
    .map(t => blankStandingRow(t))
    .sort((a, b) => a.teamName.localeCompare(b.teamName))
    .map((row, i) => ({ ...row, position: i + 1 }));
  const fixtures  = generateLeagueFixtures(leagueTeams.map(t => t.id), seasonYear);

  await putTeamsBulk(teams);
  await putPlayersBulk(assignPotentials(players));
  await putStandingsBulk(standings);
  await putFixturesBulk(fixtures);

  // Auto-generate starting lineup so player can immediately play
  const userPlayers = players.filter(p => p.teamId === userTeamId);
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

