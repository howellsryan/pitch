import { getAllPlayers, getAllTeams, getSave, putTeam } from './db.js';
import { LEAGUE_DOMESTIC_CUPS } from './cups.js';

/** modules/promotion.js — End-of-season promotion/relegation, playoffs and European qualification */

// ─── Determine European qualification from PL table ──────────
export function getEuropeanQualifiers(sortedStandings) {
  return {
    ucl:   sortedStandings.slice(0, 4).map(r => r.teamId),  // Top 4
    uel:   sortedStandings.slice(4, 6).map(r => r.teamId),  // 5th-6th
    uecl: [sortedStandings[6]?.teamId].filter(Boolean),     // 7th
    relegated: sortedStandings.slice(-3).map(r => r.teamId), // Bottom 3
  };
}

// ─── Determine 24-team league outcome (Championship / L1 / L2) ──
// Top 2 auto-promoted, 3-6 playoff, bottom 3 relegated
export function getLeagueOutcome24(sortedStandings) {
  return {
    autoPromoted:    sortedStandings.slice(0, 2).map(r => r.teamId),   // 1st, 2nd
    playoffTeams:    sortedStandings.slice(2, 6).map(r => r.teamId),   // 3rd-6th
    relegated:       sortedStandings.slice(-3).map(r => r.teamId),     // Bottom 3
  };
}

// Keep old name as alias for backward compat with validate.js
export function getChampionshipOutcome(sortedStandings) {
  const o = getLeagueOutcome24(sortedStandings);
  return { promoted: [...o.autoPromoted], playoffTeams: o.playoffTeams, relegated: o.relegated };
}

// ─── Simulate a two-legged playoff semi-final ────────────────
// Returns the winner's teamId and a description of the tie
export function simulatePlayoffTie(team1Id, team2Id, allTeams, allPlayers) {
  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const t1 = teamsById.get(team1Id);
  const t2 = teamsById.get(team2Id);

  // Use team reputation as strength proxy
  const str1 = (t1?.reputation ?? 65) + (Math.random() * 16 - 8);
  const str2 = (t2?.reputation ?? 65) + (Math.random() * 16 - 8);

  // Leg 1: team1 at home
  const leg1Home = simulatePlayoffLeg(str1, str2);
  // Leg 2: team2 at home
  const leg2Home = simulatePlayoffLeg(str2, str1);

  const agg1 = leg1Home.home + leg2Home.away;
  const agg2 = leg1Home.away + leg2Home.home;

  let winnerId;
  if (agg1 > agg2) winnerId = team1Id;
  else if (agg2 > agg1) winnerId = team2Id;
  else {
    // Aggregate level — away goals rule then penalties
    const awayGoals1 = leg2Home.away; // team1's away goals (scored in leg 2)
    const awayGoals2 = leg1Home.away; // team2's away goals (scored in leg 1)
    if (awayGoals1 > awayGoals2) winnerId = team1Id;
    else if (awayGoals2 > awayGoals1) winnerId = team2Id;
    else winnerId = Math.random() < 0.5 ? team1Id : team2Id; // Penalties
  }

  return {
    winnerId,
    team1: { id: team1Id, name: t1?.name ?? team1Id, crest: t1?.crest ?? '⚽' },
    team2: { id: team2Id, name: t2?.name ?? team2Id, crest: t2?.crest ?? '⚽' },
    leg1: { home: leg1Home.home, away: leg1Home.away },
    leg2: { home: leg2Home.home, away: leg2Home.away },
    agg: { team1: agg1, team2: agg2 },
    penalties: agg1 === agg2,
  };
}

export function simulatePlayoffLeg(homeStr, awayStr) {
  // Simple goal model based on relative strength
  const homeAdv = 4; // home advantage
  const hExpected = Math.max(0.3, (homeStr + homeAdv) / 55);
  const aExpected = Math.max(0.2, awayStr / 60);
  return {
    home: poissonGoals(hExpected),
    away: poissonGoals(aExpected),
  };
}

