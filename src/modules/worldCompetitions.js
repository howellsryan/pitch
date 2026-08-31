import { compareLeaguePhaseRows, getCompetitionRules, isTwoLegRound } from './competitionRules.js';
import { pickAIFormation, simulateMatch } from './matchEngine.js';

/**
 * P1 background competition engine.
 *
 * The managed club keeps using gameweek.js's pending-event queue. This module
 * owns only non-user clubs, so it can never manufacture a second result for a
 * watched/quick-sim user match. Every generated match is persisted in the
 * save's current-season world competition ledger before player projections are
 * applied by worldRuntime.js.
 */
export const WORLD_COMPETITION_VERSION = 1;
export const WORLD_COMPETITION_BATCH_SIZE = 24;

const ENGLISH_LEAGUES = ['Premier League', 'Championship', 'League One', 'League Two'];
const TOP_FLIGHT_LEAGUES = new Set(['Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1', 'Eredivisie']);

const DOMESTIC_DEFINITIONS = [
  { id:'fa_cup', leagues:ENGLISH_LEAGUES },
  { id:'league_cup', leagues:ENGLISH_LEAGUES },
  { id:'copa_del_rey', leagues:['La Liga'] },
  { id:'supercopa', leagues:['La Liga'], invitationSize:4 },
  { id:'dfb_pokal', leagues:['Bundesliga'] },
  { id:'dfb_supercup', leagues:['Bundesliga'], invitationSize:2 },
  { id:'coppa_italia', leagues:['Serie A'] },
  { id:'supercoppa', leagues:['Serie A'], invitationSize:4 },
  { id:'coupe_de_france', leagues:['Ligue 1'] },
  { id:'trophee_des_champions', leagues:['Ligue 1'], invitationSize:2 },
  { id:'knvb_beker', leagues:['Eredivisie'] },
];

