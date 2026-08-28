import { addHonor, addSeason, deletePlayersBulk, getAllHonors, getAllPlayers, getAllStandings, getAllTeams, getSave, getTeam, putPlayersBulk, putSave, putTeam, replaceAllFixtures, replaceAllStandings } from './db.js';
import { blankStandingRow } from './standings.js';
import { generateLeagueFixtures } from './fixtures.js';
import { CUP_META, buildInitialCupState } from './cups.js';
import { agingValueAdjust, applyAgingDecline } from './potential.js';
import { assignCupsFromPosition, processLeagueChanges } from './promotion.js';
import { runYouthIntake } from './youthAcademy.js';
import { bumpMorale } from './standings.js';

/** modules/season.js — End-of-season: aging, honors, prize money, season rollover */

// ─── Real-life trophy tallies (as of 2025) ───────────────────
export const REAL_LIFE_HONORS = {
  // English
  fa_cup:         { arsenal:14, man_utd:12, chelsea:8, tottenham:8, liverpool:8, man_city:7, aston_villa:7, newcastle:6 },
  league_cup:     { man_city:8, liverpool:10, aston_villa:5, chelsea:5, man_utd:6, tottenham:4, arsenal:2 },
  premier_league: { man_city:10, man_utd:13, chelsea:5, arsenal:3, liverpool:1 },
  // Spanish
  copa_del_rey:   { barcelona:31, athletic_bilbao:23, real_madrid:20, atletico:10, real_sociedad:3, valencia:8 },
  supercopa:      { real_madrid:12, barcelona:14, atletico:2 },
  // German
  dfb_pokal:      { bayern:20, dortmund:5, leverkusen:1, frankfurt:5, bremen:6 },
  dfb_supercup:   { bayern:9, dortmund:6, leverkusen:1 },
  // Italian
  coppa_italia:   { juventus:15, inter:9, roma:9, lazio:7, napoli:7, ac_milan:5, fiorentina:6, atalanta:1 },
  supercoppa:     { juventus:9, inter:8, ac_milan:7, lazio:5, roma:2, napoli:2 },
  // French
  coupe_de_france:{ psg:15, marseille:10, lyon:5, monaco:5, lille:6, rennes:2 },
  trophee_des_champions: { psg:11, lyon:5, marseille:3, monaco:3, lille:2 },
  // European
  ucl:            { real_madrid:15, barcelona:5, ac_milan:7, liverpool:6, man_utd:3, inter:3, chelsea:2, man_city:1, dortmund:1, juventus:2, ajax:4, benfica:2, porto:2 },
  uel:            { sevilla:7, inter:3, chelsea:2, atletico:3, liverpool:3, man_utd:1, juventus:3, ajax:1, porto:2, fiorentina:1 },
  uecl:           { roma:1, west_ham:1, chelsea:1, fiorentina:0, atalanta:1 },
};

