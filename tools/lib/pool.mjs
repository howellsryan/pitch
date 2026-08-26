// tools/lib/pool.mjs
// Loads pitch's team+player CSVs across ALL 9 leagues into one combined pool.
// Needed because footy-sim's club-to-league placement is now trusted as
// current (verified against real 2026/27 promotion/relegation results) -
// a club can move league, so team/player lookups have to search pitch's
// whole dataset, not just the one league CSV a club used to sit in.
import path from 'node:path';
import { readCsvFile } from './csv.mjs';
import { LEAGUES, PITCH_NATIVE_LEAGUES } from './leagueSchema.mjs';

export function loadTeamPool(csvDir) {
  const teams = new Map(); // team_id -> { ...row, leagueKey }
  for (const league of [...LEAGUES, ...PITCH_NATIVE_LEAGUES]) {
    if (!league.pitchTeamsCsv) continue;
    const { rows } = readCsvFile(path.join(csvDir, league.pitchTeamsCsv));
    for (const row of rows) {
      teams.set(row.team_id, { ...row, leagueKey: league.key });
    }
  }
  return teams;
}

export function loadPlayerPool(csvDir) {
  const players = [];
  for (const league of [...LEAGUES, ...PITCH_NATIVE_LEAGUES]) {
    if (!league.pitchPlayersCsv) continue;
    const { rows } = readCsvFile(path.join(csvDir, league.pitchPlayersCsv));
    for (const row of rows) players.push({ ...row, leagueKey: league.key });
  }
  return players;
}
