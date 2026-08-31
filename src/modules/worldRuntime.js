import { getCompetitionRules } from './competitionRules.js';
import { _db, SAVE_SCHEMA_VERSION, getAllPlayers, getAllStandings, getSave, putPlayersBulk } from './db.js';
import { applyInjury } from './injuries.js';
import { buildPersonalStatePatches } from './playerModel.js';
import { mutateRow, sortTable } from './standings.js';
import {
  WORLD_RECORD_VERSION,
  applyWorldPlayerStats,
  resultFromCanonicalLeagueRecord,
  tickPlayerSuspensions,
} from './world.js';
import {
  markWorldCompetitionRecordsApplied,
  pendingWorldCompetitionRecords,
} from './worldCompetitions.js';

/** modules/worldRuntime.js — atomic P1/P3 projection of canonical world match records */

function heavyLossMap(results) {
  const map = new Map();
  for (const result of results) {
    const homeMargin = result.awayGoals - result.homeGoals;
    const awayMargin = result.homeGoals - result.awayGoals;
    if (homeMargin >= 3) map.set(result.homeTeamId, homeMargin);
    if (awayMargin >= 3) map.set(result.awayTeamId, awayMargin);
  }
  return map;
}

function applyFitness(cache, results) {
  for (const result of results) {
    for (const update of result.fitnessUpdates ?? []) {
      const player = cache.get(update.id);
      if (player) player.fitness = update.newFitness;
    }
  }
}

function applyInjuries(cache, results) {
  if (typeof applyInjury !== 'function') return;
  for (const result of results) {
    for (const event of result.events ?? []) {
      if (event.type !== 'injury') continue;
      const player = cache.get(event.playerId);
      if (!player) continue;
      applyInjury(player, {
        injuryName:event.injuryName,
        injuryType:event.injuryType ?? 'unknown',
        injuryGWsLeft:event.injuryGWsLeft,
        injuryGWsTotal:event.injuryGWsLeft,
      });
    }
  }
}

function clearTransientProjectionFlags(player) {
  delete player._played;
  delete player._scored;
  delete player._assisted;
  delete player._cleanSheet;
}

function updatePlayedPlayerForm(player, heavyLossMargin) {
  const age = player.age ?? 24;
  const agePenalty = age >= 36 ? 6 : age >= 33 ? 4 : age >= 30 ? 2 : 0;
  const recovery = Math.max(8, 20 - agePenalty);
  player.fitness = Math.min(100, (player.fitness ?? 80) + recovery);
  const currentForm = player.form ?? 50;
  let formGain = 1;
  if (player._scored) formGain += 3;
  if (player._assisted) formGain += 2;
  if (player._cleanSheet) formGain += 1;
  const margin = heavyLossMargin.get(player.teamId) ?? 0;
  if (margin >= 3 && !player._scored && !player._assisted) formGain -= (margin - 2) * 2;
  const afterGain = currentForm + formGain;
  const ceilingDecay = afterGain > 60 ? 1 : 0;
  player.form = Math.min(99, Math.max(1, afterGain - ceilingDecay));
}

function finalisePlayerForm(cache, results) {
  const heavyLossMargin = heavyLossMap(results);
  for (const player of cache.values()) {
    if (!player._played) {
      player.fitness = 100;
      const currentForm = player.form ?? 50;
      if (currentForm > 50) player.form = Math.max(50, currentForm - 3);
      else if (currentForm < 50) player.form = Math.min(50, currentForm + 1);
    } else {
      updatePlayedPlayerForm(player, heavyLossMargin);
    }
    clearTransientProjectionFlags(player);
  }
}

function finaliseNonLeaguePlayerForm(cache, results) {
  const heavyLossMargin = heavyLossMap(results);
  for (const player of cache.values()) {
    // A cup batch must not make every player in every other league rested,
    // fully fit and form-decayed. Only participants consume this match result;
    // the weekly league/world closeout remains the sole global recovery tick.
    if (player._played) updatePlayedPlayerForm(player, heavyLossMargin);
    clearTransientProjectionFlags(player);
  }
}

function nonLeagueParticipantTeamIds(results) {
  const ids = new Set();
  for (const result of results) {
    if (result.homeTeamId) ids.add(result.homeTeamId);
    if (result.awayTeamId) ids.add(result.awayTeamId);
  }
  return ids;
}

function shallowRowChanged(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (before[key] !== after[key]) return true;
  }
  return false;
}

