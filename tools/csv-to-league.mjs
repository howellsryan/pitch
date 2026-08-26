#!/usr/bin/env node
// tools/csv-to-league.mjs
// Steps 3/4 of docs/plan/06-data-reconciliation.md: reads pitch's team+player
// CSVs (as produced by tools/reconcile.mjs, or hand-edited directly) and
// generates src/data/<league>.js - the Node replacement for
// src/csv_to_league.py, folding in footy-sim's validate+diff pattern
// (playergeneration/lib.js) the way Step 4 asks. Also works standalone on
// any CSV pair, same as csv_to_league.py did, for a routine data edit.
//
// Usage:
//   node tools/csv-to-league.mjs                 # regenerate all 7 footy-sim-sourced leagues
//   node tools/csv-to-league.mjs --league=prem    # just one
//   node tools/csv-to-league.mjs --dry-run        # report only, no writes

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readCsvFile } from './lib/csv.mjs';
import { LEAGUES } from './lib/leagueSchema.mjs';
import { validateClubRoster, validateUniqueIds } from './lib/validate.mjs';
import { buildLeagueJs } from './lib/generate.mjs';
import { flattenToNameTeam, diffClubs } from './lib/diff.mjs';
import { loadTeamsArray } from './lib/loadLeagueData.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCH_ROOT = path.resolve(__dirname, '..');
const CSV_DIR = path.join(PITCH_ROOT, 'src/data/csv');
const DATA_DIR = path.join(PITCH_ROOT, 'src/data');

const DRY_RUN = process.argv.includes('--dry-run');
const leagueArg = process.argv.find((a) => a.startsWith('--league='));
const onlyLeague = leagueArg ? leagueArg.split('=')[1] : null;

function toPlayerObject(row) {
  return {
    team_id: row.team_id, player_id: row.player_id, name: row.name,
    nationality: row.nationality || '', position: row.position,
    age: Number(row.age), attack: Number(row.attack), midfield: Number(row.midfield),
    defence: Number(row.defence), goalkeeping: Number(row.goalkeeping),
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
  const hasNationality = playerRows.some((r) => (r.nationality || '').trim().length > 0);

  const playersByTeam = new Map();
  for (const row of playerRows) {
    const p = toPlayerObject(row);
    if (!playersByTeam.has(p.team_id)) playersByTeam.set(p.team_id, []);
    playersByTeam.get(p.team_id).push(p);
  }

  // Step 3 gate, re-checked at generation time (same non-blocking policy as
  // reconcile.mjs - warn loudly, still write; a converter bug (bad range,
  // duplicate id) would be a real error, but none has shown up in practice).
  const errors = [];
  for (const t of teamRows) {
    errors.push(...validateClubRoster(t.team_id, t.name, playersByTeam.get(t.team_id) || []));
  }
  errors.push(...validateUniqueIds(playerRows.map((r) => ({ player_id: r.player_id, team_id: r.team_id }))));

  const dataPath = path.join(DATA_DIR, league.dataFile);
  const previousTeams = await loadTeamsArray(dataPath, league.arrayName);
  let diff = null;
  if (previousTeams) {
    const oldMap = flattenToNameTeam(previousTeams.map((t) => ({ team_id: t.id, name: t.name })), new Map(previousTeams.map((t) => [t.id, t.players])));
    const newMap = flattenToNameTeam(teamRows, playersByTeam);
    diff = diffClubs(oldMap, newMap);
  }

  const js = buildLeagueJs({
    teams: teamRows, playersByTeam, arrayName: league.arrayName,
    helperName: league.helperName, sourceLabel: league.label, hasNationality,
  });

  if (!DRY_RUN) fs.writeFileSync(dataPath, js, 'utf8');

  const totalPlayers = teamRows.reduce((s, t) => s + (playersByTeam.get(t.team_id) || []).length, 0);
  return { league, teamCount: teamRows.length, playerCount: totalPlayers, errors, diff };
}

async function main() {
  const targets = onlyLeague ? LEAGUES.filter((l) => l.key === onlyLeague) : LEAGUES;
  console.log('=== csv-to-league.mjs ===\n');
  for (const league of targets) {
    const result = await processLeague(league);
    if (!result) continue;
    console.log(`${result.league.label}: ${result.teamCount} teams, ${result.playerCount} players${DRY_RUN ? ' (dry run)' : ' -> ' + result.league.dataFile}`);
    if (result.errors.length) {
      console.log(`  Step 3 warnings (${result.errors.length}), not blocking:`);
      result.errors.slice(0, 8).forEach((e) => console.log(`    - ${e}`));
      if (result.errors.length > 8) console.log(`    ... and ${result.errors.length - 8} more`);
    }
    if (result.diff) {
      const { added, removed, moved } = result.diff;
      if (!added.length && !removed.length && !moved.length) {
        console.log('  (no roster changes vs. the previous generated file)');
      } else {
        if (added.length) console.log(`  + ${added.length} new: ${added.slice(0, 8).map((p) => `${p.name} (${p.club})`).join(', ')}${added.length > 8 ? ', ...' : ''}`);
        if (removed.length) console.log(`  - ${removed.length} removed: ${removed.slice(0, 8).map((p) => `${p.name} (was ${p.club})`).join(', ')}${removed.length > 8 ? ', ...' : ''}`);
        if (moved.length) console.log(`  ~ ${moved.length} moved club: ${moved.slice(0, 8).map((p) => `${p.name} (${p.from} -> ${p.to})`).join(', ')}${moved.length > 8 ? ', ...' : ''}`);
      }
    } else {
      console.log('  (no previous generated file to diff against)');
    }
    console.log('');
  }
  console.log(DRY_RUN ? '(dry run - no files written)' : 'Done.');
}

main();
