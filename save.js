/** modules/save.js — New game creation, save state management. Supports all leagues. */

import {
  openDB, getSave, putSave,
  putTeamsBulk, putPlayersBulk,
  putStandingsBulk, putFixturesBulk,
} from './db.js';
import { generateLeagueFixtures } from './fixtures.js';
import { blankStandingRow }       from './standings.js';
import { assignCups, buildInitialCupState } from './cups.js';
import { assignPotentials } from './potential.js';
import { generateCohort } from './youthAcademy.js';

// ALL_TEAMS is populated at runtime from PL_TEAMS + EXTRA_LEAGUES_TEAMS
function getAllTeamData() {
  const pl    = typeof PL_TEAMS             !== 'undefined' ? PL_TEAMS             : [];
  const extra = typeof EXTRA_LEAGUES_TEAMS  !== 'undefined' ? EXTRA_LEAGUES_TEAMS  : [];
  return [...pl, ...extra];
}

export async function initApp() {
  await openDB();
  const save = await getSave();
  if (save && save._deleted) return null;
  return save ?? null;
}

export async function startNewGame(userTeamId) {
  await openDB();

  const allTeamData  = getAllTeamData();
  const userTeamData = allTeamData.find(t => t.id === userTeamId);
  if (!userTeamData) throw new Error(`Unknown team: ${userTeamId}`);

  // Determine which league to simulate for standings/fixtures
  const userLeague  = userTeamData.league ?? 'Premier League';
  const leagueTeams = allTeamData.filter(t => (t.league ?? 'Premier League') === userLeague);

  const seasonYear = 2025;
  const initialCohort = generateCohort(userTeamId, userTeamData.reputation ?? 70, `${seasonYear}/${String(seasonYear + 1).slice(2)}`);

  const save = {
    userTeamId,
    userLeague,
    currentDate:     new Date(seasonYear, 7, 9).toISOString(),
    season:          `${seasonYear}/${String(seasonYear + 1).slice(2)}`,
    currentGameweek: 1,
    totalGameweeks:  leagueTeams.length === 20 ? 38 : leagueTeams.length === 18 ? 34 : 38,
    cups:            buildInitialCupState(assignCups(userTeamData), userTeamId),
    formation:       '4-3-3',
    lineup:          null,
    inboundOffers:   [],
    youthCohort:     initialCohort,
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

  // Store all players with teamId
  const players = allTeamData.flatMap(team =>
    (team.players ?? []).map(p => ({
      ...p, teamId: team.id,
      fitness: 100, injured: false, suspended: false,
      inSquad: true, goals: 0, assists: 0, cleanSheets: 0, form: 50,
      transferListed: false,
    }))
  );

  // Only generate fixtures + standings for the user's own league
  const standings = leagueTeams.map(t => blankStandingRow(t));
  const fixtures  = generateLeagueFixtures(leagueTeams.map(t => t.id), seasonYear);

  await putTeamsBulk(teams);
  await putPlayersBulk(assignPotentials(players));
  await putStandingsBulk(standings);
  await putFixturesBulk(fixtures);
  await putSave(save);

  return save;
}

export async function patchSave(patch) {
  const current = await getSave();
  const updated  = { ...current, ...patch };
  await putSave(updated);
  return updated;
}
