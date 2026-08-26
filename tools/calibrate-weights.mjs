#!/usr/bin/env node
// tools/calibrate-weights.mjs
// Step 2 of docs/plan/06-data-reconciliation.md: "Calibrate [the attribute
// weights] by running the converter over the players present in both
// datasets and minimising the delta against pitch's existing aggregates."
//
// For every player footy-sim and pitch both carry (same club, matched by
// name - see tools/lib/nameMatch.mjs), fits attack/midfield/defence as a
// linear combination of footy-sim's six attributes, per position group
// (DEF/MID/FWD; GK is excluded - pitch's own weight table zeroes it, see
// tools/lib/rating.mjs), via ordinary least squares. Writes tools/weights.json
// for reconcile.mjs to load, and prints mean-absolute-error before/after so
// the ~4-rating-point threshold from the plan can be checked by eye.
//
// Usage: node tools/calibrate-weights.mjs

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readCsvFile } from './lib/csv.mjs';
import { buildTeamIndex, resolveTeam } from './lib/teamMatch.mjs';
import { buildNameIndex, findByName } from './lib/nameMatch.mjs';
import { ATTR_KEYS, posGroup, DEFAULT_WEIGHTS, deriveAggregate } from './lib/rating.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCH_ROOT = path.resolve(__dirname, '..');
const FOOTYSIM_ROOT = path.resolve(__dirname, '../../footy-sim');

const LEAGUES = [
  { fsPlayers: 'prem-players.csv', pitchPlayers: 'pl_players.csv', pitchTeams: 'pl_teams.csv', label: 'Premier League' },
  { fsPlayers: 'championship-players.csv', pitchPlayers: 'championship_players.csv', pitchTeams: 'championship_teams.csv', label: 'Championship' },
  { fsPlayers: 'league1-players.csv', pitchPlayers: 'league_one_players.csv', pitchTeams: 'league_one_teams.csv', label: 'League One' },
  { fsPlayers: 'league2-players.csv', pitchPlayers: 'league_two_players.csv', pitchTeams: 'league_two_teams.csv', label: 'League Two' },
  { fsPlayers: 'bundesliga-players.csv', pitchPlayers: 'bundesliga_players.csv', pitchTeams: 'bundesliga_teams.csv', label: 'Bundesliga' },
  { fsPlayers: 'laliga-players.csv', pitchPlayers: 'la_liga_players.csv', pitchTeams: 'la_liga_teams.csv', label: 'La Liga' },
  { fsPlayers: 'ligue1-players.csv', pitchPlayers: 'ligue_1_players.csv', pitchTeams: 'ligue_1_teams.csv', label: 'Ligue 1' },
];

// samples[group] = { X: number[][], y: { attack: number[], midfield: number[], defence: number[] } }
function emptySamples() {
  return { X: [], y: { attack: [], midfield: [], defence: [] } };
}

function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    if (Math.abs(M[col][col]) < 1e-9) M[col][col] = 1e-9;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// OLS, no intercept, small ridge term for numerical stability.
function fitWeights(X, y, ridge = 1.0) {
  const n = 6;
  const XtX = Array.from({ length: n }, () => new Array(n).fill(0));
  const Xty = new Array(n).fill(0);
  for (let s = 0; s < X.length; s++) {
    for (let i = 0; i < n; i++) {
      Xty[i] += X[s][i] * y[s];
      for (let j = 0; j < n; j++) XtX[i][j] += X[s][i] * X[s][j];
    }
  }
  for (let i = 0; i < n; i++) XtX[i][i] += ridge;
  return solveLinearSystem(XtX, Xty);
}

function mae(pairs) {
  if (pairs.length === 0) return null;
  return pairs.reduce((sum, [a, b]) => sum + Math.abs(a - b), 0) / pairs.length;
}