export function projectWorldBatch(players, standings, results) {
  const originals = new Map(players.map(player => [player.id, player]));
  const playerCache = new Map(players.map(player => [player.id, { ...player }]));
  const standingCache = new Map(standings.map(row => [row.teamId, { ...row }]));

  // Suspensions from the prior league batch were already respected by the
  // match engine. Decrement them before new cards are projected.
  tickPlayerSuspensions([...playerCache.values()]);
  applyWorldPlayerStats(playerCache, results);
  applyFitness(playerCache, results);
  applyInjuries(playerCache, results);
  finalisePlayerForm(playerCache, results);

  for (const result of results) {
    const home = standingCache.get(result.homeTeamId);
    const away = standingCache.get(result.awayTeamId);
    if (!home || !away) continue;
    mutateRow(home, result.homeGoals, result.awayGoals);
    mutateRow(away, result.awayGoals, result.homeGoals);
  }

  const byLeague = new Map();
  for (const row of standingCache.values()) {
    const league = row.league ?? 'Premier League';
    if (!byLeague.has(league)) byLeague.set(league, []);
    byLeague.get(league).push(row);
  }
  const projectedStandings = [];
  for (const leagueRows of byLeague.values()) {
    const sorted = sortTable(leagueRows);
    sorted.forEach((row, index) => { row.position = index + 1; });
    projectedStandings.push(...sorted);
  }

  const projectedPlayers = [...playerCache.values()];
  const changedPlayers = projectedPlayers.filter(player => {
    const original = originals.get(player.id);
    return !original || shallowRowChanged(original, player);
  });

  return {
    players:projectedPlayers,
    changedPlayers,
    standings:projectedStandings,
  };
}

/**
 * Return background clubs whose world week is not complete after league
 * projection because a domestic/European fixture is scheduled for this GW.
 * Existing canonical records are included as well so crash recovery keeps the
 * same defer decision even after the competition state has advanced.
 */
export function scheduledWorldCompetitionTeamIds(worldState, gameweek) {
  const gw = Number(gameweek);
  const ids = new Set();
  if (!Number.isInteger(gw) || gw < 0) return ids;

  for (const comp of Object.values(worldState?.competitions ?? {})) {
    for (const record of comp.results ?? []) {
      if (Number(record?.gameweek) !== gw) continue;
      if (record.homeTeamId) ids.add(record.homeTeamId);
      if (record.awayTeamId) ids.add(record.awayTeamId);
    }

    if (comp.processedGameweeks?.includes(gw)) continue;
    const rules = getCompetitionRules(comp.id);
    if (!rules) continue;

    if (comp.format === 'uefa_league_phase' && comp.phase === 'league_phase') {
      const matchday = Number(comp.leaguePhaseMatchday ?? 0);
      if (rules.leaguePhase?.gws?.[matchday] !== gw) continue;
      for (const teamId of comp.activeTeamIds ?? []) ids.add(teamId);
      continue;
    }

    const roundIndex = Number(comp.roundIndex ?? 0);
    if (rules.roundGWs?.[roundIndex] !== gw) continue;
    for (const teamId of comp.activeTeamIds ?? []) ids.add(teamId);
    for (const teamId of comp.entrantsByRound?.[roundIndex] ?? []) ids.add(teamId);
    for (const teamId of comp.pendingByes ?? []) ids.add(teamId);
    for (const tie of comp.pendingTies ?? []) {
      if (tie.teamAId) ids.add(tie.teamAId);
      if (tie.teamBId) ids.add(tie.teamBId);
    }
  }

  return ids;
}

function managedPersonalStateTeamIds(players) {
  const ids = new Set();
  for (const player of players ?? []) {
    if (player?.playingTimeAgreement?.scope === 'managed' && player.teamId) ids.add(player.teamId);
  }
  return ids;
}

/**
 * Fold completed-club P3 weekly settlement into an already-required projection
 * transaction. Clubs with another background competition fixture are deferred,
 * and the managed club is always deferred until the pending-event queue is
 * empty. That preserves one settlement per player after total weekly exposure
 * is known without restoring a redundant ordinary full-world write.
 */
export function coalescePersonalStateProjection(projectedPlayers, changedPlayers, gameweek, season, { deferTeamIds = [] } = {}) {
  const gw = Number(gameweek);
  if (!Number.isInteger(gw) || gw < 0 || !season) {
    return { players:projectedPlayers, changedPlayers };
  }

  const deferred = new Set(deferTeamIds);
  for (const teamId of managedPersonalStateTeamIds(projectedPlayers)) deferred.add(teamId);
  const settlementCandidates = deferred.size
    ? projectedPlayers.filter(player => !deferred.has(player.teamId))
    : projectedPlayers;
  const personalStatePatches = buildPersonalStatePatches(settlementCandidates, gw, season);
  if (!personalStatePatches.length) return { players:projectedPlayers, changedPlayers };

  const patchById = new Map(personalStatePatches.map(player => [player.id, player]));
  const players = projectedPlayers.map(player => patchById.get(player.id) ?? player);
  const changedById = new Map();
  for (const player of changedPlayers) {
    changedById.set(player.id, patchById.get(player.id) ?? player);
  }
  for (const player of personalStatePatches) changedById.set(player.id, player);
  return { players, changedPlayers:[...changedById.values()] };
}