export function simulatePlayoffFinal(team1Id, team2Id, allTeams) {
  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const t1 = teamsById.get(team1Id);
  const t2 = teamsById.get(team2Id);
  const str1 = (t1?.reputation ?? 65) + (Math.random() * 14 - 7);
  const str2 = (t2?.reputation ?? 65) + (Math.random() * 14 - 7);
  // Neutral venue, no home advantage
  const g1 = poissonGoals(Math.max(0.3, str1 / 58));
  const g2 = poissonGoals(Math.max(0.3, str2 / 58));
  let winnerId;
  if (g1 > g2) winnerId = team1Id;
  else if (g2 > g1) winnerId = team2Id;
  else winnerId = Math.random() < 0.5 ? team1Id : team2Id; // Penalties
  return {
    winnerId,
    team1: { id: team1Id, name: t1?.name ?? team1Id, crest: t1?.crest ?? '⚽' },
    team2: { id: team2Id, name: t2?.name ?? team2Id, crest: t2?.crest ?? '⚽' },
    score: { team1: g1, team2: g2 },
    penalties: g1 === g2,
  };
}

export function poissonGoals(lambda) {
  // Poisson random variable for goal scoring
  let L = Math.exp(-lambda), k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

// ─── Run full playoffs for a 24-team league ──────────────────
// playoffTeams: [3rd, 4th, 5th, 6th] by league position
// Semi-finals: 3rd vs 6th, 4th vs 5th (two legs each)
// Final: winners play one match (neutral venue)
// Returns { promotedViaPlayoff, playoffResults }
export function runPlayoffs(playoffTeamIds, allTeams, allPlayers) {
  // Semi-final 1: 3rd vs 6th (3rd has home advantage in 2nd leg)
  const semi1 = simulatePlayoffTie(playoffTeamIds[0], playoffTeamIds[3], allTeams, allPlayers);
  // Semi-final 2: 4th vs 5th
  const semi2 = simulatePlayoffTie(playoffTeamIds[1], playoffTeamIds[2], allTeams, allPlayers);
  // Final
  const final = simulatePlayoffFinal(semi1.winnerId, semi2.winnerId, allTeams);

  return {
    promotedViaPlayoff: final.winnerId,
    playoffResults: {
      semi1,
      semi2,
      final,
    },
  };
}

// ─── Process all English league promotion/relegation ──────────
// Handles: PL↔Championship, Championship↔League One, League One↔League Two
export async function processLeagueChanges(userLeagueStandings, _unused, userTeamId) {
  const allTeams  = await getAllTeams();
  const allPlayers = await getAllPlayers();
  const byId      = new Map(allTeams.map(t => [t.id, t]));

  // Build standings per league from the teams in the DB
  const teamsByLeague = new Map();
  for (const t of allTeams) {
    const lg = t.league ?? 'Premier League';
    if (!teamsByLeague.has(lg)) teamsByLeague.set(lg, []);
    teamsByLeague.get(lg).push(t);
  }

  const userLeagueName = (await getSave())?.userLeague ?? 'Premier League';

  // Helper: generate simulated standings for a league based on reputation
  function simulateStandings(teams) {
    return teams
      .map(t => ({
        teamId: t.id,
        teamName: t.name,
        reputation: (t.reputation ?? 65) + (Math.random() * 10 - 5),
      }))
      .sort((a, b) => b.reputation - a.reputation);
  }

  // Get standings for each English league
  const englishLeagues = ['Premier League', 'Championship', 'League One', 'League Two'];
  const leagueStandings = {};

  for (const lg of englishLeagues) {
    if (lg === userLeagueName) {
      leagueStandings[lg] = userLeagueStandings;
    } else {
      const lgTeams = teamsByLeague.get(lg) ?? [];
      if (lgTeams.length > 0) {
        leagueStandings[lg] = simulateStandings(lgTeams);
      }
    }
  }

  const changes = {
    movements: [],       // { teamId, from, to, reason }
    playoffResults: {},  // keyed by league
    userRelInfo: {
      relegated: false,
      promoted: false,
      promotedViaPlayoff: false,
      ucl: false,
      uel: false,
      uecl: false,
    },
  };

  // ── PL European spots + relegation ─────────────────────────
  const plStandings = leagueStandings['Premier League'];
  if (plStandings && plStandings.length >= 20) {
    const plQual = getEuropeanQualifiers(plStandings);
    changes.ucl  = plQual.ucl;
    changes.uel  = plQual.uel;
    changes.uecl = plQual.uecl;
    changes.relegated = plQual.relegated;

    // PL bottom 3 → Championship
    for (const tid of plQual.relegated) {
      changes.movements.push({ teamId: tid, from: 'Premier League', to: 'Championship', reason: 'Relegated' });
    }
    if (plQual.ucl.includes(userTeamId)) changes.userRelInfo.ucl = true;
    if (plQual.uel.includes(userTeamId)) changes.userRelInfo.uel = true;
    if (plQual.uecl.includes(userTeamId)) changes.userRelInfo.uecl = true;
    if (plQual.relegated.includes(userTeamId)) changes.userRelInfo.relegated = true;
  }

  // ── Championship: top 2 auto up, 3-6 playoff, bottom 3 down ─
  const champStandings = leagueStandings['Championship'];
  if (champStandings && champStandings.length >= 6) {
    const champOut = getLeagueOutcome24(champStandings);

    // Auto promotion (1st, 2nd)
    champOut.autoPromoted.forEach((tid, idx) => {
      const reason = idx === 0 ? 'Champions' : 'Auto Promoted';
      changes.movements.push({ teamId: tid, from: 'Championship', to: 'Premier League', reason });
      if (tid === userTeamId) changes.userRelInfo.promoted = true;
    });

    // Playoffs (3rd-6th)
    const { promotedViaPlayoff, playoffResults } = runPlayoffs(champOut.playoffTeams, allTeams, allPlayers);
    changes.movements.push({ teamId: promotedViaPlayoff, from: 'Championship', to: 'Premier League', reason: 'Playoff Winner' });
    changes.playoffResults['Championship'] = playoffResults;
    if (promotedViaPlayoff === userTeamId) {
      changes.userRelInfo.promoted = true;
      changes.userRelInfo.promotedViaPlayoff = true;
    }
    changes.promoted = [...champOut.autoPromoted, promotedViaPlayoff];

    // Relegation (bottom 3)
    for (const tid of champOut.relegated) {
      changes.movements.push({ teamId: tid, from: 'Championship', to: 'League One', reason: 'Relegated' });
      if (tid === userTeamId) changes.userRelInfo.relegated = true;
    }
  }

  // ── League One: top 2 auto up, 3-6 playoff, bottom 3 down ──
  const l1Standings = leagueStandings['League One'];
  if (l1Standings && l1Standings.length >= 6) {
    const l1Out = getLeagueOutcome24(l1Standings);

    l1Out.autoPromoted.forEach((tid, idx) => {
      const reason = idx === 0 ? 'Champions' : 'Auto Promoted';
      changes.movements.push({ teamId: tid, from: 'League One', to: 'Championship', reason });
      if (tid === userTeamId) changes.userRelInfo.promoted = true;
    });

    const { promotedViaPlayoff, playoffResults } = runPlayoffs(l1Out.playoffTeams, allTeams, allPlayers);
    changes.movements.push({ teamId: promotedViaPlayoff, from: 'League One', to: 'Championship', reason: 'Playoff Winner' });
    changes.playoffResults['League One'] = playoffResults;
    if (promotedViaPlayoff === userTeamId) {
      changes.userRelInfo.promoted = true;
      changes.userRelInfo.promotedViaPlayoff = true;
    }

    for (const tid of l1Out.relegated) {
      changes.movements.push({ teamId: tid, from: 'League One', to: 'League Two', reason: 'Relegated' });
      if (tid === userTeamId) changes.userRelInfo.relegated = true;
    }
  }

  // ── League Two: top 2 auto up, 3-6 playoff, no relegation ──
  const l2Standings = leagueStandings['League Two'];
  if (l2Standings && l2Standings.length >= 6) {
    const l2Out = getLeagueOutcome24(l2Standings);

    l2Out.autoPromoted.forEach((tid, idx) => {
      const reason = idx === 0 ? 'Champions' : 'Auto Promoted';
      changes.movements.push({ teamId: tid, from: 'League Two', to: 'League One', reason });
      if (tid === userTeamId) changes.userRelInfo.promoted = true;
    });

    const { promotedViaPlayoff, playoffResults } = runPlayoffs(l2Out.playoffTeams, allTeams, allPlayers);
    changes.movements.push({ teamId: promotedViaPlayoff, from: 'League Two', to: 'League One', reason: 'Playoff Winner' });
    changes.playoffResults['League Two'] = playoffResults;
    if (promotedViaPlayoff === userTeamId) {
      changes.userRelInfo.promoted = true;
      changes.userRelInfo.promotedViaPlayoff = true;
    }
    // No relegation from League Two (no league below)
  }

  // ── Apply all team league changes ───────────────────────────
  // ── Apply all team league changes ───────────────────────────
  // Promotion rep gains are deliberately generous — a club rising through the
  // pyramid should be able to attract progressively better players each season.
  // Maxima are set just below the next tier's natural rep ceiling so promoted
  // clubs don't immediately compete with established top-flight sides.
  //
  // Champions (+10) > Runner-up / Playoff winner (+5) > Relegated (−10)
  const repChanges = {
    'Premier League':  { champ: 10, up: 5, down: -10, maxUp: 85, minDown: 60 },
    'Championship':    { champ: 10, up: 5, down: -10, maxUp: 74, minDown: 50 },
    'League One':      { champ: 10, up: 5, down: -10, maxUp: 64, minDown: 42 },
    'League Two':      { champ: 10, up: 5, down: -10, maxUp: 56, minDown: 35 },
  };

  for (const mv of changes.movements) {
    const t = byId.get(mv.teamId);
    if (!t) continue;
    const rc = repChanges[mv.to] ?? { champ: 10, up: 5, down: -10, maxUp: 80, minDown: 50 };
    let newRep;
    if (mv.reason === 'Champions') {
      newRep = Math.min(rc.maxUp, (t.reputation ?? 65) + rc.champ);
    } else if (mv.reason === 'Auto Promoted' || mv.reason === 'Playoff Winner') {
      newRep = Math.min(rc.maxUp, (t.reputation ?? 65) + rc.up);
    } else {
      // Relegated
      newRep = Math.max(rc.minDown, (t.reputation ?? 65) + rc.down);
    }
    await putTeam({ ...t, league: mv.to, reputation: newRep });
  }

  return changes;
}

// ─── Get user's European cup for next season ─────────────────
export function assignCupsFromPosition(position, userLeague, cupState) {
  const domestic = LEAGUE_DOMESTIC_CUPS[userLeague] ?? ['fa_cup', 'league_cup'];
  const cups = [...domestic];

  // Only top-tier leagues qualify for Europe via league position
  const topTierLeagues = new Set([
    'Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1', 'Eredivisie',
  ]);
  if (!topTierLeagues.has(userLeague)) return cups;

  if      (position <= 4) cups.push('ucl');
  else if (position <= 6) cups.push('uel');
  else if (position === 7) cups.push('uecl');

  return cups;
}

// ─── Relegation zone helper for UI ───────────────────────────
export function getZoneInfo(position, totalTeams = 20) {
  if (totalTeams === 20) { // PL
    if (position <= 4)  return { zone: 'ucl',   color: '#3b82f6', label: 'Champions League' };
    if (position <= 6)  return { zone: 'uel',   color: '#f97316', label: 'Europa League' };
    if (position === 7) return { zone: 'uecl',  color: '#22c55e', label: 'Conference League' };
    if (position >= 18) return { zone: 'rel',   color: '#e84855', label: 'Relegation' };
    if (position >= 15) return { zone: 'risk',  color: '#f5c842', label: 'Danger Zone' };
  } else if (totalTeams === 24) { // Championship / L1 / L2
    if (position <= 2)  return { zone: 'auto',  color: '#3b82f6', label: 'Automatic Promotion' };
    if (position <= 6)  return { zone: 'playoff',color: '#22c55e', label: 'Play-off Place' };
    if (position >= 22) return { zone: 'rel',   color: '#e84855', label: 'Relegation' };
  } else if (totalTeams === 18) { // Eredivisie / Bundesliga / Serie A / Ligue 1
    if (position <= 4)  return { zone: 'ucl',   color: '#3b82f6', label: 'Champions League' };
    if (position <= 6)  return { zone: 'uel',   color: '#f97316', label: 'Europa League' };
    if (position === 7) return { zone: 'uecl',  color: '#22c55e', label: 'Conference League' };
    if (position >= 17) return { zone: 'rel',   color: '#e84855', label: 'Relegation' };
    if (position >= 15) return { zone: 'risk',  color: '#f5c842', label: 'Danger Zone' };
  }
  return { zone: 'mid', color: 'transparent', label: '' };
}