export const WORLD_DOMESTIC_COMPETITION_IDS = Object.freeze(DOMESTIC_DEFINITIONS.map(def => def.id));
export const WORLD_EUROPEAN_COMPETITION_IDS = Object.freeze(['ucl', 'uel', 'uecl']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueCompetitionTeams(values) {
  return [...new Set(values.filter(Boolean))];
}

function teamRep(team) {
  return Number(team?.reputation ?? 50);
}

function orderedByStrength(teams) {
  return [...teams].sort((a, b) => teamRep(b) - teamRep(a) || String(a.id).localeCompare(String(b.id)));
}

function entryRoundFor(cupId, team) {
  const rules = getCompetitionRules(cupId);
  return Math.max(0, Number(rules?.entryRound?.[team.league ?? 'Premier League'] ?? 0));
}

function progress(status, roundIndex = 0, roundName = null, phase = 'knockout') {
  return { status, roundIndex, roundName, phase };
}

function alignKnockoutState(state, currentGameweek) {
  if (currentGameweek <= 1) return state;
  const rules = getCompetitionRules(state.id);
  if (!rules?.roundGWs?.length) return state;
  let firstUpcoming = rules.roundGWs.findIndex(gw => gw >= currentGameweek);
  if (firstUpcoming < 0) {
    state.roundIndex = rules.roundGWs.length;
    state.activeTeamIds = [];
    return state;
  }
  if (firstUpcoming === 0) return state;

  // A lazily-created migration has no leg-one aggregate. If it first appears
  // during a second-leg week, align it to the following round instead of
  // creating a second leg with no canonical first-leg record.
  if (isTwoLegRound(state.id, rules.rounds?.[firstUpcoming], 2)) firstUpcoming += 1;
  state.roundIndex = firstUpcoming;
  const eligible = Object.entries(state.progressByTeam)
    .filter(([, item]) => (item.entryRound ?? 0) <= firstUpcoming)
    .map(([teamId]) => teamId);
  const targetSize = Math.max(2, Math.min(eligible.length, 2 ** Math.max(1, Math.ceil((rules.rounds.length - firstUpcoming) / 2))));
  state.activeTeamIds = eligible.slice(0, targetSize);
  for (const [teamId, item] of Object.entries(state.progressByTeam)) {
    if ((item.entryRound ?? 0) <= firstUpcoming && !state.activeTeamIds.includes(teamId)) {
      state.progressByTeam[teamId] = { ...item, status:'eliminated', roundIndex:firstUpcoming - 1, roundName:rules.rounds[firstUpcoming - 1] ?? null };
    }
  }
  return state;
}

function buildKnockoutState(def, teams, season, userTeamId, currentGameweek) {
  const rules = getCompetitionRules(def.id);
  let eligible = teams.filter(team => def.leagues.includes(team.league ?? 'Premier League') && team.id !== userTeamId);
  if (def.invitationSize) eligible = orderedByStrength(eligible).slice(0, def.invitationSize);
  else eligible = orderedByStrength(eligible);

  const entrantsByRound = {};
  const progressByTeam = {};
  for (const team of eligible) {
    const entryRound = def.invitationSize ? 0 : entryRoundFor(def.id, team);
    if (!entrantsByRound[entryRound]) entrantsByRound[entryRound] = [];
    entrantsByRound[entryRound].push(team.id);
    progressByTeam[team.id] = {
      ...progress(entryRound === 0 ? 'active' : 'waiting', entryRound, rules?.rounds?.[entryRound] ?? null),
      entryRound,
    };
  }

  return alignKnockoutState({
    id:def.id,
    format:'knockout',
    season,
    roundIndex:0,
    activeTeamIds:[...(entrantsByRound[0] ?? [])],
    entrantsByRound,
    pendingTies:[],
    pendingByes:[],
    progressByTeam,
    winnerId:null,
    runnerUpId:null,
    results:[],
    processedGameweeks:[],
  }, currentGameweek);
}

function blankUefaRow(teamId) {
  return { teamId, played:0, won:0, drawn:0, lost:0, gf:0, ga:0, gd:0, points:0, position:0 };
}

function migratedUefaKnockoutSize(roundIndex) {
  if (roundIndex <= 1) return 16;
  if (roundIndex <= 3) return 16;
  if (roundIndex <= 5) return 8;
  if (roundIndex <= 7) return 4;
  return 2;
}

function alignMigratedUefaState(state, currentGameweek) {
  const rules = getCompetitionRules(state.id);
  const phase = rules?.leaguePhase;
  const finalLeaguePhaseGW = phase?.gws?.[phase.gws.length - 1] ?? 0;
  if (!phase || currentGameweek <= finalLeaguePhaseGW) return state;

  const rankedTeamIds = state.table.map(row => row.teamId);
  state.table = state.table.map((row, index) => ({
    ...row,
    played:phase.matches,
    position:index + 1,
  }));
  state.leaguePhaseMatchday = phase.matches;
  state.phase = 'knockout';

  let firstUpcoming = rules.roundGWs.findIndex(gw => gw >= currentGameweek);
  if (firstUpcoming >= 0 && isTwoLegRound(state.id, rules.rounds?.[firstUpcoming], 2)) firstUpcoming += 1;

  if (firstUpcoming < 0 || firstUpcoming >= rules.rounds.length) {
    state.roundIndex = rules.rounds.length;
    state.activeTeamIds = [];
    state.directTeamIds = [];
    state.winnerId = rankedTeamIds[0] ?? null;
    state.runnerUpId = rankedTeamIds[1] ?? null;
    for (const teamId of rankedTeamIds) {
      state.progressByTeam[teamId] = teamId === state.winnerId
        ? progress('winner', rules.rounds.length - 1, rules.rounds.at(-1) ?? 'Final', 'knockout')
        : progress('eliminated', rules.rounds.length - 1, rules.rounds.at(-1) ?? 'Final', 'knockout');
    }
    return state;
  }

  state.roundIndex = firstUpcoming;
  if (firstUpcoming <= 1) {
    state.directTeamIds = rankedTeamIds.slice(0, 8);
    state.activeTeamIds = rankedTeamIds.slice(8, 24);
  } else {
    state.directTeamIds = [];
    state.activeTeamIds = rankedTeamIds.slice(0, migratedUefaKnockoutSize(firstUpcoming));
  }

  const active = new Set(state.activeTeamIds);
  const direct = new Set(state.directTeamIds);
  for (const teamId of rankedTeamIds) {
    if (active.has(teamId)) {
      state.progressByTeam[teamId] = progress('active', firstUpcoming, rules.rounds[firstUpcoming] ?? 'Knockout', 'knockout');
    } else if (direct.has(teamId)) {
      state.progressByTeam[teamId] = progress('waiting', 2, rules.rounds[2] ?? 'R16', 'knockout');
    } else {
      state.progressByTeam[teamId] = progress('eliminated', Math.max(-1, firstUpcoming - 1), firstUpcoming > 0 ? rules.rounds[firstUpcoming - 1] : 'League Phase', 'knockout');
    }
  }
  return state;
}

function buildUefaState(cupId, teamIds, season, currentGameweek) {
  const rules = getCompetitionRules(cupId);
  const passedMatchdays = currentGameweek <= 1
    ? 0
    : (rules?.leaguePhase?.gws ?? []).filter(gw => gw < currentGameweek).length;
  const progressByTeam = Object.fromEntries(teamIds.map(teamId => [teamId, progress('active', 0, 'League Phase', 'league_phase')]));
  return alignMigratedUefaState({
    id:cupId,
    format:'uefa_league_phase',
    season,
    phase:'league_phase',
    leaguePhaseMatchday:passedMatchdays,
    activeTeamIds:[...teamIds],
    directTeamIds:[],
    table:teamIds.map(blankUefaRow),
    roundIndex:0,
    pendingTies:[],
    pendingByes:[],
    progressByTeam,
    winnerId:null,
    runnerUpId:null,
    results:[],
    processedGameweeks:[],
  }, currentGameweek);
}

/** Build every supported domestic cup plus UCL/UEL/UECL background fields. */
export function buildWorldCompetitionState(teams, season, userTeamId, currentGameweek = 1) {
  const competitions = {};
  for (const def of DOMESTIC_DEFINITIONS) {
    competitions[def.id] = buildKnockoutState(def, teams, season, userTeamId, currentGameweek);
  }

  const europeanPool = orderedByStrength(
    teams.filter(team => TOP_FLIGHT_LEAGUES.has(team.league ?? 'Premier League')),
  );
  WORLD_EUROPEAN_COMPETITION_IDS.forEach((cupId, index) => {
    const slice = europeanPool.slice(index * 36, index * 36 + 36)
      .filter(team => team.id !== userTeamId)
      .map(team => team.id);
    competitions[cupId] = buildUefaState(cupId, slice, season, currentGameweek);
  });

  return {
    version:WORLD_COMPETITION_VERSION,
    season,
    competitions,
  };
}

function roundRobinPairs(teamIds, roundIndex) {
  const list = [...teamIds].sort();
  if (list.length % 2) list.push(null);
  if (list.length < 2) return { pairs:[], byes:list.filter(Boolean) };

  let rotation = [...list];
  for (let r = 0; r < roundIndex; r++) {
    rotation = [rotation[0], rotation[rotation.length - 1], ...rotation.slice(1, -1)];
  }

  const pairs = [];
  const byes = [];
  for (let i = 0; i < rotation.length / 2; i++) {
    const a = rotation[i];
    const b = rotation[rotation.length - 1 - i];
    if (!a || !b) {
      if (a || b) byes.push(a ?? b);
      continue;
    }
    const flipHome = (roundIndex + i) % 2 === 1;
    pairs.push(flipHome ? [b, a] : [a, b]);
  }
  return { pairs, byes };
}

function knockoutPairs(teamIds, roundIndex) {
  const ids = [...teamIds].sort();
  const pairs = [];
  const byes = [];
  for (let i = 0; i < ids.length; i += 2) {
    if (!ids[i + 1]) byes.push(ids[i]);
    else pairs.push(roundIndex % 2 ? [ids[i + 1], ids[i]] : [ids[i], ids[i + 1]]);
  }
  return { pairs, byes };
}

function freshPlayers(players) {
  return (players ?? []).map(player => {
    const copy = { ...player };
    delete copy._injuredThisMatch;
    return copy;
  });
}

function simulateWorldRecord(comp, gw, roundIndex, roundName, homeTeamId, awayTeamId, teamsById, playersByTeam) {
  const home = teamsById.get(homeTeamId);
  const away = teamsById.get(awayTeamId);
  if (!home || !away) return null;
  const result = simulateMatch(
    home,
    away,
    freshPlayers(playersByTeam.get(homeTeamId)),
    freshPlayers(playersByTeam.get(awayTeamId)),
    pickAIFormation(),
    pickAIFormation(),
    null,
    null,
    'balanced',
    'balanced',
  );
  return {
    id:`world:${comp.season}:${comp.id}:${gw}:${roundIndex}:${homeTeamId}:${awayTeamId}:${comp.results.length}`,
    competitionId:comp.id,
    competition:'cup',
    season:comp.season,
    gameweek:gw,
    roundIndex,
    roundName,
    worldCompetitionVersion:WORLD_COMPETITION_VERSION,
    projectionsApplied:false,
    ...result,
  };
}

function recordWinner(record) {
  if (record.homeGoals > record.awayGoals) return { winnerId:record.homeTeamId, loserId:record.awayTeamId, penalties:false };
  if (record.awayGoals > record.homeGoals) return { winnerId:record.awayTeamId, loserId:record.homeTeamId, penalties:false };
  const homeWon = Math.random() < 0.5;
  return {
    winnerId:homeWon ? record.homeTeamId : record.awayTeamId,
    loserId:homeWon ? record.awayTeamId : record.homeTeamId,
    penalties:true,
  };
}

function markActive(comp, teamIds, roundIndex, roundName, phase = 'knockout') {
  for (const teamId of teamIds) {
    const existing = comp.progressByTeam[teamId] ?? {};
    comp.progressByTeam[teamId] = { ...existing, status:'active', roundIndex, roundName, phase };
  }
}

function markEliminated(comp, teamId, roundIndex, roundName, eliminatedBy) {
  const existing = comp.progressByTeam[teamId] ?? {};
  comp.progressByTeam[teamId] = {
    ...existing,
    status:'eliminated',
    roundIndex,
    roundName,
    phase:'knockout',
    eliminatedBy:eliminatedBy ?? null,
  };
}

function completeCompetition(comp, winnerId, runnerUpId, roundIndex, roundName) {
  comp.winnerId = winnerId ?? null;
  comp.runnerUpId = runnerUpId ?? null;
  comp.activeTeamIds = winnerId ? [winnerId] : [];
  if (winnerId) {
    const existing = comp.progressByTeam[winnerId] ?? {};
    comp.progressByTeam[winnerId] = { ...existing, status:'winner', roundIndex, roundName, phase:'knockout' };
  }
}

function updateUefaTable(comp, record) {
  const rows = new Map(comp.table.map(row => [row.teamId, row]));
  const home = rows.get(record.homeTeamId);
  const away = rows.get(record.awayTeamId);
  if (!home || !away) return;
  home.played++; away.played++;
  home.gf += record.homeGoals; home.ga += record.awayGoals; home.gd = home.gf - home.ga;
  away.gf += record.awayGoals; away.ga += record.homeGoals; away.gd = away.gf - away.ga;
  if (record.homeGoals > record.awayGoals) { home.won++; away.lost++; home.points += 3; }
  else if (record.awayGoals > record.homeGoals) { away.won++; home.lost++; away.points += 3; }
  else { home.drawn++; away.drawn++; home.points++; away.points++; }
}

async function advanceUefaLeaguePhase(comp, gw, teamsById, playersByTeam) {
  const rules = getCompetitionRules(comp.id);
  const phase = rules?.leaguePhase;
  if (!phase || comp.phase !== 'league_phase') return [];
  const matchday = comp.leaguePhaseMatchday ?? 0;
  if (phase.gws[matchday] !== gw) return [];

  const { pairs } = roundRobinPairs(comp.activeTeamIds, matchday);
  const records = [];
  for (const [homeId, awayId] of pairs) {
    const record = simulateWorldRecord(comp, gw, matchday, `League Phase · Matchday ${matchday + 1}`, homeId, awayId, teamsById, playersByTeam);
    if (!record) continue;
    comp.results.push(record);
    records.push(record);
    updateUefaTable(comp, record);
    if (records.length % WORLD_COMPETITION_BATCH_SIZE === 0) await Promise.resolve();
  }
  comp.leaguePhaseMatchday = matchday + 1;

  if (comp.leaguePhaseMatchday >= phase.matches) {
    const table = [...comp.table].sort(compareLeaguePhaseRows);
    table.forEach((row, index) => { row.position = index + 1; });
    comp.table = table;
    comp.directTeamIds = table.slice(0, 8).map(row => row.teamId);
    comp.activeTeamIds = table.slice(8, 24).map(row => row.teamId);
    for (const row of table.slice(24)) markEliminated(comp, row.teamId, -1, 'League Phase', null);
    markActive(comp, comp.directTeamIds, 2, rules.rounds?.[2] ?? 'R16', 'knockout');
    markActive(comp, comp.activeTeamIds, 0, rules.rounds?.[0] ?? 'Knockout Play-off', 'knockout');
    comp.phase = 'knockout';
    comp.roundIndex = 0;
  }
  return records;
}

async function advanceKnockout(comp, gw, teamsById, playersByTeam) {
  const rules = getCompetitionRules(comp.id);
  const roundIndex = comp.roundIndex ?? 0;
  if (!rules?.rounds?.[roundIndex] || rules.roundGWs?.[roundIndex] !== gw || comp.winnerId) return [];
  const roundName = rules.rounds[roundIndex];
  const records = [];

  if (isTwoLegRound(comp.id, roundName, 2)) {
    const winners = [...(comp.pendingByes ?? [])];
    for (const tie of comp.pendingTies ?? []) {
      const record = simulateWorldRecord(comp, gw, roundIndex, roundName, tie.teamBId, tie.teamAId, teamsById, playersByTeam);
      if (!record) continue;
      comp.results.push(record);
      records.push(record);
      const teamAAgg = Number(tie.leg1.homeGoals ?? 0) + record.awayGoals;
      const teamBAgg = Number(tie.leg1.awayGoals ?? 0) + record.homeGoals;
      let winnerId;
      if (teamAAgg > teamBAgg) winnerId = tie.teamAId;
      else if (teamBAgg > teamAAgg) winnerId = tie.teamBId;
      else winnerId = Math.random() < 0.5 ? tie.teamAId : tie.teamBId;
      const loserId = winnerId === tie.teamAId ? tie.teamBId : tie.teamAId;
      winners.push(winnerId);
      markEliminated(comp, loserId, roundIndex, roundName, winnerId);
      if (records.length % WORLD_COMPETITION_BATCH_SIZE === 0) await Promise.resolve();
    }
    comp.pendingTies = [];
    comp.pendingByes = [];
    comp.roundIndex = roundIndex + 1;
    comp.activeTeamIds = uniqueCompetitionTeams(winners);
    if (comp.format === 'uefa_league_phase' && comp.roundIndex === 2) {
      comp.activeTeamIds = uniqueCompetitionTeams([...comp.activeTeamIds, ...(comp.directTeamIds ?? [])]);
      comp.directTeamIds = [];
    }
    markActive(comp, comp.activeTeamIds, comp.roundIndex, rules.rounds?.[comp.roundIndex] ?? roundName);
    return records;
  }

  const entrants = comp.entrantsByRound?.[roundIndex] ?? [];
  const participants = uniqueCompetitionTeams([...(comp.activeTeamIds ?? []), ...entrants]);
  markActive(comp, participants, roundIndex, roundName);
  const { pairs, byes } = knockoutPairs(participants, roundIndex);

  if (isTwoLegRound(comp.id, roundName, 1)) {
    const ties = [];
    for (const [homeId, awayId] of pairs) {
      const record = simulateWorldRecord(comp, gw, roundIndex, roundName, homeId, awayId, teamsById, playersByTeam);
      if (!record) continue;
      comp.results.push(record);
      records.push(record);
      ties.push({ teamAId:homeId, teamBId:awayId, leg1:{ homeGoals:record.homeGoals, awayGoals:record.awayGoals } });
      if (records.length % WORLD_COMPETITION_BATCH_SIZE === 0) await Promise.resolve();
    }
    comp.pendingTies = ties;
    comp.pendingByes = byes;
    comp.roundIndex = roundIndex + 1;
    return records;
  }

  const winners = [...byes];
  let finalRunnerUp = null;
  for (const [homeId, awayId] of pairs) {
    const record = simulateWorldRecord(comp, gw, roundIndex, roundName, homeId, awayId, teamsById, playersByTeam);
    if (!record) continue;
    const decision = recordWinner(record);
    record.winnerId = decision.winnerId;
    record.decidedByPenalties = decision.penalties;
    comp.results.push(record);
    records.push(record);
    winners.push(decision.winnerId);
    markEliminated(comp, decision.loserId, roundIndex, roundName, decision.winnerId);
    if (/Final$/i.test(roundName) && pairs.length === 1) finalRunnerUp = decision.loserId;
    if (records.length % WORLD_COMPETITION_BATCH_SIZE === 0) await Promise.resolve();
  }

  comp.roundIndex = roundIndex + 1;
  comp.activeTeamIds = uniqueCompetitionTeams(winners);
  const finished = /Final$/i.test(roundName) || comp.roundIndex >= (rules.rounds?.length ?? 0);
  if (finished && comp.activeTeamIds.length === 1) {
    completeCompetition(comp, comp.activeTeamIds[0], finalRunnerUp, roundIndex, roundName);
  } else {
    markActive(comp, comp.activeTeamIds, comp.roundIndex, rules.rounds?.[comp.roundIndex] ?? roundName);
  }
  return records;
}

/** Advance all scheduled non-user competitions exactly once for a world GW. */
export async function advanceWorldCompetitions(worldState, gw, teams, playersByTeam) {
  if (!worldState?.competitions) return { state:worldState, records:[] };
  const next = clone(worldState);
  const teamsById = teams instanceof Map ? teams : new Map((teams ?? []).map(team => [team.id, team]));
  const records = [];

  for (const comp of Object.values(next.competitions)) {
    if (comp.processedGameweeks?.includes(gw)) continue;
    const before = comp.results.length;
    const generated = comp.format === 'uefa_league_phase' && comp.phase === 'league_phase'
      ? await advanceUefaLeaguePhase(comp, gw, teamsById, playersByTeam)
      : await advanceKnockout(comp, gw, teamsById, playersByTeam);
    if (generated.length || comp.results.length !== before) {
      comp.processedGameweeks = [...(comp.processedGameweeks ?? []), gw].slice(-64);
      records.push(...generated);
    }
  }

  return { state:next, records };
}

export function worldCompetitionRunsForTeam(worldState, teamId) {
  const runs = {};
  for (const [competitionId, comp] of Object.entries(worldState?.competitions ?? {})) {
    const item = comp.progressByTeam?.[teamId];
    if (!item) continue;
    runs[competitionId] = {
      competitionId,
      status:item.status,
      phase:item.phase,
      roundIndex:item.roundIndex,
      roundName:item.roundName,
      eliminatedBy:item.eliminatedBy ?? null,
      winner:comp.winnerId === teamId,
    };
  }
  return runs;
}

function leaderFromRecords(comp, field) {
  const totals = new Map();
  for (const record of comp.results ?? []) {
    for (const event of record.events ?? []) {
      const playerId = field === 'goals' ? (event.type === 'goal' ? event.playerId : null) : (event.type === 'goal' ? event.assistId : null);
      if (!playerId) continue;
      totals.set(playerId, (totals.get(playerId) ?? 0) + 1);
    }
  }
  const best = [...totals.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0];
  return best ? { playerId:best[0], value:best[1] } : null;
}

export function buildWorldCompetitionHistory(worldState, players = [], userTeamId = null, userCups = {}) {
  const playersById = new Map(players.map(player => [player.id, player]));
  return Object.values(worldState?.competitions ?? {}).map(comp => {
    const userWon = userTeamId && userCups?.[comp.id]?.status === 'winner';
    const topScorer = leaderFromRecords(comp, 'goals');
    const topAssists = leaderFromRecords(comp, 'assists');
    const withName = entry => entry ? {
      ...entry,
      name:playersById.get(entry.playerId)?.name ?? entry.playerId,
      teamId:playersById.get(entry.playerId)?.teamId ?? null,
    } : null;
    return {
      competition:comp.id,
      winner:userWon ? userTeamId : comp.winnerId ?? null,
      runnerUp:userWon ? null : comp.runnerUpId ?? null,
      topScorer:withName(topScorer),
      topAssists:withName(topAssists),
      matches:(comp.results ?? []).length,
    };
  });
}

export function pendingWorldCompetitionRecords(worldState) {
  const records = [];
  for (const comp of Object.values(worldState?.competitions ?? {})) {
    for (const record of comp.results ?? []) {
      if (record.worldCompetitionVersion === WORLD_COMPETITION_VERSION && record.projectionsApplied !== true) records.push(record);
    }
  }
  return records;
}

export function markWorldCompetitionRecordsApplied(worldState, recordIds) {
  const ids = new Set(recordIds);
  const next = clone(worldState);
  for (const comp of Object.values(next?.competitions ?? {})) {
    comp.results = (comp.results ?? []).map(record => ids.has(record.id) ? { ...record, projectionsApplied:true } : record);
  }
  return next;
}
