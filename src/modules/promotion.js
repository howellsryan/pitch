import { getAllPlayers, getAllTeams, getSave, putTeam } from './db.js';
import { LEAGUE_DOMESTIC_CUPS } from './cups.js';

/** modules/promotion.js — End-of-season promotion/relegation, playoffs and European qualification */

export function getEuropeanQualifiers(sortedStandings) {
  return {
    ucl:   sortedStandings.slice(0, 4).map(r => r.teamId),
    uel:   sortedStandings.slice(4, 6).map(r => r.teamId),
    uecl: [sortedStandings[6]?.teamId].filter(Boolean),
    relegated: sortedStandings.slice(-3).map(r => r.teamId),
  };
}

export function getLeagueOutcome24(sortedStandings) {
  return {
    autoPromoted: sortedStandings.slice(0, 2).map(r => r.teamId),
    playoffTeams: sortedStandings.slice(2, 6).map(r => r.teamId),
    relegated:    sortedStandings.slice(-3).map(r => r.teamId),
  };
}

export function getChampionshipOutcome(sortedStandings) {
  const o = getLeagueOutcome24(sortedStandings);
  return { promoted:[...o.autoPromoted], playoffTeams:o.playoffTeams, relegated:o.relegated };
}

export function simulatePlayoffTie(team1Id, team2Id, allTeams, allPlayers) {
  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const t1 = teamsById.get(team1Id);
  const t2 = teamsById.get(team2Id);
  const str1 = (t1?.reputation ?? 65) + (Math.random() * 16 - 8);
  const str2 = (t2?.reputation ?? 65) + (Math.random() * 16 - 8);
  const leg1Home = simulatePlayoffLeg(str1, str2);
  const leg2Home = simulatePlayoffLeg(str2, str1);
  const agg1 = leg1Home.home + leg2Home.away;
  const agg2 = leg1Home.away + leg2Home.home;
  let winnerId;
  if (agg1 > agg2) winnerId = team1Id;
  else if (agg2 > agg1) winnerId = team2Id;
  else winnerId = Math.random() < 0.5 ? team1Id : team2Id;
  return {
    winnerId,
    team1:{ id:team1Id, name:t1?.name ?? team1Id, crest:t1?.crest ?? '⚽' },
    team2:{ id:team2Id, name:t2?.name ?? team2Id, crest:t2?.crest ?? '⚽' },
    leg1:{ home:leg1Home.home, away:leg1Home.away },
    leg2:{ home:leg2Home.home, away:leg2Home.away },
    agg:{ team1:agg1, team2:agg2 },
    penalties:agg1 === agg2,
  };
}

export function simulatePlayoffLeg(homeStr, awayStr) {
  const homeAdv = 4;
  const hExpected = Math.max(0.3, (homeStr + homeAdv) / 55);
  const aExpected = Math.max(0.2, awayStr / 60);
  return { home:poissonGoals(hExpected), away:poissonGoals(aExpected) };
}

export function simulatePlayoffFinal(team1Id, team2Id, allTeams) {
  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const t1 = teamsById.get(team1Id);
  const t2 = teamsById.get(team2Id);
  const str1 = (t1?.reputation ?? 65) + (Math.random() * 14 - 7);
  const str2 = (t2?.reputation ?? 65) + (Math.random() * 14 - 7);
  const g1 = poissonGoals(Math.max(0.3, str1 / 58));
  const g2 = poissonGoals(Math.max(0.3, str2 / 58));
  let winnerId;
  if (g1 > g2) winnerId = team1Id;
  else if (g2 > g1) winnerId = team2Id;
  else winnerId = Math.random() < 0.5 ? team1Id : team2Id;
  return {
    winnerId,
    team1:{ id:team1Id, name:t1?.name ?? team1Id, crest:t1?.crest ?? '⚽' },
    team2:{ id:team2Id, name:t2?.name ?? team2Id, crest:t2?.crest ?? '⚽' },
    score:{ team1:g1, team2:g2 },
    penalties:g1 === g2,
  };
}

