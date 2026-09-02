import { addHonor, addSeason, deletePlayersBulk, getAllHonors, getAllManagers, getAllPlayers, getAllStandings, getAllTeams, getAllTransfers, getSave, getTeam, putManagersBulk, putPlayersBulk, putSave, putTeam, replaceAllFixtures, replaceAllStandings } from './db.js';
import { bumpMorale, sortTable } from './standings.js';
import { CUP_META, buildInitialCupState } from './cups.js';
import { getCompetitionRules } from './competitionRules.js';
import { agingValueAdjust, applyAgingDecline } from './potential.js';
import { assignCupsFromPosition, processLeagueChanges } from './promotion.js';
import { runYouthIntake } from './youthAcademy.js';
import {
  buildLivingWorldSeasonSummary,
  buildSeasonAwards,
  buildWorldLeagueSeason,
  generateReplacementNewgens,
  groupTeamsByLeague,
  resetSeasonPlayerStats,
  worldPopulationReport,
} from './world.js';
import { buildWorldCompetitionState } from './worldCompetitions.js';
import { rolloverTransferMarket } from './transferMarket.js';
import { applyLedgerMovement } from './clubFinance.js';

/** modules/season.js — End-of-season: aging, honors, prize money, P1 world rollover */

export const REAL_LIFE_HONORS = {
  fa_cup:         { arsenal:14, man_utd:12, chelsea:8, tottenham:8, liverpool:8, man_city:7, aston_villa:7, newcastle:6 },
  league_cup:     { man_city:8, liverpool:10, aston_villa:5, chelsea:5, man_utd:6, tottenham:4, arsenal:2 },
  premier_league: { man_city:10, man_utd:13, chelsea:5, arsenal:3, liverpool:1 },
  copa_del_rey:   { barcelona:31, athletic_bilbao:23, real_madrid:20, atletico:10, real_sociedad:3, valencia:8 },
  supercopa:      { real_madrid:12, barcelona:14, atletico:2 },
  dfb_pokal:      { bayern:20, dortmund:5, leverkusen:1, frankfurt:5, bremen:6 },
  dfb_supercup:   { bayern:9, dortmund:6, leverkusen:1 },
  coppa_italia:   { juventus:15, inter:9, roma:9, lazio:7, napoli:7, ac_milan:5, fiorentina:6, atalanta:1 },
  supercoppa:     { juventus:9, inter:8, ac_milan:7, lazio:5, roma:2, napoli:2 },
  coupe_de_france:{ psg:15, marseille:10, lyon:5, monaco:5, lille:6, rennes:2 },
  trophee_des_champions: { psg:11, lyon:5, marseille:3, monaco:3, lille:2 },
  ucl:            { real_madrid:15, barcelona:5, ac_milan:7, liverpool:6, man_utd:3, inter:3, chelsea:2, man_city:1, dortmund:1, juventus:2, ajax:4, benfica:2, porto:2 },
  uel:            { sevilla:7, inter:3, chelsea:2, atletico:3, liverpool:3, man_utd:1, juventus:3, ajax:1, porto:2, fiorentina:1 },
  uecl:           { roma:1, west_ham:1, chelsea:1, fiorentina:0, atalanta:1 },
};

export const CUP_WIN_PRIZE = {
  ucl:100_000_000, uel:50_000_000, uecl:25_000_000,
  fa_cup:2_000_000, league_cup:1_200_000,
  copa_del_rey:3_000_000, supercopa:1_500_000,
  dfb_pokal:3_000_000, dfb_supercup:500_000,
  coppa_italia:3_000_000, supercoppa:500_000,
  coupe_de_france:2_800_000, trophee_des_champions:500_000,
  knvb_beker:600_000,
};
export const CUP_RUNNER_UP_PRIZE = {
  ucl:50_000_000, uel:25_000_000, uecl:12_500_000,
  fa_cup:1_000_000, league_cup:600_000,
};
export const CUP_ROUND_PRIZE = {
  ucl:  { 0:15_000_000, 1:10_000_000, 2:12_000_000, 3:15_000_000 },
  uel:  { 0: 5_000_000, 1: 2_000_000, 2: 3_000_000, 3: 4_000_000, 4: 6_000_000 },
  uecl: { 0: 3_000_000, 1: 1_500_000, 2: 2_000_000, 3: 3_000_000 },
};
export const CUP_RUN_PRIZE = {
  fa_cup:0, league_cup:150_000,
  copa_del_rey:700_000, supercopa:200_000,
  dfb_pokal:700_000, dfb_supercup:0,
  coppa_italia:700_000, supercoppa:0,
  coupe_de_france:700_000, trophee_des_champions:0,
  knvb_beker:100_000,
};