// ─── Prize money ─────────────────────────────────────────────
// European cups: full prize structure with trickle-down per round reached.
// CUP_WIN_PRIZE = trophy winners. CUP_RUNNER_UP_PRIZE = finalists.
// CUP_ROUND_PRIZE = prize for reaching/surviving each round (SF, QF, R16, group).
export const CUP_WIN_PRIZE = {
  // European — winners take massive prizes reflecting UEFA distributions
  ucl:100_000_000, uel:50_000_000, uecl:25_000_000,
  // FA Cup per-round via CUP_META.roundPrize — this is the EXTRA for lifting the trophy
  fa_cup:2_000_000, league_cup:1_200_000,
  copa_del_rey:3_000_000, supercopa:1_500_000,
  dfb_pokal:3_000_000, dfb_supercup:500_000,
  coppa_italia:3_000_000, supercoppa:500_000,
  coupe_de_france:2_800_000, trophee_des_champions:500_000,
  knvb_beker:600_000,
};
// Runner-up prize for cup finals
export const CUP_RUNNER_UP_PRIZE = {
  ucl:50_000_000, uel:25_000_000, uecl:12_500_000,
  fa_cup:1_000_000, league_cup:600_000,
};
// Prize paid for reaching each stage (on top of base participation fee).
// These stack — reaching the SF gets you SF money + QF money + R16 money etc.
// UCL: group/league-phase ~£15m, R16 +£10m, QF +£12m, SF +£15m (all below final prize)
// UEL: league-phase ~£5m, R32 +£2m, R16 +£3m, QF +£4m, SF +£6m
// UECL: league-phase ~£3m, R16 +£1.5m, QF +£2m, SF +£3m
export const CUP_ROUND_PRIZE = {
  ucl:  { 0:15_000_000, 1:10_000_000, 2:12_000_000, 3:15_000_000 }, // R16,QF,SF,Final(winner/ru handled above)
  uel:  { 0: 5_000_000, 1: 2_000_000, 2: 3_000_000, 3: 4_000_000, 4: 6_000_000 },
  uecl: { 0: 3_000_000, 1: 1_500_000, 2: 2_000_000, 3: 3_000_000 },
};
// Flat run prize for domestic cups (non-FA Cup) — paid if team reached a deep round
export const CUP_RUN_PRIZE = {
  fa_cup:0, league_cup:150_000,  // FA Cup handled per-round via CUP_META
  copa_del_rey:700_000, supercopa:200_000,
  dfb_pokal:700_000, dfb_supercup:0,
  coppa_italia:700_000, supercoppa:0,
  coupe_de_france:700_000, trophee_des_champions:0,
  knvb_beker:100_000,
};