export function poissonGoals(lambda) {
  let L = Math.exp(-lambda), k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

export function runPlayoffs(playoffTeamIds, allTeams, allPlayers) {
  const semi1 = simulatePlayoffTie(playoffTeamIds[0], playoffTeamIds[3], allTeams, allPlayers);
  const semi2 = simulatePlayoffTie(playoffTeamIds[1], playoffTeamIds[2], allTeams, allPlayers);
  const final = simulatePlayoffFinal(semi1.winnerId, semi2.winnerId, allTeams);
  return { promotedViaPlayoff:final.winnerId, playoffResults:{ semi1, semi2, final } };
}

function sortLeagueRows(rows) {
  return [...rows].sort((a, b) =>
    (b.points ?? 0) - (a.points ?? 0) ||
    (b.goalDifference ?? 0) - (a.goalDifference ?? 0) ||
    (b.goalsFor ?? 0) - (a.goalsFor ?? 0) ||
    String(a.teamName ?? '').localeCompare(String(b.teamName ?? ''))
  );
}

/**
 * P1 accepts the complete persisted world standings as the second argument.
 * Older callers may still omit it; only then do we use the historical
 * reputation fallback for leagues that are not the managed league.
 */
export async function processLeagueChanges(userLeagueStandings, worldStandings, userTeamId) {
  const allTeams = await getAllTeams();
  const allPlayers = await getAllPlayers();
  const byId = new Map(allTeams.map(t => [t.id, t]));
  const teamsByLeague = new Map();
  for (const team of allTeams) {
    const league = team.league ?? 'Premier League';
    if (!teamsByLeague.has(league)) teamsByLeague.set(league, []);
    teamsByLeague.get(league).push(team);
  }

  const userLeagueName = (await getSave())?.userLeague ?? 'Premier League';
  const persistedByLeague = new Map();
  if (Array.isArray(worldStandings) && worldStandings.length) {
    for (const row of worldStandings) {
      const league = row.league ?? byId.get(row.teamId)?.league ?? 'Premier League';
      if (!persistedByLeague.has(league)) persistedByLeague.set(league, []);
      persistedByLeague.get(league).push(row);
    }
  }

  function simulateStandings(teams) {
    return teams
      .map(t => ({ teamId:t.id, teamName:t.name, reputation:(t.reputation ?? 65) + (Math.random() * 10 - 5) }))
      .sort((a, b) => b.reputation - a.reputation);
  }

  const englishLeagues = ['Premier League', 'Championship', 'League One', 'League Two'];
  const leagueStandings = {};
  for (const league of englishLeagues) {
    const realRows = persistedByLeague.get(league);
    if (realRows?.length) leagueStandings[league] = sortLeagueRows(realRows);
    else if (league === userLeagueName) leagueStandings[league] = userLeagueStandings;
    else {
      const leagueTeams = teamsByLeague.get(league) ?? [];
      if (leagueTeams.length) leagueStandings[league] = simulateStandings(leagueTeams);
    }
  }

  const changes = {
    movements:[],
    playoffResults:{},
    userRelInfo:{ relegated:false, promoted:false, promotedViaPlayoff:false, ucl:false, uel:false, uecl:false },
  };

  const plStandings = leagueStandings['Premier League'];
  if (plStandings && plStandings.length >= 20) {
    const plQual = getEuropeanQualifiers(plStandings);
    changes.ucl = plQual.ucl;
    changes.uel = plQual.uel;
    changes.uecl = plQual.uecl;
    changes.relegated = plQual.relegated;
    for (const tid of plQual.relegated) changes.movements.push({ teamId:tid, from:'Premier League', to:'Championship', reason:'Relegated' });
    if (plQual.ucl.includes(userTeamId)) changes.userRelInfo.ucl = true;
    if (plQual.uel.includes(userTeamId)) changes.userRelInfo.uel = true;
    if (plQual.uecl.includes(userTeamId)) changes.userRelInfo.uecl = true;
    if (plQual.relegated.includes(userTeamId)) changes.userRelInfo.relegated = true;
  }

  const champStandings = leagueStandings['Championship'];
  if (champStandings && champStandings.length >= 6) {
    const champOut = getLeagueOutcome24(champStandings);
    champOut.autoPromoted.forEach((tid, idx) => {
      const reason = idx === 0 ? 'Champions' : 'Auto Promoted';
      changes.movements.push({ teamId:tid, from:'Championship', to:'Premier League', reason });
      if (tid === userTeamId) changes.userRelInfo.promoted = true;
    });
    const { promotedViaPlayoff, playoffResults } = runPlayoffs(champOut.playoffTeams, allTeams, allPlayers);
    changes.movements.push({ teamId:promotedViaPlayoff, from:'Championship', to:'Premier League', reason:'Playoff Winner' });
    changes.playoffResults['Championship'] = playoffResults;
    if (promotedViaPlayoff === userTeamId) {
      changes.userRelInfo.promoted = true;
      changes.userRelInfo.promotedViaPlayoff = true;
    }
    changes.promoted = [...champOut.autoPromoted, promotedViaPlayoff];
    for (const tid of champOut.relegated) {
      changes.movements.push({ teamId:tid, from:'Championship', to:'League One', reason:'Relegated' });
      if (tid === userTeamId) changes.userRelInfo.relegated = true;
    }
  }

  const l1Standings = leagueStandings['League One'];
  if (l1Standings && l1Standings.length >= 6) {
    const l1Out = getLeagueOutcome24(l1Standings);
    l1Out.autoPromoted.forEach((tid, idx) => {
      const reason = idx === 0 ? 'Champions' : 'Auto Promoted';
      changes.movements.push({ teamId:tid, from:'League One', to:'Championship', reason });
      if (tid === userTeamId) changes.userRelInfo.promoted = true;
    });
    const { promotedViaPlayoff, playoffResults } = runPlayoffs(l1Out.playoffTeams, allTeams, allPlayers);
    changes.movements.push({ teamId:promotedViaPlayoff, from:'League One', to:'Championship', reason:'Playoff Winner' });
    changes.playoffResults['League One'] = playoffResults;
    if (promotedViaPlayoff === userTeamId) {
      changes.userRelInfo.promoted = true;
      changes.userRelInfo.promotedViaPlayoff = true;
    }
    for (const tid of l1Out.relegated) {
      changes.movements.push({ teamId:tid, from:'League One', to:'League Two', reason:'Relegated' });
      if (tid === userTeamId) changes.userRelInfo.relegated = true;
    }
  }

  const l2Standings = leagueStandings['League Two'];
  if (l2Standings && l2Standings.length >= 6) {
    const l2Out = getLeagueOutcome24(l2Standings);
    l2Out.autoPromoted.forEach((tid, idx) => {
      const reason = idx === 0 ? 'Champions' : 'Auto Promoted';
      changes.movements.push({ teamId:tid, from:'League Two', to:'League One', reason });
      if (tid === userTeamId) changes.userRelInfo.promoted = true;
    });
    const { promotedViaPlayoff, playoffResults } = runPlayoffs(l2Out.playoffTeams, allTeams, allPlayers);
    changes.movements.push({ teamId:promotedViaPlayoff, from:'League Two', to:'League One', reason:'Playoff Winner' });
    changes.playoffResults['League Two'] = playoffResults;
    if (promotedViaPlayoff === userTeamId) {
      changes.userRelInfo.promoted = true;
      changes.userRelInfo.promotedViaPlayoff = true;
    }
  }

  const repChanges = {
    'Premier League':{ champ:10, up:5, down:-10, maxUp:85, minDown:60 },
    'Championship':{ champ:10, up:5, down:-10, maxUp:74, minDown:50 },
    'League One':{ champ:10, up:5, down:-10, maxUp:64, minDown:42 },
    'League Two':{ champ:10, up:5, down:-10, maxUp:56, minDown:35 },
  };

  for (const movement of changes.movements) {
    const team = byId.get(movement.teamId);
    if (!team) continue;
    const rc = repChanges[movement.to] ?? { champ:10, up:5, down:-10, maxUp:80, minDown:50 };
    let newRep;
    if (movement.reason === 'Champions') newRep = Math.min(rc.maxUp, (team.reputation ?? 65) + rc.champ);
    else if (movement.reason === 'Auto Promoted' || movement.reason === 'Playoff Winner') newRep = Math.min(rc.maxUp, (team.reputation ?? 65) + rc.up);
    else newRep = Math.max(rc.minDown, (team.reputation ?? 65) + rc.down);
    await putTeam({ ...team, league:movement.to, reputation:newRep });
  }
  return changes;
}

export function assignCupsFromPosition(position, userLeague, cupState) {
  const domestic = LEAGUE_DOMESTIC_CUPS[userLeague] ?? ['fa_cup', 'league_cup'];
  const cups = [...domestic];
  const topTierLeagues = new Set(['Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1', 'Eredivisie']);
  if (!topTierLeagues.has(userLeague)) return cups;
  if (position <= 4) cups.push('ucl');
  else if (position <= 6) cups.push('uel');
  else if (position === 7) cups.push('uecl');
  return cups;
}

export function getZoneInfo(position, totalTeams = 20) {
  if (totalTeams === 20) {
    if (position <= 4) return { zone:'ucl', color:'#3b82f6', label:'Champions League' };
    if (position <= 6) return { zone:'uel', color:'#f97316', label:'Europa League' };
    if (position === 7) return { zone:'uecl', color:'#22c55e', label:'Conference League' };
    if (position >= 18) return { zone:'rel', color:'#e84855', label:'Relegation' };
    if (position >= 15) return { zone:'risk', color:'#f5c842', label:'Danger Zone' };
  } else if (totalTeams === 24) {
    if (position <= 2) return { zone:'auto', color:'#3b82f6', label:'Automatic Promotion' };
    if (position <= 6) return { zone:'playoff', color:'#22c55e', label:'Play-off Place' };
    if (position >= 22) return { zone:'rel', color:'#e84855', label:'Relegation' };
  } else if (totalTeams === 18) {
    if (position <= 4) return { zone:'ucl', color:'#3b82f6', label:'Champions League' };
    if (position <= 6) return { zone:'uel', color:'#f97316', label:'Europa League' };
    if (position === 7) return { zone:'uecl', color:'#22c55e', label:'Conference League' };
    if (position >= 17) return { zone:'rel', color:'#e84855', label:'Relegation' };
    if (position >= 15) return { zone:'risk', color:'#f5c842', label:'Danger Zone' };
  }
  return { zone:'mid', color:'transparent', label:'' };
}
