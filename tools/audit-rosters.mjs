#!/usr/bin/env node
// tools/audit-rosters.mjs
// Step 1 of docs/plan/06-data-reconciliation.md: a one-time sanity report,
// not a decision gate (footy-sim wins unconditionally per the plan) -
// prints, per club, who's only in footy-sim, who's only in pitch's current
// data, and how many are in both, plus loudly flags any footy-sim TEAM name
// that doesn't resolve to a pitch club at all. Read once before trusting a
// league's converted output; not run in CI.
//
// Usage: node tools/audit-rosters.mjs [--league=prem]

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readCsvFile } from './lib/csv.mjs';
import { LEAGUES } from './lib/leagueSchema.mjs';
import { buildTeamIndex, resolveTeam } from './lib/teamMatch.mjs';
import { nameKey } from './lib/nameMatch.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCH_ROOT = path.resolve(__dirname, '..');
const FOOTYSIM_ROOT = path.resolve(__dirname, '../../footy-sim');
const CSV_DIR = path.join(PITCH_ROOT, 'src/data/csv');

const leagueArg = process.argv.find((a) => a.startsWith('--league='));
const onlyLeague = leagueArg ? leagueArg.split('=')[1] : null;

function main() {
  const targets = onlyLeague ? LEAGUES.filter((l) => l.key === onlyLeague) : LEAGUES;

  for (const league of targets) {
    const fsPath = path.join(FOOTYSIM_ROOT, 'playerdata', league.footySimCsv);
    if (!fs.existsSync(fsPath)) {
      console.log(`\n${league.label}: no footy-sim CSV, skipped`);
      continue;
    }
    const { rows: fsRows } = readCsvFile(fsPath);
    const { rows: pitchTeams } = readCsvFile(path.join(CSV_DIR, league.pitchTeamsCsv));
    const { rows: pitchPlayers } = readCsvFile(path.join(CSV_DIR, league.pitchPlayersCsv));
    const teamIndex = buildTeamIndex(pitchTeams);

    const pitchByTeam = new Map();
    for (const p of pitchPlayers) {
      if (!pitchByTeam.has(p.team_id)) pitchByTeam.set(p.team_id, []);
      pitchByTeam.get(p.team_id).push(p);
    }

    const fsByTeamName = new Map();
    for (const r of fsRows) {
      const team = r.TEAM;
      if (!team) continue;
      if (!fsByTeamName.has(team)) fsByTeamName.set(team, []);
      fsByTeamName.get(team).push(r);
    }

    console.log(`\n========== ${league.label} ==========`);
    const unresolved = [];

    for (const [teamName, fsPlayers] of fsByTeamName) {
      const resolved = resolveTeam(teamName, teamIndex);
      if (!resolved) {
        unresolved.push(teamName);
        continue;
      }
      const pitchSquad = pitchByTeam.get(resolved.teamId) || [];
      const pitchKeys = new Set(pitchSquad.map((p) => nameKey(p.name)));
      const fsKeys = new Set(fsPlayers.map((p) => nameKey(p['PLAYER NAME'])));

      const onlyFs = fsPlayers.filter((p) => !pitchKeys.has(nameKey(p['PLAYER NAME'])));
      const onlyPitch = pitchSquad.filter((p) => !fsKeys.has(nameKey(p.name)));
      const inBoth = fsPlayers.length - onlyFs.length;

      if (onlyFs.length === 0 && onlyPitch.length === 0) continue; // identical, nothing to read
      console.log(`\n${resolved.teamId.toUpperCase()} (footy-sim: "${teamName}")`);
      if (onlyFs.length) {
        console.log(`  only in footy-sim:  ${onlyFs.slice(0, 8).map((p) => `${p['PLAYER NAME']} (${p.POSITION} ${p.RATING})`).join(', ')}${onlyFs.length > 8 ? `, +${onlyFs.length - 8} more` : ''}`);
      }
      if (onlyPitch.length) {
        console.log(`  only in pitch:      ${onlyPitch.slice(0, 8).map((p) => `${p.name} (${p.age})`).join(', ')}${onlyPitch.length > 8 ? `, +${onlyPitch.length - 8} more` : ''}`);
      }
      console.log(`  in both:            ${inBoth}`);
    }

    if (unresolved.length) {
      console.log(`\n  ⚠ footy-sim club names with NO pitch match (${unresolved.length}): ${unresolved.join(', ')}`);
      console.log('    (dropped or synthesized by reconcile.mjs, not invented into an existing club)');
    }
  }
}

main();