export function calculatePrizeMoney(leaguePosition, cupState, userLeague) {
  // League prize money — real EFL/PL distributions (2024/25 estimates) with
  // position-weighted merit payments. Sources: EFL handbook, PL published distributions.
  let leaguePrize = 0;

  if (!userLeague || userLeague === 'Premier League') {
    // Premier League: massive broadcast deal — just surviving is transformational.
    // Base £100m equal share. Merit: £2m per place. Winner gets £160m total, 2nd £120m,
    // trickle down to 20th at ~£100m (still life-changing vs Championship).
    const base  = 100_000_000;
    const merit = 2_000_000 * (20 - leaguePosition);   // 1st +£38m, 20th +£0
    const bonus =
      leaguePosition === 1 ? 22_000_000 :  // title: total ~£160m
      leaguePosition === 2 ? 18_000_000 :  // runners-up: total ~£120m (merit+bonus)
      leaguePosition <= 4  ?  8_000_000 :  // UCL places
      leaguePosition <= 6  ?  3_000_000 :  // Europa places
      leaguePosition <= 10 ?  1_000_000 : 0;
    leaguePrize = base + merit + bonus;

  } else if (userLeague === 'Championship') {
    // Championship: EFL basic award ~£8.6m equal share.
    // Promotion to PL is worth £200m+ over 3 years — we model the immediate season prize
    // plus a promotion windfall (first-year parachute/PL money effect simplified).
    // Champions/runners-up: ~£90m windfall. Playoff winners: ~£75m. Rest: EFL distributions.
    // Range: 1st ~£98m, playoff winner ~£83m, 7th+ ~£9-10m, 24th ~£8.6m.
    const base  = 8_600_000;
    const merit = Math.round(60_000 * (24 - leaguePosition)); // 1st+£1.38m, 24th=£0
    const bonus =
      leaguePosition === 1 ? 90_000_000 :  // champions — PL promotion windfall
      leaguePosition <= 2  ? 85_000_000 :  // automatic promotion
      leaguePosition <= 6  ? 75_000_000 : 0; // playoff promotion
    leaguePrize = base + merit + bonus;

  } else if (userLeague === 'League One') {
    // League One: EFL basic ~£1.4m. Winners get £10m promotion bonus (Championship doors open);
    // auto-promotion (2nd) £8m; playoff winners £6m. Rest: modest position gradient.
    // Range: 1st ~£11.7m, playoff ~£7.5m, 7th+ ~£1.4-2m, 24th ~£1.4m.
    const base  = 1_400_000;
    const merit = Math.round(25_000 * (24 - leaguePosition));
    const bonus =
      leaguePosition === 1 ? 10_000_000 :
      leaguePosition <= 2  ?  8_000_000 :
      leaguePosition <= 6  ?  6_000_000 : 0;
    leaguePrize = base + merit + bonus;

  } else if (userLeague === 'League Two') {
    // League Two: EFL basic ~£1.1m. Winners get £5m promotion bonus;
    // auto-promotion £4m; playoff winners £3m.
    // Range: 1st ~£6.2m, playoff ~£4.2m, 7th+ ~£1.1-1.7m, 24th ~£1.1m.
    const base  = 1_100_000;
    const merit = Math.round(20_000 * (24 - leaguePosition));
    const bonus =
      leaguePosition === 1 ? 5_000_000 :
      leaguePosition <= 2  ? 4_000_000 :
      leaguePosition <= 6  ? 3_000_000 : 0;
    leaguePrize = base + merit + bonus;

  } else {
    // Other leagues (La Liga, Bundesliga, etc.) — simplified position-scaled model.
    // Range roughly £3m (bottom) to £10m (top).
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
          // FA Cup: sum all per-round prizes from entry to final
          const entryRound = meta.entryRound?.[userLeague ?? 'Premier League'] ?? 0;
          for (let i = entryRound; i < meta.roundPrize.length; i++) cupPrize += meta.roundPrize[i];
        } else if (isEuropean) {
          // European: winner prize + all round prizes accumulated
          cupPrize += CUP_WIN_PRIZE[cupId] ?? 0;
          const rounds = CUP_ROUND_PRIZE[cupId] ?? {};
          for (const prize of Object.values(rounds)) cupPrize += prize;
        } else {
          cupPrize += CUP_WIN_PRIZE[cupId] ?? 0;
        }

      } else if (state.status === 'runner_up') {
        cupPrize += CUP_RUNNER_UP_PRIZE[cupId] ?? 0;
        if (cupId === 'fa_cup' && meta?.roundPrize) {
          // FA Cup runner-up: sum round prizes up to (not including) the Final win prize
          const entryRound = meta.entryRound?.[userLeague ?? 'Premier League'] ?? 0;
          const finalIdx   = meta.roundPrize.length - 1;
          for (let i = entryRound; i < finalIdx; i++) cupPrize += meta.roundPrize[i];
        } else if (isEuropean) {
          // European runner-up: all round prizes (they reached every round)
          const rounds = CUP_ROUND_PRIZE[cupId] ?? {};
          for (const prize of Object.values(rounds)) cupPrize += prize;
        }

      } else if (state.status === 'eliminated' || state.status === 'active') {
        if (cupId === 'fa_cup' && meta?.roundPrize) {
          // FA Cup: pay prizes for rounds actually won
          const entryRound = meta.entryRound?.[userLeague ?? 'Premier League'] ?? 0;
          const roundsWon  = Math.max(0, roundsPlayed - entryRound);
          for (let i = entryRound; i < entryRound + roundsWon && i < meta.roundPrize.length; i++) {
            cupPrize += meta.roundPrize[i];
          }
        } else if (isEuropean) {
          // European: pay round prizes for each stage reached (roundIndex = stages completed)
          // roundIndex 0 = league phase only, 1 = R16, 2 = QF, 3 = SF, 4 = Final (winner/ru above)
          const rounds = CUP_ROUND_PRIZE[cupId] ?? {};
          for (let i = 0; i < roundsPlayed && i < Object.keys(rounds).length; i++) {
            cupPrize += rounds[i] ?? 0;
          }
        } else if (roundsPlayed >= 3) {
          cupPrize += CUP_RUN_PRIZE[cupId] ?? 0;
        }
      }
    }
  }
  return leaguePrize + cupPrize;
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
  const prizeMoney = calculatePrizeMoney(userPosition, save.cups, save.userLeague);
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

  // ── Return all loan players to their parent clubs ─────────────
  // Must run before aging so returned players age under their parent club's ownership.
  // Clears all loan metadata — players start the new season fully unencumbered.
  const loanReturnUpdates = players
    .filter(p => p.onLoan && p.loanOriginalTeamId)
    .map(p => ({
      ...p,
      teamId:             p.loanOriginalTeamId,
      onLoan:             false,
      loanedFrom:         null,
      loanedTo:           null,
      loanOriginalTeamId: null,
      loanSeason:         null,
      loanRecallable:     false,
    }));
  if (loanReturnUpdates.length) {
    await putPlayersBulk(loanReturnUpdates);
    // Merge returned players back into the players array so aging sees correct teamIds
    const returnMap = new Map(loanReturnUpdates.map(p => [p.id, p]));
    for (let i = 0; i < players.length; i++) {
      if (returnMap.has(players[i].id)) players[i] = returnMap.get(players[i].id);
    }
  }

  // ── Age all players + resolve expiring contracts ───────────
  // currentYear is the season that's ending; nextYearForContracts anchors
  // any renewal/backfill so a fresh deal always runs into the future.
  const currentYear         = parseInt((save.season || '').split('/')[0]) || 0;
  const nextYearForContracts = currentYear + 1;
  const expiredContracts    = []; // for the season summary — user's own departures only

  const agedPlayers = players.map(p => {
    // Apply stat decline for aging players before bumping age
    const declined = applyAgingDecline(p);

    let teamId         = declined.teamId;
    let contractExpiry = declined.contractExpiry;
    if (teamId !== 'free_agents') {
      if (contractExpiry == null) {
        // Backfill for a save created before contracts existed — never an
        // instant release, just a fresh-looking deal from here on.
        contractExpiry = nextYearForContracts + Math.floor(Math.random() * 3);
      } else if (contractExpiry <= currentYear) {
        if (teamId === save.userTeamId) {
          // Not renewed in time — a real consequence, not an auto-renewal.
          expiredContracts.push({ id: declined.id, name: declined.name, position: declined.position });
          teamId = 'free_agents';
          contractExpiry = null;
        } else {
          // AI clubs self-manage: mostly renew, more likely to let older
          // players go rather than run an empty squad slot.
          const releaseChance = Math.min(0.7, 0.15 + (declined.age >= 33 ? 0.25 : declined.age >= 30 ? 0.10 : 0));
          if (Math.random() < releaseChance) {
            teamId = 'free_agents';
            contractExpiry = null;
          } else {
            contractExpiry = nextYearForContracts + 2 + Math.floor(Math.random() * 2);
          }
        }
      }
    }

    return {
      ...declined,
      teamId,
      contractExpiry,
      age:              (declined.age ?? 22) + 1,
      value:            agingValueAdjust(declined),
      goals:            0,
      assists:          0,
      cleanSheets:      0,
      form:             50,
      fitness:          100,
      // Clear all injury state between seasons
      injured:          false,
      injuryGWsLeft:    0,
      injuryGWsTotal:   0,
      injuryName:       null,
      injuryType:       null,
      // Reset transfer eligibility for new season
      signedThisSeason: false,
    };
  });
  await putPlayersBulk(agedPlayers);
  summary.expiredContracts = expiredContracts;
  if (expiredContracts.length) {
    // A squad unsettled by losing players for nothing — small dip, not a crisis.
    const teamNow = await getTeam(save.userTeamId);
    if (teamNow) await putTeam({ ...teamNow, morale: bumpMorale(teamNow.morale, -2 * expiredContracts.length) });
  }

  // ── Retire players aged 36+ ─────────────────────────────────
  // Players who have turned 36 after aging retire from the game.
  // A small chance (15%) lets legendary players (rating 80+) hang on one more year.
  const retirees = agedPlayers.filter(p => {
    if (p.age < 36) return false;
    // Elite veterans can delay retirement by 1 year
    const rating = _retirePrimaryRating(p);
    if (p.age === 36 && rating >= 80 && Math.random() < 0.15) return false;
    if (p.age === 36 && rating >= 75 && Math.random() < 0.08) return false;
    return true;
  });
  const retireIds = retirees.map(p => p.id);
  if (retireIds.length > 0) {
    await deletePlayersBulk(retireIds);
  }
  // Track retirements for user's team
  const userRetirees = retirees.filter(p => p.teamId === save.userTeamId);
  summary.retirements = userRetirees.map(p => ({ name: p.name, age: p.age, position: p.position }));

  // ── Youth academy intake ───────────────────────────────────
  const allTeamsForAcademy = await getAllTeams();
  const newYouthCohort = await runYouthIntake(save, allTeamsForAcademy);
  // Cohort will be stored in the newSave below

  // ── Process promotion/relegation and European qualification ─
  const leagueChanges = await processLeagueChanges(sorted, [], save.userTeamId);
  summary.leagueChanges = leagueChanges;

  // ── Evaluate the board objective the season just ended against ──
  const objectiveResult = evaluateBoardObjective(save.boardObjective, userPosition, sorted.length, leagueChanges.userRelInfo?.relegated ?? false);
  const newJobSecurity  = nextJobSecurity(save.jobSecurity, objectiveResult.met, objectiveResult.margin);
  const sacked          = newJobSecurity <= 0;
  summary.boardObjective = save.boardObjective ?? null;
  summary.objectiveMet   = objectiveResult.met;
  summary.jobSecurity    = newJobSecurity;
  summary.sacked         = sacked;

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
  const nextTotalGWs    = (nextLeagueSize - 1) * 2;

  const newFixtures  = generateLeagueFixtures(leagueTeamsNext.map(t => t.id), nextYear);
  const newStandings = leagueTeamsNext.map(t => blankStandingRow(t));

  await replaceAllFixtures(newFixtures);
  await replaceAllStandings(newStandings);

  // Determine cups from correct national competition for new league + position
  // If the user changed leagues (promotion/relegation), they don't qualify for
  // European cups based on their old league position — only domestic cups.
  const leagueChanged = userNewLeague !== (save.userLeague ?? 'Premier League');
  const userPosForCups = leagueChanged ? 99 : sorted.findIndex(r => r.teamId === save.userTeamId) + 1;
  const newCupIds      = assignCupsFromPosition(userPosForCups, userNewLeague, save.cups ?? {});
  const newCups        = buildInitialCupState(newCupIds, save.userTeamId, userNewLeague);

  // A sacked manager starts the next job fresh — a new baseline of trust
  // rather than carrying a season's worth of grudges into a new dugout.
  const nextBoardObjective = generateBoardObjective(userTeamUpdated, userNewLeague);

  const newSave = {
    ...save,
    currentGameweek: 1,
    totalGameweeks:  nextTotalGWs,
    currentDate:     new Date(nextYear, 7, 9).toISOString(),
    season:          nextSeason,
    userLeague:      userNewLeague,
    cups:            newCups,
    lineup:          save.lineup ?? null,
    formation:       save.formation ?? '4-3-3',
    youthCohort:     newYouthCohort,
    boardObjective:  nextBoardObjective,
    jobSecurity:     sacked ? 65 : newJobSecurity,
    sacked,
    inboundOffers:   [],
    collapsedDeals:  [],
  };
  await putSave(newSave);

  return { summary, leagueWinner, newSave, prizeMoney, leagueChanges, newYouthCohort };
}