export function europeanProgressPrize(cupId, state) {
  const prizes = Object.values(CUP_ROUND_PRIZE[cupId] ?? {});
  const rules = getCompetitionRules(cupId);
  if (!rules?.leaguePhase || prizes.length === 0) return 0;
  let total = prizes[0] ?? 0;
  let prizeOffset = 1;
  if (cupId === 'uel') {
    if (state?.qualificationRoute === 'playoff') total += prizes[1] ?? 0;
    prizeOffset = 2;
  }
  const roundIndex = Number(state?.roundIndex ?? 0);
  const stagePrefixes = ['R16 (Leg 1)', 'QF (Leg 1)', 'SF (Leg 1)'];
  stagePrefixes.forEach((prefix, index) => {
    const threshold = rules.rounds.findIndex(round => round === prefix);
    if (threshold >= 0 && roundIndex >= threshold) total += prizes[prizeOffset + index] ?? 0;
  });
  return total;
}

export function calculatePrizeMoney(leaguePosition, cupState, userLeague) {
  let leaguePrize = 0;
  if (!userLeague || userLeague === 'Premier League') {
    const base = 100_000_000;
    const merit = 2_000_000 * (20 - leaguePosition);
    const bonus = leaguePosition === 1 ? 22_000_000 : leaguePosition === 2 ? 18_000_000 : leaguePosition <= 4 ? 8_000_000 : leaguePosition <= 6 ? 3_000_000 : leaguePosition <= 10 ? 1_000_000 : 0;
    leaguePrize = base + merit + bonus;
  } else if (userLeague === 'Championship') {
    const base = 8_600_000;
    const merit = Math.round(60_000 * (24 - leaguePosition));
    const bonus = leaguePosition === 1 ? 90_000_000 : leaguePosition <= 2 ? 85_000_000 : leaguePosition <= 6 ? 75_000_000 : 0;
    leaguePrize = base + merit + bonus;
  } else if (userLeague === 'League One') {
    const base = 1_400_000;
    const merit = Math.round(25_000 * (24 - leaguePosition));
    const bonus = leaguePosition === 1 ? 10_000_000 : leaguePosition <= 2 ? 8_000_000 : leaguePosition <= 6 ? 6_000_000 : 0;
    leaguePrize = base + merit + bonus;
  } else if (userLeague === 'League Two') {
    const base = 1_100_000;
    const merit = Math.round(20_000 * (24 - leaguePosition));
    const bonus = leaguePosition === 1 ? 5_000_000 : leaguePosition <= 2 ? 4_000_000 : leaguePosition <= 6 ? 3_000_000 : 0;
    leaguePrize = base + merit + bonus;
  } else {
    leaguePrize = 3_000_000 + Math.round(350_000 * (20 - Math.min(leaguePosition, 20)));
  }

  let cupPrize = 0;
  if (cupState) {
    for (const [cupId, state] of Object.entries(cupState)) {
      const meta = typeof CUP_META !== 'undefined' ? CUP_META[cupId] : null;
      const roundsPlayed = state.roundIndex ?? 0;
      const isEuropean = ['ucl','uel','uecl'].includes(cupId);
      if (state.status === 'winner') {
        if (cupId === 'fa_cup' && meta?.roundPrize) {
          const entryRound = meta.entryRound?.[userLeague ?? 'Premier League'] ?? 0;
          for (let i = entryRound; i < meta.roundPrize.length; i++) cupPrize += meta.roundPrize[i];
        } else if (isEuropean) {
          cupPrize += CUP_WIN_PRIZE[cupId] ?? 0;
          cupPrize += europeanProgressPrize(cupId, state);
        } else cupPrize += CUP_WIN_PRIZE[cupId] ?? 0;
      } else if (state.status === 'runner_up') {
        cupPrize += CUP_RUNNER_UP_PRIZE[cupId] ?? 0;
        if (cupId === 'fa_cup' && meta?.roundPrize) {
          const entryRound = meta.entryRound?.[userLeague ?? 'Premier League'] ?? 0;
          const finalIdx = meta.roundPrize.length - 1;
          for (let i = entryRound; i < finalIdx; i++) cupPrize += meta.roundPrize[i];
        } else if (isEuropean) cupPrize += europeanProgressPrize(cupId, state);
      } else if (state.status === 'eliminated' || state.status === 'active') {
        if (cupId === 'fa_cup' && meta?.roundPrize) {
          const entryRound = meta.entryRound?.[userLeague ?? 'Premier League'] ?? 0;
          const roundsWon = Math.max(0, roundsPlayed - entryRound);
          for (let i = entryRound; i < entryRound + roundsWon && i < meta.roundPrize.length; i++) cupPrize += meta.roundPrize[i];
        } else if (isEuropean) cupPrize += europeanProgressPrize(cupId, state);
        else if (roundsPlayed >= 3) cupPrize += CUP_RUN_PRIZE[cupId] ?? 0;
      }
    }
  }
  return leaguePrize + cupPrize;
}

