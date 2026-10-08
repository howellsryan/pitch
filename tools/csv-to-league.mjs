#!/usr/bin/env node
// tools/csv-to-league.mjs
// Reads Pitch's team+player CSVs and generates src/data/<league>.js for every
// league the game currently models. The original reconciliation covered seven
// footy-sim-backed leagues; current-player refreshes also cover Serie A and the
// Eredivisie, so generation must share that same nine-league boundary.
//
// Usage:
//   node tools/csv-to-league.mjs                  # regenerate all supported leagues
//   node tools/csv-to-league.mjs --league=prem    # just one
//   node tools/csv-to-league.mjs --dry-run        # report only, no writes

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readCsvFile } from './lib/csv.mjs';
import { ALL_LEAGUES } from './lib/leagueSchema.mjs';
import { validateClubRoster, validateUniqueIds } from './lib/validate.mjs';
import { buildLeagueJs } from './lib/generate.mjs';
import { flattenToNameTeam, diffClubs } from './lib/diff.mjs';
import { loadTeamsArray } from './lib/loadLeagueData.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCH_ROOT = path.resolve(__dirname, '..');
const CSV_DIR = path.join(PITCH_ROOT, 'src/data/csv');
const DATA_DIR = path.join(PITCH_ROOT, 'src/data');
const DETAILED_ATTRIBUTE_KEYS = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'];

const DRY_RUN = process.argv.includes('--dry-run');
const leagueArg = process.argv.find((a) => a.startsWith('--league='));
const onlyLeague = leagueArg ? leagueArg.split('=')[1] : null;

function optionalNumber(value) {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toPlayerObject(row) {
  return {
    team_id: row.team_id, player_id: row.player_id, name: row.name,
    nationality: row.nationality || '', position: row.position,
    age: Number(row.age), attack: Number(row.attack), midfield: Number(row.midfield),
    defence: Number(row.defence), goalkeeping: Number(row.goalkeeping),
    ...Object.fromEntries(DETAILED_ATTRIBUTE_KEYS.map(key => [key, optionalNumber(row[key])])),
    value_millions: Number(row.value_millions), wage_thousands: Number(row.wage_thousands),
    potential: Number(row.potential), is_wonderkid: row.is_wonderkid === '1' || row.is_wonderkid === 'true',
  };
}

async function processLeague(league) {
  const teamsPath = path.join(CSV_DIR, league.pitchTeamsCsv);
  const playersPath = path.join(CSV_DIR, league.pitchPlayersCsv);
  if (!fs.existsSync(teamsPath) || !fs.existsSync(playersPath)) {
    console.log(`SKIP ${league.label}: CSVs not found`);
    return null;
  }

  const { rows: teamRows } = readCsvFile(teamsPath);
  const { rows: playerRows } = readCsvFile(playersPath);
  const hasNationality = playerRows.some((row) => (row.nationality || '').trim().length > 0);

  const playersByTeam = new Map();
  for (const row of playerRows) {
    const player = toPlayerObject(row);
    if (!playersByTeam.has(player.team_id)) playersByTeam.set(player.team_id, []);
    playersByTeam.get(player.team_id).push(player);
  }

  const errors = [];
  const teamIds = new Set();
  for (const team of teamRows) {
    if (!team.team_id || teamIds.has(team.team_id)) errors.push(`Missing or duplicate team_id "${team.team_id}"`);
    teamIds.add(team.team_id);
  }
  for (const row of playerRows) {
    if (!teamIds.has(row.team_id)) errors.push(`Player ${row.player_id} refers to unknown team_id "${row.team_id}"`);
    if (!row.player_id) errors.push('Player row has no player_id');
  }
  for (const team of teamRows) {
    errors.push(...validateClubRoster(team.team_id, team.name, playersByTeam.get(team.team_id) || []));
  }
  errors.push(...validateUniqueIds(playerRows.map((row) => ({ player_id: row.player_id, team_id: row.team_id }))));

  const dataPath = path.join(DATA_DIR, league.dataFile);
  const previousTeams = await loadTeamsArray(dataPath, league.arrayName);
  let diff = null;
  if (previousTeams) {
    const oldMap = flattenToNameTeam(
      previousTeams.map((team) => ({ team_id: team.id, name: team.name })),
      new Map(previousTeams.map((team) => [team.id, team.players])),
    );
    const newMap = flattenToNameTeam(teamRows, playersByTeam);
    diff = diffClubs(oldMap, newMap);
  }

  const js = buildLeagueJs({
    teams: teamRows,
    playersByTeam,
    arrayName: league.arrayName,
    helperName: league.helperName,
    sourceLabel: league.label,
    hasNationality,
  });

  const totalPlayers = teamRows.reduce((sum, team) => sum + (playersByTeam.get(team.team_id) || []).length, 0);
  return { league, teamCount: teamRows.length, playerCount: totalPlayers, errors, diff, js, dataPath };
}

async function main() {
  const targets = onlyLeague ? ALL_LEAGUES.filter((league) => league.key === onlyLeague) : ALL_LEAGUES;
  if (onlyLeague && !targets.length) {
    console.error(`Unknown league key: ${onlyLeague}`);
    process.exitCode = 1;
    return;
  }

  console.log('=== csv-to-league.mjs ===\n');
  const results = [];
  for (const league of targets) {
    const result = await processLeague(league);
    if (result) results.push(result);
  }
  // Validate global IDs even when generating just one league: collisions with
  // another league would overwrite canonical IndexedDB player registrations.
  const allRows = ALL_LEAGUES.flatMap(league => {
    const source = path.join(CSV_DIR, league.pitchPlayersCsv);
    return fs.existsSync(source) ? readCsvFile(source).rows : [];
  });
  const globalErrors = validateUniqueIds(allRows);
  const invalid = globalErrors.length > 0 || results.some(result => result.errors.length > 0);
  if (invalid) process.exitCode = 1;
  for (const result of results) {
    if (!DRY_RUN && !invalid) fs.writeFileSync(result.dataPath, result.js, 'utf8');
    console.log(`${result.league.label}: ${result.teamCount} teams, ${result.playerCount} players${DRY_RUN ? ' (dry run)' : ' -> ' + result.league.dataFile}`);
    if (result.errors.length) {
      console.error(`  validation errors (${result.errors.length}); no files written:`);
      result.errors.slice(0, 8).forEach((error) => console.log(`    - ${error}`));
      if (result.errors.length > 8) console.log(`    ... and ${result.errors.length - 8} more`);
    }
    if (result.diff) {
      const { added, removed, moved } = result.diff;
      if (!added.length && !removed.length && !moved.length) {
        console.log('  (no roster changes vs. the previous generated file)');
      } else {
        if (added.length) console.log(`  + ${added.length} new: ${added.slice(0, 8).map((player) => `${player.name} (${player.club})`).join(', ')}${added.length > 8 ? ', ...' : ''}`);
        if (removed.length) console.log(`  - ${removed.length} removed: ${removed.slice(0, 8).map((player) => `${player.name} (was ${player.club})`).join(', ')}${removed.length > 8 ? ', ...' : ''}`);
        if (moved.length) console.log(`  ~ ${moved.length} moved club: ${moved.slice(0, 8).map((player) => `${player.name} (${player.from} -> ${player.to})`).join(', ')}${moved.length > 8 ? ', ...' : ''}`);
      }
    } else {
      console.log('  (no previous generated file to diff against)');
    }
    console.log('');
  }
  if (globalErrors.length) console.error(globalErrors.join('\n'));
  console.log(invalid ? 'Validation failed; no files written.' : DRY_RUN ? '(dry run - no files written)' : 'Done.');
}

main();
