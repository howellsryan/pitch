import { _db, getAllPlayers, getAllStandings, putPlayersBulk } from './db.js';
import { applyInjury } from './injuries.js';
import { mutateRow, sortTable } from './standings.js';
import {
  WORLD_RECORD_VERSION,
  applyWorldPlayerStats,
  resultFromCanonicalLeagueRecord,
  tickPlayerSuspensions,
} from './world.js';

/** modules/worldRuntime.js — atomic P1 projection of canonical world match records */

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

function finalisePlayerForm(cache, results) {
  const heavyLossMargin = heavyLossMap(results);
  for (const player of cache.values()) {
    if (!player._played) {
      player.fitness = 100;
      const currentForm = player.form ?? 50;
      if (currentForm > 50) player.form = Math.max(50, currentForm - 3);
      else if (currentForm < 50) player.form = Math.min(50, currentForm + 1);
    } else {
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
    delete player._played;
    delete player._scored;
    delete player._assisted;
    delete player._cleanSheet;
  }
}

export function projectWorldBatch(players, standings, results) {
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

  return {
    players:[...playerCache.values()],
    standings:projectedStandings,
  };
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

/**
 * Apply every persisted-but-unprojected canonical fixture in one transaction.
 * A crash before commit leaves all records pending; a crash after commit leaves
 * all records applied. There is no state in which standings/player stats move
 * but the fixture still advertises itself as pending.
 */
export async function applyPendingWorldLeagueProjections(fixtures) {
  const pending = fixtures.filter(fixture =>
    fixture.played &&
    fixture.worldRecordVersion === WORLD_RECORD_VERSION &&
    fixture.projectionsApplied !== true
  );
  if (!pending.length) return [];

  const results = pending.map(resultFromCanonicalLeagueRecord);
  const [players, standings] = await Promise.all([getAllPlayers(), getAllStandings()]);
  const projected = projectWorldBatch(players, standings, results);
  const appliedFixtures = pending.map(fixture => ({ ...fixture, projectionsApplied:true }));
  await commitWorldProjection(appliedFixtures, projected.standings, projected.players);
  return results;
}

/** Cup matches use the same player-stat projection but have no league table row. */
export async function applyNonLeaguePlayerResults(results) {
  if (!results.length) return;
  const players = await getAllPlayers();
  const cache = new Map(players.map(player => [player.id, { ...player }]));
  applyWorldPlayerStats(cache, results);
  applyFitness(cache, results);
  applyInjuries(cache, results);
  finalisePlayerForm(cache, results);
  await putPlayersBulk([...cache.values()]);
}
