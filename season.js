/** modules/season.js — End-of-season: aging, honors, prize money, season rollover */

import {
  getSave, putSave, getAllPlayers, putPlayersBulk,
  getAllStandings, putStandingsBulk, putFixturesBulk,
  getAllTeams, getTeam, putTeam, addSeason, addHonor, getAllHonors, replaceAllFixtures, replaceAllStandings,
} from './db.js';
import { runYouthIntake } from './youthAcademy.js';
import { generateLeagueFixtures } from './fixtures.js';
import { blankStandingRow }       from './standings.js';

// ─── Real-life trophy tallies (as of 2025) ───────────────────
export const REAL_LIFE_HONORS = {
  fa_cup:         { arsenal:14, man_utd:12, chelsea:8, tottenham:8, liverpool:8, man_city:7, aston_villa:7, newcastle:6 },
  league_cup:     { man_city:8, liverpool:10, aston_villa:5, chelsea:5, man_utd:6, tottenham:4, arsenal:2 },
  premier_league: { man_city:10, man_utd:13, chelsea:5, arsenal:3, liverpool:1 },
  ucl:            { real_madrid:15, barcelona:5, ac_milan:7, liverpool:6, man_utd:3, inter:3, chelsea:2, man_city:1 },
  uel:            { sevilla:7, inter:3, chelsea:2, atletico:3, liverpool:3, man_utd:1 },
  uecl:           { roma:1, west_ham:1, chelsea:1 },
};

// ─── Prize money ─────────────────────────────────────────────
export function calculatePrizeMoney(leaguePosition, cupState) {
  // ~£2m per position from bottom + merit tiers
  const plPrize = 2_000_000 * (21 - leaguePosition);
  const merit   =
    leaguePosition === 1 ? 60_000_000 :
    leaguePosition <= 4  ? 40_000_000 :
    leaguePosition <= 6  ? 20_000_000 :
    leaguePosition <= 10 ? 10_000_000 : 5_000_000;

  let cupPrize = 0;
  if (cupState) {
    for (const [cupId, state] of Object.entries(cupState)) {
      if (state.status === 'winner') {
        cupPrize += { ucl:50_000_000, uel:20_000_000, uecl:10_000_000, fa_cup:3_600_000, league_cup:2_000_000 }[cupId] ?? 0;
      } else if ((state.roundIndex ?? 0) >= 3) {
        cupPrize += { ucl:15_000_000, uel:6_000_000, uecl:2_000_000, fa_cup:900_000, league_cup:400_000 }[cupId] ?? 0;
      }
    }
  }
  return plPrize + merit + cupPrize;
}

// ─── End-of-season processing ─────────────────────────────────
export async function processEndOfSeason() {
  const save      = await getSave();
  const standings = await getAllStandings();
  const players   = await getAllPlayers();
  const allTeams  = await getAllTeams();

  const sorted       = [...standings].sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference);
  const leagueWinner = sorted[0];
  const userPosition = sorted.findIndex(r => r.teamId === save.userTeamId) + 1;
  const summary      = buildSeasonSummary(save, sorted, players, userPosition);

  // ── Award prize money to user ────────────────────────────
  const prizeMoney = calculatePrizeMoney(userPosition, save.cups);
  const userTeamRec = await getTeam(save.userTeamId);
  if (userTeamRec) {
    await putTeam({ ...userTeamRec, budget: userTeamRec.budget + prizeMoney });
    summary.prizeMoney = prizeMoney;
  }

  // ── Award honors ─────────────────────────────────────────
  if (leagueWinner?.teamId === save.userTeamId) {
    await addHonor({ trophy: 'premier_league', season: save.season, teamId: save.userTeamId });
  }
  if (save.cups) {
    for (const [cupId, cupState] of Object.entries(save.cups)) {
      if (cupState.status === 'winner') {
        await addHonor({ trophy: cupId, season: save.season, teamId: save.userTeamId });
      }
    }
  }

  await addSeason(summary);

  // ── Refresh AI team budgets by reputation ────────────────
  const nonUserTeams = allTeams.filter(t => t.id !== save.userTeamId);
  for (const t of nonUserTeams) {
    const freshBudget = reputationBudget(t.reputation ?? 70, false);
    await putTeam({ ...t, budget: freshBudget });
  }

  // ── Age all players ───────────────────────────────────────
  const agedPlayers = players.map(p => ({
    ...p,
    age:         (p.age ?? 22) + 1,
    value:       potentialAgingAdjust(p),
    goals:       0,
    assists:     0,
    cleanSheets: 0,
    form:        50,
    fitness:     100,
  }));
  await putPlayersBulk(agedPlayers);

  // ── Youth academy intake ───────────────────────────────────
  const allTeamsForAcademy = await getAllTeams();
  const newYouthCohort = await runYouthIntake(save, allTeamsForAcademy);
  // Cohort will be stored in the newSave below

  // ── Process promotion/relegation and European qualification ─
  const leagueChanges = await processLeagueChanges(sorted, [], save.userTeamId);
  summary.leagueChanges = leagueChanges;

  // ── Refresh all teams post after league changes ─────────────
  const allTeamsRefreshed = await getAllTeams();

  // ── Setup next season ─────────────────────────────────────
  const nextYear   = parseInt(save.season.split('/')[0]) + 1;
  const nextSeason = `${nextYear}/${String(nextYear + 1).slice(2)}`;

  // User's new league (may have changed due to relegation/promotion)
  const userTeamUpdated = allTeamsRefreshed.find(t => t.id === save.userTeamId);
  const userNewLeague   = userTeamUpdated?.league ?? save.userLeague ?? 'Premier League';
  const leagueTeamsNext = allTeamsRefreshed.filter(t => (t.league ?? 'Premier League') === userNewLeague);
  const nextLeagueSize  = leagueTeamsNext.length;
  const nextTotalGWs    = nextLeagueSize === 20 ? 38 : nextLeagueSize === 24 ? 46 : 38;

  const newFixtures  = generateLeagueFixtures(leagueTeamsNext.map(t => t.id), nextYear);
  const newStandings = leagueTeamsNext.map(t => blankStandingRow(t));

  await replaceAllFixtures(newFixtures);
  await replaceAllStandings(newStandings);

  // Determine cups based on new league position
  const userPosForCups = sorted.findIndex(r => r.teamId === save.userTeamId) + 1;
  const newCupIds    = assignCupsFromPosition(userPosForCups, userNewLeague, save.cups ?? {});
  const { buildInitialCupState } = await import('./cups.js').catch(() => ({ buildInitialCupState: resetCups }));

  const newSave = {
    ...save,
    currentGameweek: 1,
    totalGameweeks:  nextTotalGWs,
    currentDate:     new Date(nextYear, 7, 9).toISOString(),
    season:          nextSeason,
    userLeague:      userNewLeague,
    cups:            resetCups(save.cups ?? {}),
    lineup:          save.lineup ?? null,
    formation:       save.formation ?? '4-3-3',
    youthCohort:     newYouthCohort,
  };
  await putSave(newSave);

  return { summary, leagueWinner, newSave, prizeMoney, leagueChanges };
}