function main() {
  const samplesByGroup = { DEF: emptySamples(), MID: emptySamples(), FWD: emptySamples() };
  let matchedTotal = 0;

  for (const league of LEAGUES) {
    const fsPath = path.join(FOOTYSIM_ROOT, 'playerdata', league.fsPlayers);
    const pitchPlayersPath = path.join(PITCH_ROOT, 'src/data/csv', league.pitchPlayers);
    const pitchTeamsPath = path.join(PITCH_ROOT, 'src/data/csv', league.pitchTeams);
    if (!fs.existsSync(fsPath)) continue;

    const { rows: fsRows } = readCsvFile(fsPath);
    const { rows: pitchTeams } = readCsvFile(pitchTeamsPath);
    const { rows: pitchPlayers } = readCsvFile(pitchPlayersPath);
    const teamIndex = buildTeamIndex(pitchTeams);
    const nameIndex = buildNameIndex(pitchPlayers);

    let leagueMatched = 0;
    for (const row of fsRows) {
      if (!row.PLAYER_NAME && !row['PLAYER NAME']) continue;
      const name = row['PLAYER NAME'];
      const team = row.TEAM;
      const pos = row.POSITION;
      if (pos === 'GK') continue; // GK aggregates aren't attribute-derived
      const resolved = resolveTeam(team, teamIndex);
      if (!resolved) continue;
      const pitchRow = findByName(nameIndex, resolved.teamId, name);
      if (!pitchRow) continue;

      const attrs = {
        pace: Number(row.SPEED), shooting: Number(row.SHOOTING), passing: Number(row.PASSING),
        dribbling: Number(row.DRIBBLING), defending: Number(row.DEFENSE), physical: Number(row.PHYSICAL),
      };
      if (Object.values(attrs).some((v) => !Number.isFinite(v))) continue;

      const group = posGroup(pos);
      const vec = ATTR_KEYS.map((k) => attrs[k]);
      const s = samplesByGroup[group];
      s.X.push(vec);
      for (const target of ['attack', 'midfield', 'defence']) {
        const pitchVal = Number(pitchRow[target]);
        if (Number.isFinite(pitchVal)) s.y[target].push(pitchVal);
      }
      leagueMatched++;
      matchedTotal++;
    }
    console.log(`${league.label}: ${leagueMatched} matched players`);
  }

  console.log(`\nTotal matched players across all leagues: ${matchedTotal}`);
  if (matchedTotal < 50) {
    console.log('Too few matched players to calibrate reliably - keeping default weights.');
    return;
  }

  const calibrated = { attack: {}, midfield: {}, defence: {} };
  const report = [];

  for (const group of ['DEF', 'MID', 'FWD']) {
    const s = samplesByGroup[group];
    for (const target of ['attack', 'midfield', 'defence']) {
      const X = s.X.slice(0, s.y[target].length);
      const y = s.y[target];
      if (X.length < 10) {
        calibrated[target][group] = DEFAULT_WEIGHTS[target][group];
        continue;
      }
      const w = fitWeights(X, y);
      calibrated[target][group] = w.map((v) => Math.round(v * 1000) / 1000);

      const defaultPairs = X.map((vec, i) => {
        const attrs = Object.fromEntries(ATTR_KEYS.map((k, idx) => [k, vec[idx]]));
        return [deriveAggregate(target, group === 'DEF' ? 'CB' : group === 'MID' ? 'CM' : 'ST', attrs, DEFAULT_WEIGHTS), y[i]];
      });
      const calibratedPairs = X.map((vec, i) => {
        const attrs = Object.fromEntries(ATTR_KEYS.map((k, idx) => [k, vec[idx]]));
        return [deriveAggregate(target, group === 'DEF' ? 'CB' : group === 'MID' ? 'CM' : 'ST', attrs, calibrated), y[i]];
      });
      report.push({
        group, target, n: X.length,
        maeDefault: mae(defaultPairs), maeCalibrated: mae(calibratedPairs),
      });
    }
  }

  calibrated.attack.GK = [0, 0, 0, 0, 0, 0];
  calibrated.midfield.GK = [0, 0, 0, 0, 0, 0];
  calibrated.defence.GK = [0, 0, 0, 0, 0, 0];

  console.log('\nGroup  Target     N     MAE(default)  MAE(calibrated)');
  for (const r of report) {
    console.log(
      `${r.group.padEnd(6)} ${r.target.padEnd(10)} ${String(r.n).padEnd(5)} ` +
      `${(r.maeDefault ?? NaN).toFixed(2).padEnd(13)} ${(r.maeCalibrated ?? NaN).toFixed(2)}`
    );
  }

  const weightedDefaultMae = report.reduce((sum, r) => sum + (r.maeDefault ?? 0) * r.n, 0) / report.reduce((sum, r) => sum + r.n, 0);
  const weightedCalibratedMae = report.reduce((sum, r) => sum + (r.maeCalibrated ?? 0) * r.n, 0) / report.reduce((sum, r) => sum + r.n, 0);
  console.log(`\nWeighted overall MAE: default=${weightedDefaultMae.toFixed(2)}  calibrated=${weightedCalibratedMae.toFixed(2)}  (threshold: ~4)`);

  const outPath = path.join(__dirname, 'weights.json');
  fs.writeFileSync(outPath, JSON.stringify(calibrated, null, 2) + '\n', 'utf8');
  console.log(`\nWrote calibrated weights to ${path.relative(PITCH_ROOT, outPath)}`);
}

main();