function leagueHonorId(league) {
  return {
    'Premier League':'premier_league',
    'La Liga':'la_liga',
    'Bundesliga':'bundesliga',
    'Serie A':'serie_a',
    'Ligue 1':'ligue_1',
    'Eredivisie':'eredivisie',
    'Championship':'championship',
    'League One':'league_one',
    'League Two':'league_two',
  }[league] ?? String(league ?? 'league').toLowerCase().replaceAll(' ', '_');
}

function worldTotalGameweeks(teams) {
  let max = 0;
  for (const leagueTeams of groupTeamsByLeague(teams).values()) max = Math.max(max, Math.max(0, (leagueTeams.length - 1) * 2));
  return max;
}

function transfersForSeason(transfers, startYear) {
  return transfers.filter(move => {
    const year = new Date(move.date ?? 0).getFullYear();
    return year === startYear || year === startYear + 1;
  });
}

export async function processEndOfSeason() {
  const save = await getSave();
  const [standings, players, allTeams, transfers] = await Promise.all([
    getAllStandings(), getAllPlayers(), getAllTeams(), getAllTransfers(),
  ]);
  const currentYear = parseInt((save.season || '').split('/')[0]) || 0;
  const nextYear = currentYear + 1;
  const nextSeason = `${nextYear}/${String(nextYear + 1).slice(2)}`;
  const teamLeague = new Map(allTeams.map(team => [team.id, team.league ?? 'Premier League']));
  const userLeague = save.userLeague ?? teamLeague.get(save.userTeamId) ?? 'Premier League';
  const sorted = sortTable(standings.filter(row => (row.league ?? teamLeague.get(row.teamId) ?? userLeague) === userLeague));
  const leagueWinner = sorted[0];
  const userPosition = sorted.findIndex(row => row.teamId === save.userTeamId) + 1;
  const summary = buildSeasonSummary(save, sorted, players, userPosition);
  const awards = buildSeasonAwards(players, allTeams);
  const seasonTransfers = transfersForSeason(transfers, currentYear);
  const populationBefore = worldPopulationReport(players);

  const prizeMoney = calculatePrizeMoney(userPosition, save.cups, userLeague);
  const userTeamRec = await getTeam(save.userTeamId);
  if (userTeamRec) {
    await putTeam(applyLedgerMovement(userTeamRec, { category:'prize_money', amount:prizeMoney, description:'Season prize money' }));
    summary.prizeMoney = prizeMoney;
  }

  if (leagueWinner?.teamId === save.userTeamId) {
    await addHonor({ trophy:leagueHonorId(userLeague), season:save.season, teamId:save.userTeamId });
  }
  if (save.cups) {
    for (const [cupId, cupState] of Object.entries(save.cups)) {
      if (cupState.status === 'winner') await addHonor({ trophy:cupId, season:save.season, teamId:save.userTeamId });
    }
  }

  // P7 WP2: AI clubs no longer get a destructive annual budget reset to a
  // fresh reputation-formula figure — that discarded any in-season spending
  // or windfalls every year. Instead nudge cash a bounded 25% of the way
  // toward the reputation-implied target each season: directionally the
  // same correction as before (a club whose reputation has grown drifts
  // richer, a fallen club drifts poorer) without a jarring one-time wealth
  // swing or runaway compounding. WP3 replaces this placeholder with the
  // fuller operating/commercial income abstraction the guide calls for.
  const nonUserTeams = allTeams.filter(team => team.id !== save.userTeamId);
  for (const team of nonUserTeams) {
    const target = reputationBudget(team.reputation ?? 70, false);
    const current = team.finance?.cash ?? team.budget ?? 0;
    const delta = Math.round((target - current) * 0.25);
    await putTeam(applyLedgerMovement(team, { category:'operating_income', amount:delta, description:'Season operating income adjustment' }));
  }

  const loanReturnUpdates = players
    .filter(player => player.onLoan && player.loanOriginalTeamId)
    .map(player => ({
      ...player,
      teamId:player.loanOriginalTeamId,
      onLoan:false,
      loanedFrom:null,
      loanedTo:null,
      loanOriginalTeamId:null,
      loanSeason:null,
      loanRecallable:false,
    }));
  if (loanReturnUpdates.length) {
    await putPlayersBulk(loanReturnUpdates);
    const returnMap = new Map(loanReturnUpdates.map(player => [player.id, player]));
    for (let i = 0; i < players.length; i++) if (returnMap.has(players[i].id)) players[i] = returnMap.get(players[i].id);
  }

  const nextYearForContracts = currentYear + 1;
  const expiredContracts = [];
  const agedPlayers = players.map(player => {
    const declined = applyAgingDecline(player);
    let teamId = declined.teamId;
    let contractExpiry = declined.contractExpiry;
    if (teamId !== 'free_agents') {
      if (contractExpiry == null) contractExpiry = nextYearForContracts + Math.floor(Math.random() * 3);
      else if (contractExpiry <= currentYear) {
        if (teamId === save.userTeamId) {
          expiredContracts.push({ id:declined.id, name:declined.name, position:declined.position });
          teamId = 'free_agents';
          contractExpiry = null;
        } else {
          const releaseChance = Math.min(0.7, 0.15 + (declined.age >= 33 ? 0.25 : declined.age >= 30 ? 0.10 : 0));
          if (Math.random() < releaseChance) {
            teamId = 'free_agents';
            contractExpiry = null;
          } else contractExpiry = nextYearForContracts + 2 + Math.floor(Math.random() * 2);
        }
      }
    }
    return resetSeasonPlayerStats({
      ...declined,
      teamId,
      contractExpiry,
      age:(declined.age ?? 22) + 1,
      value:agingValueAdjust(declined),
      form:50,
      fitness:100,
      injured:false,
      injuryGWsLeft:0,
      injuryGWsTotal:0,
      injuryName:null,
      injuryType:null,
      signedThisSeason:false,
    });
  });
  await putPlayersBulk(agedPlayers);
  summary.expiredContracts = expiredContracts;
  if (expiredContracts.length) {
    const teamNow = await getTeam(save.userTeamId);
    if (teamNow) await putTeam({ ...teamNow, morale:bumpMorale(teamNow.morale, -2 * expiredContracts.length) });
  }

  const retirees = agedPlayers.filter(player => {
    if (player.age < 36) return false;
    const rating = _retirePrimaryRating(player);
    if (player.age === 36 && rating >= 80 && Math.random() < 0.15) return false;
    if (player.age === 36 && rating >= 75 && Math.random() < 0.08) return false;
    return true;
  });
  const retireIds = retirees.map(player => player.id);
  if (retireIds.length) await deletePlayersBulk(retireIds);
  const generatedNewgens = generateReplacementNewgens(retirees, allTeams, nextSeason);
  if (generatedNewgens.length) await putPlayersBulk(generatedNewgens);
  const userRetirees = retirees.filter(player => player.teamId === save.userTeamId);
  summary.retirements = userRetirees.map(player => ({ name:player.name, age:player.age, position:player.position }));
  summary.newgens = generatedNewgens.length;
  summary.population = {
    before:populationBefore,
    after:worldPopulationReport([
      ...agedPlayers.filter(player => !retireIds.includes(player.id)),
      ...generatedNewgens,
    ]),
  };

  // Managers age exactly like players do at rollover. Nothing else here
  // decides retirement/dismissal — that stays p6Runtime.js's one weekly
  // checkpoint (managerCareer.js's shouldRetire), which already runs every
  // season on the same cadence; this just feeds it a real, moving age
  // instead of leaving every manager frozen at their starting age forever.
  const allManagers = await getAllManagers();
  if (allManagers.length) await putManagersBulk(allManagers.map(manager => ({ ...manager, age:(manager.age ?? 45) + 1 })));

  const allTeamsForAcademy = await getAllTeams();
  const newYouthCohort = await runYouthIntake(save, allTeamsForAcademy);

  // P1 uses the real persisted standings of every English tier. The promotion
  // helper keeps a fallback only for legacy callers without a world table.
  const leagueChanges = await processLeagueChanges(sorted, standings, save.userTeamId);
  summary.leagueChanges = leagueChanges;

  const livingWorld = buildLivingWorldSeasonSummary({
    save,
    teams:allTeams,
    standings,
    players,
    transfers:seasonTransfers,
    leagueChanges,
    awards,
  });
  Object.assign(summary, livingWorld, {
    prizeMoney:summary.prizeMoney,
    expiredContracts,
    retirements:summary.retirements,
    newgens:summary.newgens,
    population:summary.population,
  });

  const objectiveResult = evaluateBoardObjective(save.boardObjective, userPosition, sorted.length, leagueChanges.userRelInfo?.relegated ?? false);
  const newJobSecurity = nextJobSecurity(save.jobSecurity, objectiveResult.met, objectiveResult.margin);
  const sacked = newJobSecurity <= 0;
  summary.boardObjective = save.boardObjective ?? null;
  summary.objectiveMet = objectiveResult.met;
  summary.jobSecurity = newJobSecurity;
  summary.sacked = sacked;

  // One immutable compact season record. Current detailed ledgers are reset on
  // players/fixtures below and are not duplicated into historical match blobs.
  await addSeason(summary);

  const allTeamsRefreshed = await getAllTeams();
  const userTeamUpdated = allTeamsRefreshed.find(team => team.id === save.userTeamId);
  const userNewLeague = userTeamUpdated?.league ?? userLeague;
  const leagueTeamsNext = allTeamsRefreshed.filter(team => (team.league ?? 'Premier League') === userNewLeague);
  const nextTotalGWs = Math.max(0, (leagueTeamsNext.length - 1) * 2);
  const nextWorld = buildWorldLeagueSeason(allTeamsRefreshed, nextYear);
  await replaceAllFixtures(nextWorld.fixtures);
  await replaceAllStandings(nextWorld.standings);

  const leagueChanged = userNewLeague !== userLeague;
  const userPosForCups = leagueChanged ? 99 : userPosition;
  const newCupIds = assignCupsFromPosition(userPosForCups, userNewLeague, save.cups ?? {});
  const newCups = buildInitialCupState(newCupIds, save.userTeamId, userNewLeague);
  const nextBoardObjective = generateBoardObjective(userTeamUpdated, userNewLeague);

  const newSave = {
    ...save,
    currentGameweek:1,
    totalGameweeks:nextTotalGWs,
    worldTotalGameweeks:worldTotalGameweeks(allTeamsRefreshed),
    currentDate:new Date(nextYear, 7, 9).toISOString(),
    season:nextSeason,
    userLeague:userNewLeague,
    cups:newCups,
    worldCompetitions:buildWorldCompetitionState(allTeamsRefreshed, nextSeason, save.userTeamId, 1),
    lineup:save.lineup ?? null,
    formation:save.formation ?? '4-3-3',
    youthCohort:newYouthCohort,
    boardObjective:nextBoardObjective,
    jobSecurity:sacked ? 65 : newJobSecurity,
    sacked,
    inboundOffers:[],
    collapsedDeals:[],
    transferMarket:rolloverTransferMarket(save.transferMarket, nextSeason),
    pendingEvents:[],
  };
  await putSave(newSave);
  return { summary, leagueWinner, newSave, prizeMoney, leagueChanges, newYouthCohort, generatedNewgens };
}