// agingValueAdjust is provided by potential.js (imported as potentialAgingAdjust)

function buildSeasonSummary(save, sorted, players, userPosition) {
  return {
    season:     save.season,
    champion:   sorted[0]?.teamId,
    relegated:  sorted.slice(-3).map(r => r.teamId),
    table:      sorted.map(r => ({ teamId: r.teamId, points: r.points, gd: r.goalDifference })),
    topScorers: [...players].filter(p => p.goals > 0).sort((a,b) => b.goals - a.goals).slice(0, 5).map(p => ({ id: p.id, name: p.name, goals: p.goals, teamId: p.teamId })),
    topAssists: [...players].filter(p => p.assists > 0).sort((a,b) => b.assists - a.assists).slice(0, 5).map(p => ({ id: p.id, name: p.name, assists: p.assists, teamId: p.teamId })),
    userFinish: userPosition,
    cups:       save.cups ?? {},
    prizeMoney: 0,
  };
}

function resetCups(old) {
  const fresh = {};
  Object.keys(old).forEach(id => { fresh[id] = { id, roundIndex: 0, status: 'active', results: [] }; });
  return fresh;
}

// ─── Get honors for a team ────────────────────────────────────
export async function getHonorsForTeam(teamId) {
  const earned   = await getAllHonors();
  const myEarned = earned.filter(h => h.teamId === teamId);
  const combined = {};
  Object.entries(REAL_LIFE_HONORS).forEach(([trophy, tallies]) => { combined[trophy] = tallies[teamId] ?? 0; });
  myEarned.forEach(h => { combined[h.trophy] = (combined[h.trophy] ?? 0) + 1; });
  return { combined, earned: myEarned };
}

// ─── Budget refresh at season start ──────────────────────────
/**
 * Each season, AI teams get a reputation-scaled transfer budget.
 * Higher reputation = bigger budget. Prize money already added
 * to user. Here we refresh AI budgets so the market stays liquid.
 */
export function reputationBudget(reputation, isUserTeam = false) {
  // Scale: rep 99 → ~£200m, rep 70 → ~£30m, rep 60 → ~£12m
  const base = Math.round(
    reputation >= 95 ? 180_000_000 + (reputation - 95) * 10_000_000 :
    reputation >= 90 ? 120_000_000 + (reputation - 90) * 12_000_000 :
    reputation >= 85 ? 75_000_000  + (reputation - 85) *  9_000_000 :
    reputation >= 80 ? 45_000_000  + (reputation - 80) *  6_000_000 :
    reputation >= 75 ? 28_000_000  + (reputation - 75) *  3_400_000 :
    reputation >= 70 ? 18_000_000  + (reputation - 70) *  2_000_000 :
    reputation >= 65 ? 10_000_000  + (reputation - 65) *  1_600_000 :
                        5_000_000  + reputation * 77_000
  );
  // Add some variance so not every team has exactly the same budget
  const variance = base * (Math.random() * 0.12 - 0.06);
  return Math.round(base + variance);
}