// agingValueAdjust is provided by potential.js (imported as agingValueAdjust)
// applyAgingDecline is provided by potential.js (imported as applyAgingDecline)

// ─── Inline primary rating for retirement check ──────────────
export function _retirePrimaryRating(p) {
  const pos = p.position;
  if (['ST','CF','RW','LW','CAM'].includes(pos)) return p.attack;
  if (['CM','CDM','RM','LM'].includes(pos))       return p.midfield;
  if (['CB','RB','LB'].includes(pos))             return p.defence;
  return p.goalkeeping;
}

export function buildSeasonSummary(save, sorted, players, userPosition) {
  return {
    season:     save.season,
    userLeague: save.userLeague ?? 'Premier League',
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

export function resetCups(old) {
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

// ─── Board objectives & job security ──────────────────────────
// One objective per season, set from the club's reputation relative to its
// league. Promotion leagues (Championship/League One/League Two) get a
// promotion/play-off/survival ladder; every other league (Premier League
// plus the 5 single-tier top flights) gets a title/Europe/top-half/survival
// ladder. League Two has no relegation, so its floor is "mid-table", not
// "avoid relegation".
export function generateBoardObjective(team, league) {
  const rep = team?.reputation ?? 65;
  const promotionLeagues = new Set(['Championship', 'League One', 'League Two']);
  if (promotionLeagues.has(league)) {
    if (rep >= 75) return { id: 'promotion', label: 'Win promotion', kind: 'position', target: 2 };
    if (rep >= 62) return { id: 'playoffs', label: 'Push for the play-offs', kind: 'position', target: 6 };
    if (league === 'League Two') return { id: 'consolidate', label: 'Finish in mid-table', kind: 'position', target: 12 };
    return { id: 'avoid_relegation', label: 'Avoid relegation', kind: 'avoid_relegation' };
  }
  if (rep >= 85) return { id: 'title', label: 'Win the league', kind: 'position', target: 1 };
  if (rep >= 75) return { id: 'europe', label: 'Qualify for Europe', kind: 'position', target: 7 };
  if (rep >= 55) return { id: 'top_half', label: 'Finish in the top half', kind: 'top_half' };
  return { id: 'avoid_relegation', label: 'Avoid relegation', kind: 'avoid_relegation' };
}

// Returns { met, margin } — margin is positive when comfortably clear of the
// target, negative when short of it, used to scale how big the jobSecurity
// swing is (just scraping it or missing it narrowly moves the needle less
// than a landslide title or a relegation disaster).
export function evaluateBoardObjective(objective, finalPosition, totalTeams, wasRelegated) {
  if (!objective) return { met: true, margin: 0 };
  if (objective.kind === 'avoid_relegation') return { met: !wasRelegated, margin: wasRelegated ? -3 : 3 };
  if (objective.kind === 'top_half') {
    const mid = Math.ceil((totalTeams || 20) / 2);
    return { met: finalPosition <= mid, margin: mid - finalPosition };
  }
  return { met: finalPosition <= objective.target, margin: objective.target - finalPosition };
}

// jobSecurity is 0-100. Missing the objective always costs more than
// meeting it gains, same as a real board — capped either way so one wild
// season can't swing it from 0 to 100.
export function nextJobSecurity(current, met, margin) {
  const cur = current ?? 65;
  const delta = met
    ? 12 + Math.min(18, Math.max(0, margin) * 2)
    : -18 - Math.min(22, Math.max(0, -margin) * 2);
  return Math.max(0, Math.min(100, Math.round(cur + delta)));
}

/**
 * Every club's full squad wage bill comes out of its transfer budget once
 * per gameweek, for the user and every AI club alike. `wage` is already a
 * weekly figure (see youthAcademy.js / transfers.js's loan-wage math).
 * Players out on loan are skipped — the loan club already prepaid their
 * projected wages in full at signing (transfers.js's _loanWageCost), so
 * charging them again here would double-bill it.
 */
export async function payWeeklyWages() {
  // Re-fetch rather than accept a snapshot — this runs after AI transfers/
  // loans have already written fresh budgets to the DB this same gameweek.
  const [allTeams, allPlayers] = await Promise.all([getAllTeams(), getAllPlayers()]);
  const billByTeam = new Map();
  for (const p of allPlayers) {
    if (!p.teamId || p.onLoan) continue;
    billByTeam.set(p.teamId, (billByTeam.get(p.teamId) ?? 0) + (p.wage ?? 0));
  }
  for (const t of allTeams) {
    const bill = billByTeam.get(t.id) ?? 0;
    if (bill <= 0) continue;
    await putTeam({ ...t, budget: (t.budget ?? 0) - bill });
  }
}