export function _retirePrimaryRating(p) {
  const pos = p.position;
  if (['ST','CF','RW','LW','CAM'].includes(pos)) return p.attack;
  if (['CM','CDM','RM','LM'].includes(pos)) return p.midfield;
  if (['CB','RB','LB'].includes(pos)) return p.defence;
  return p.goalkeeping;
}

export function buildSeasonSummary(save, sorted, players, userPosition) {
  return {
    season:save.season,
    userLeague:save.userLeague ?? 'Premier League',
    champion:sorted[0]?.teamId,
    relegated:sorted.slice(-3).map(row => row.teamId),
    table:sorted.map(row => ({ teamId:row.teamId, points:row.points, gd:row.goalDifference })),
    topScorers:[...players].filter(player => player.goals > 0).sort((a,b) => b.goals - a.goals).slice(0,5).map(player => ({ id:player.id, name:player.name, goals:player.goals, teamId:player.teamId })),
    topAssists:[...players].filter(player => player.assists > 0).sort((a,b) => b.assists - a.assists).slice(0,5).map(player => ({ id:player.id, name:player.name, assists:player.assists, teamId:player.teamId })),
    userFinish:userPosition,
    cups:save.cups ?? {},
    prizeMoney:0,
  };
}

export function resetCups(old) {
  const fresh = {};
  Object.keys(old).forEach(id => { fresh[id] = { id, roundIndex:0, status:'active', results:[] }; });
  return fresh;
}