export function projectNonLeaguePlayers(players, results) {
  const participantTeams = nonLeagueParticipantTeamIds(results);
  const participantPlayers = players.filter(player => participantTeams.has(player.teamId));
  const cache = new Map(participantPlayers.map(player => [player.id, { ...player }]));
  applyWorldPlayerStats(cache, results);
  applyFitness(cache, results);
  applyInjuries(cache, results);
  finaliseNonLeaguePlayerForm(cache, results);
  return [...cache.values()];
}

function commitWorldProjection(fixtures, standings, players) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(['fixtures', 'standings', 'players'], 'readwrite');
    const fixtureStore = tx.objectStore('fixtures');
    const standingStore = tx.objectStore('standings');
    const playerStore = tx.objectStore('players');
    fixtures.forEach(fixture => fixtureStore.put(fixture));
    standings.forEach(row => standingStore.put(row));
    players.forEach(player => playerStore.put(player));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function commitWorldCompetitionProjection(save, worldCompetitions, players) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(['save', 'players'], 'readwrite');
    const saveStore = tx.objectStore('save');
    const playerStore = tx.objectStore('players');
    players.forEach(player => playerStore.put(player));
    saveStore.put({
      ...save,
      id:'active',
      saveSchemaVersion:SAVE_SCHEMA_VERSION,
      lastPlayedAt:new Date().toISOString(),
      worldCompetitions,
    });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Apply every persisted-but-unprojected canonical fixture in one transaction.
 * A crash before commit leaves all records pending; a crash after commit leaves
 * all records applied. There is no state in which standings/player stats move
 * but the fixture still advertises itself as pending. P3 settlement is folded
 * into this transaction only for clubs whose world week is complete here.
 */
export async function applyPendingWorldLeagueProjections(fixtures) {
  const pending = fixtures.filter(fixture =>
    fixture.played &&
    fixture.worldRecordVersion === WORLD_RECORD_VERSION &&
    fixture.projectionsApplied !== true
  );
  if (!pending.length) return [];

  const results = pending.map(resultFromCanonicalLeagueRecord);
  const [players, standings, save] = await Promise.all([getAllPlayers(), getAllStandings(), getSave()]);
  const projected = projectWorldBatch(players, standings, results);
  const weekKeys = new Set(pending.map(fixture => `${fixture.season ?? ''}:${fixture.gameweek ?? ''}`));
  const singleWeek = weekKeys.size === 1 ? pending[0] : null;
  const deferredTeams = singleWeek
    ? scheduledWorldCompetitionTeamIds(save?.worldCompetitions, singleWeek.gameweek)
    : new Set();
  const withPersonalState = singleWeek
    ? coalescePersonalStateProjection(
      projected.players,
      projected.changedPlayers,
      singleWeek.gameweek,
      singleWeek.season,
      { deferTeamIds:deferredTeams },
    )
    : { players:projected.players, changedPlayers:projected.changedPlayers };
  const appliedFixtures = pending.map(fixture => ({ ...fixture, projectionsApplied:true }));
  // Keep fixture apply-once flags, standings and every changed/P3-settled player
  // in one transaction, but avoid rewriting thousands of byte-identical rows.
  await commitWorldProjection(appliedFixtures, projected.standings, withPersonalState.changedPlayers);
  return results;
}

/**
 * Background cup records live inside the save row, so their apply-once flag and
 * participant player mutations commit together. P3 settlement is coalesced only
 * after every pending background result for that world week has been projected,
 * so league + domestic/European exposure is consumed once in total. Clubs
 * outside the batch are intentionally not rewritten.
 */
export async function applyPendingWorldCompetitionProjections(save) {
  const pending = pendingWorldCompetitionRecords(save?.worldCompetitions);
  if (!pending.length) return { save, results:[] };
  const players = await getAllPlayers();
  const projectedPlayers = projectNonLeaguePlayers(players, pending);
  const weekKeys = new Set(pending.map(record => `${record.season ?? ''}:${record.gameweek ?? ''}`));
  const singleWeek = weekKeys.size === 1 ? pending[0] : null;
  const withPersonalState = singleWeek
    ? coalescePersonalStateProjection(
      projectedPlayers,
      projectedPlayers,
      singleWeek.gameweek,
      singleWeek.season,
    )
    : { players:projectedPlayers };
  const worldCompetitions = markWorldCompetitionRecordsApplied(
    save.worldCompetitions,
    pending.map(record => record.id),
  );
  const nextSave = { ...save, worldCompetitions };
  await commitWorldCompetitionProjection(nextSave, worldCompetitions, withPersonalState.players);
  return { save:nextSave, results:pending };
}

/** Cup matches use the same player-stat projection but have no league table row. */
export async function applyNonLeaguePlayerResults(results) {
  if (!results.length) return;
  const players = await getAllPlayers();
  await putPlayersBulk(projectNonLeaguePlayers(players, results));
}