export async function getHonorsForTeam(teamId) {
  const earned = await getAllHonors();
  const myEarned = earned.filter(honor => honor.teamId === teamId);
  const combined = {};
  Object.entries(REAL_LIFE_HONORS).forEach(([trophy, tallies]) => { combined[trophy] = tallies[teamId] ?? 0; });
  myEarned.forEach(honor => { combined[honor.trophy] = (combined[honor.trophy] ?? 0) + 1; });
  return { combined, earned:myEarned };
}

export function reputationBudget(reputation, isUserTeam = false) {
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
  const variance = base * (Math.random() * 0.12 - 0.06);
  return Math.round(base + variance);
}

export function generateBoardObjective(team, league) {
  const rep = team?.reputation ?? 65;
  const promotionLeagues = new Set(['Championship', 'League One', 'League Two']);
  if (promotionLeagues.has(league)) {
    if (rep >= 75) return { id:'promotion', label:'Win promotion', kind:'position', target:2 };
    if (rep >= 62) return { id:'playoffs', label:'Push for the play-offs', kind:'position', target:6 };
    if (league === 'League Two') return { id:'consolidate', label:'Finish in mid-table', kind:'position', target:12 };
    return { id:'avoid_relegation', label:'Avoid relegation', kind:'avoid_relegation' };
  }
  if (rep >= 85) return { id:'title', label:'Win the league', kind:'position', target:1 };
  if (rep >= 75) return { id:'europe', label:'Qualify for Europe', kind:'position', target:7 };
  if (rep >= 55) return { id:'top_half', label:'Finish in the top half', kind:'top_half' };
  return { id:'avoid_relegation', label:'Avoid relegation', kind:'avoid_relegation' };
}

export function evaluateBoardObjective(objective, finalPosition, totalTeams, wasRelegated) {
  if (!objective) return { met:true, margin:0 };
  if (objective.kind === 'avoid_relegation') return { met:!wasRelegated, margin:wasRelegated ? -3 : 3 };
  if (objective.kind === 'top_half') {
    const mid = Math.ceil((totalTeams || 20) / 2);
    return { met:finalPosition <= mid, margin:mid - finalPosition };
  }
  return { met:finalPosition <= objective.target, margin:objective.target - finalPosition };
}

/**
 * Live board confidence, mid-season.
 *
 * `save.jobSecurity` only moves at the season rollover, so on its own it leaves
 * a manager permanently pinned to whatever the last review decided — a 65
 * baseline reads "Under scrutiny" for a whole season no matter how many games
 * are won. This projects the stored figure forward from what the board can
 * actually see today: how the club sits against its objective right now, and
 * recent form. It is a derived view only and is never persisted; the stored
 * figure still moves solely through `nextJobSecurity` at the end of a season.
 */
export function liveBoardConfidence(save, { position = null, totalTeams = 20, form = [], played = null } = {}) {
  const stored = Math.max(0, Math.min(100, Number(save?.jobSecurity ?? 65)));
  const objective = save?.boardObjective ?? null;
  const recent = (form ?? []).slice(-5);
  // Before the first result, league position is only the standings tiebreak
  // (usually alphabetical). Treating it as performance can put a fresh manager
  // under scrutiny before a ball has been kicked.
  const matchesPlayed = played == null
    ? recent.length
    : Math.max(0, Number(played) || 0);
  const hasLeagueEvidence = matchesPlayed > 0;

  // Form: a win is worth +4 and a loss -4, scaled by how much of a run we have.
  const formPoints = hasLeagueEvidence
    ? recent.reduce((sum, result) => sum + (result === 'W' ? 4 : result === 'D' ? 1 : -4), 0)
    : 0;

  // Objective: how far the club currently sits from where the board asked it to be.
  let objectivePoints = 0;
  let objectiveState = 'unknown';
  if (objective && hasLeagueEvidence && Number.isFinite(Number(position)) && Number(position) > 0) {
    const target = objective.kind === 'avoid_relegation'
      ? Math.max(1, (totalTeams || 20) - 3)
      : objective.kind === 'top_half'
        ? Math.ceil((totalTeams || 20) / 2)
        : Number(objective.target ?? 1);
    const margin = target - Number(position);
    // Being close to target already counts as tracking it, not as failure.
    objectivePoints = Math.max(-20, Math.min(20, margin * 2.5));
    objectiveState = margin >= 0 ? 'on_track' : margin >= -2 ? 'close' : 'behind';
  }

  const pct = Math.max(0, Math.min(100, Math.round(stored + objectivePoints + formPoints)));
  const label = pct >= 78 ? 'Backed'
    : pct >= 58 ? 'Secure'
      : pct >= 38 ? 'Under scrutiny'
        : pct >= 18 ? 'On notice'
          : 'Facing the axe';
  return { pct, label, stored, objectiveState, formPoints, objectivePoints };
}

export function nextJobSecurity(current, met, margin) {
  const cur = current ?? 65;
  const delta = met ? 12 + Math.min(18, Math.max(0, margin) * 2) : -18 - Math.min(22, Math.max(0, -margin) * 2);
  return Math.max(0, Math.min(100, Math.round(cur + delta)));
}

export async function payWeeklyWages() {
  const [allTeams, allPlayers] = await Promise.all([getAllTeams(), getAllPlayers()]);
  const billByTeam = new Map();
  for (const player of allPlayers) {
    if (!player.teamId || player.onLoan) continue;
    billByTeam.set(player.teamId, (billByTeam.get(player.teamId) ?? 0) + (player.wage ?? 0));
  }
  for (const team of allTeams) {
    const bill = billByTeam.get(team.id) ?? 0;
    if (bill <= 0) continue;
    await putTeam(applyLedgerMovement(team, { category:'wages', amount:-bill, description:'Weekly wages' }));
  }
}
