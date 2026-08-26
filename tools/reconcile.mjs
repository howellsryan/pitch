#!/usr/bin/env node
// tools/reconcile.mjs
// Step 2 of docs/plan/06-data-reconciliation.md, footy-sim CSV -> pitch CSV,
// extended to also trust footy-sim's club-to-league placement (verified
// against real 2026/27 promotion/relegation results - see the session's
// audit: Coventry/Ipswich/Hull up to the Prem, Burnley/West Ham/Wolves down,
// Leicester/Oxford/Sheffield Wednesday down to League One - pitch's team
// CSVs were a season stale, not footy-sim's rosters).
//
// For each of footy-sim's 7 leagues, every club footy-sim mentions is
// resolved against pitch's whole team pool (any of the 9 leagues, since a
// club may have moved) and gets footy-sim's converted roster, in whichever
// league footy-sim places it. footy-sim's club count for a tracked league
// always matches the real division size (verified per-league at the bottom
// of this file's own report), so it's treated as the complete, authoritative
// club list: a pitch club in one of the 7 leagues that footy-sim never
// claims has genuinely left that tier (e.g. relegated to a division pitch
// doesn't model) and is dropped, not carried forward stale. Serie A and
// Eredivisie are read (so a same-named club can't collide) but never
// written to - footy-sim has no data for either.
//
// Usage: node tools/reconcile.mjs [--dry-run]

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readCsvFile, writeCsvFile } from './lib/csv.mjs';
import { LEAGUES } from './lib/leagueSchema.mjs';
import { normalizeTeamName, resolveTeam } from './lib/teamMatch.mjs';
import { buildNameIndex, findByName } from './lib/nameMatch.mjs';
import { deriveAggregate, DEFAULT_WEIGHTS, clamp } from './lib/rating.mjs';
import { demonymForCountry } from './lib/nationality.mjs';
import { loadTeamPool, loadPlayerPool } from './lib/pool.mjs';
import { mintTeamId, synthesizeTeamMetadata } from './lib/teamSynthesis.mjs';
import { generatePotential, fitWageModel, fitValueModel } from './lib/fieldGeneration.mjs';
import { validateClubRoster, validateUniqueIds } from './lib/validate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCH_ROOT = path.resolve(__dirname, '..');
const FOOTYSIM_ROOT = path.resolve(__dirname, '../../footy-sim');
const CSV_DIR = path.join(PITCH_ROOT, 'src/data/csv');
const DRY_RUN = process.argv.includes('--dry-run');

const PLAYER_CSV_HEADER = [
  'team_id', 'player_id', 'name', 'nationality', 'position', 'age',
  'attack', 'midfield', 'defence', 'goalkeeping', 'value_millions',
  'wage_thousands', 'potential', 'is_wonderkid',
];
const TEAM_CSV_HEADER = [
  'team_id', 'name', 'short_name', 'crest', 'league', 'stadium',
  'stadium_capacity', 'budget_millions', 'reputation', 'primary_color',
];

function loadWeights() {
  const p = path.join(__dirname, 'weights.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return DEFAULT_WEIGHTS;
}

function newPlayerId(teamId, name, usedIds) {
  const surname = name.trim().split(/\s+/).pop()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const base = `${teamId}_${surname}`;
  if (!usedIds.has(base)) return base;
  let i = 2;
  while (usedIds.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

function convertPlayer(row, teamId, weights, nameIndex, wageModel, valueModel, mintAvoidIds, placedIds) {
  const name = row['PLAYER NAME'];
  const position = row.POSITION;
  const age = Number(row.AGE);
  const rating = Number(row.RATING);
  const attrs = {
    pace: Number(row.SPEED), shooting: Number(row.SHOOTING), passing: Number(row.PASSING),
    dribbling: Number(row.DRIBBLING), defending: Number(row.DEFENSE), physical: Number(row.PHYSICAL),
  };

  const inherited = findByName(nameIndex, teamId, name);

  let attack, midfield, defence, goalkeeping;
  if (position === 'GK') {
    goalkeeping = clamp(rating);
    attack = inherited ? Number(inherited.attack) : 10;
    midfield = inherited ? Number(inherited.midfield) : 11;
    defence = inherited ? Number(inherited.defence) : 13;
  } else {
    attack = deriveAggregate('attack', position, attrs, weights);
    midfield = deriveAggregate('midfield', position, attrs, weights);
    defence = deriveAggregate('defence', position, attrs, weights);
    goalkeeping = 10;
  }

  const overall = position === 'GK' ? goalkeeping : Math.max(attack, midfield, defence);
  const sourceRating = Number.isFinite(rating) ? rating : overall;

  const footySimPotential = Number(row.POTENTIAL);
  let potential = Number.isFinite(footySimPotential) && footySimPotential > 0
    ? clamp(footySimPotential)
    : inherited && Number(inherited.potential) > 0
      ? Number(inherited.potential)
      : generatePotential(overall, age);
  // A player can't have less potential than their current rating - checked
  // against `overall` (the derived per-position aggregate the game actually
  // reads via primaryRating/_primaryRating), not just footy-sim's own RATING
  // column: the calibrated weights can legitimately derive a position
  // aggregate (e.g. a dominant CB's `defence`) higher than footy-sim's more
  // holistic single rating figure.
  potential = Math.max(potential, overall, sourceRating);

  const wage_thousands = inherited && Number(inherited.wage_thousands) > 0
    ? Number(inherited.wage_thousands)
    : wageModel(overall);

  const value_millions = inherited && Number(inherited.value_millions) > 0
    ? Number(inherited.value_millions)
    : valueModel(overall, age);

  const is_wonderkid = inherited
    ? inherited.is_wonderkid === '1' || inherited.is_wonderkid === 'true'
    : (age <= 21 && potential - overall >= 12);

  // Two footy-sim teammates can share initial+surname (nameMatch's join key) and
  // both resolve to the same inherited pitch row - only the first may keep it.
  // `placedIds` tracks ids actually finalized *this run*; `mintAvoidIds` is the
  // full known-id universe (everything already on disk, growing as we go) so a
  // freshly minted id never collides with anything, placed or not.
  const player_id = inherited && !placedIds.has(inherited.player_id)
    ? inherited.player_id
    : newPlayerId(teamId, name, mintAvoidIds);
  mintAvoidIds.add(player_id);
  placedIds.add(player_id);

  return {
    team_id: teamId, player_id, name,
    nationality: demonymForCountry(row.COUNTRY),
    position, age,
    attack, midfield, defence, goalkeeping,
    value_millions, wage_thousands,
    potential, is_wonderkid,
    sourceRating,
  };
}

// footy-sim occasionally has only a handful of rows for a club (Mansfield
// Town: 1, Paris FC: 6) - not a freshness judgment call, just too few
// players to field a team. Tops the squad up from whatever roster already
// exists for this team_id (regardless of which league it used to be filed
// under), preferring footy-sim's real rows for everyone footy-sim covers.
function topUpSquad(converted, teamId, playerPool, placedIds, placedNamesGlobal, departedLower, minSquad = 16, minGk = 2) {
  const haveNames = new Set(converted.map((p) => p.name.toLowerCase()));
  const oldRoster = playerPool
    .filter((p) => p.team_id === teamId
      && !haveNames.has(p.name.toLowerCase())
      && !placedIds.has(p.player_id)
      // A same-universe transfer, not a genuine top-up candidate - they're
      // already accounted for at whichever claimed club footy-sim actually
      // places them at.
      && !placedNamesGlobal.has(p.name.toLowerCase())
      // Departed per Step 5 (only meaningful once a previous footy-sim
      // snapshot exists - empty on the baseline run).
      && !departedLower.has(p.name.toLowerCase()))
    .map((p) => {
      const attack = Number(p.attack), midfield = Number(p.midfield), defence = Number(p.defence), goalkeeping = Number(p.goalkeeping);
      const currentRating = p.position === 'GK' ? goalkeeping : Math.max(attack, midfield, defence);
      return {
        team_id: teamId, player_id: p.player_id, name: p.name,
        nationality: p.nationality || '', position: p.position, age: Number(p.age),
        attack, midfield, defence, goalkeeping, value_millions: Number(p.value_millions),
        wage_thousands: Number(p.wage_thousands),
        // Same invariant convertPlayer enforces - a pre-existing pitch row can
        // predate it (e.g. a stale potential from before this pipeline existed).
        potential: Math.max(Number(p.potential), currentRating),
        is_wonderkid: p.is_wonderkid === '1' || p.is_wonderkid === 'true',
        sourceRating: currentRating,
      };
    })
    .sort((a, b) => b.sourceRating - a.sourceRating);

  const squad = [...converted];
  let added = 0;
  const gkNeeded = () => Math.max(0, minGk - squad.filter((p) => p.position === 'GK').length);
  for (const p of oldRoster) {
    if (squad.length >= minSquad && gkNeeded() === 0) break;
    if (gkNeeded() > 0 && p.position !== 'GK') continue;
    squad.push(p);
    placedIds.add(p.player_id);
    added++;
  }
  // Still short on GK (old roster had none spare either) - take the best
  // remaining old-roster player regardless of position rather than ship an
  // unplayable squad; this only fires when both sources are exhausted.
  for (const p of oldRoster) {
    if (squad.includes(p)) continue;
    if (squad.length >= minSquad && gkNeeded() === 0) break;
    squad.push(p);
    placedIds.add(p.player_id);
    added++;
  }
  return { squad, added };
}

function main() {
  const weights = loadWeights();
  const teamPool = loadTeamPool(CSV_DIR); // team_id -> {..., leagueKey}
  const playerPool = loadPlayerPool(CSV_DIR); // [{..., team_id, leagueKey}]
  const globalTeamIndex = new Map();
  for (const [teamId, rec] of teamPool) globalTeamIndex.set(normalizeTeamName(rec.name), teamId);
  const globalNameIndex = buildNameIndex(playerPool);

  const usedTeamIds = new Set(teamPool.keys());
  // mintAvoidIds: every id that has ever existed, so a freshly minted id never
  // collides with anything - grows as we go. placedIds: ids actually finalized
  // into this run's output so far, starts empty - lets an inherited/topped-up
  // player reuse their own existing id (which is, tautologically, already in
  // mintAvoidIds) while still catching a genuine double-placement.
  const mintAvoidIds = new Set(playerPool.map((p) => p.player_id));
  const placedIds = new Set();

  const claimed = new Map(); // team_id -> { leagueKey, teamMeta, footySimRows, isNew }
  const conflicts = [];
  const synthesized = [];
  const toppedUp = [];

  for (const league of LEAGUES) {
    const fsPath = path.join(FOOTYSIM_ROOT, 'playerdata', league.footySimCsv);
    if (!fs.existsSync(fsPath)) {
      console.log(`SKIP ${league.label}: no footy-sim CSV at ${fsPath}`);
      continue;
    }
    const { rows } = readCsvFile(fsPath);
    const byTeam = new Map();
    for (const row of rows) {
      const team = row.TEAM;
      if (!team) continue;
      if (!byTeam.has(team)) byTeam.set(team, []);
      byTeam.get(team).push(row);
    }

    const existingLeagueTeams = [...teamPool.values()].filter((t) => t.leagueKey === league.key);

    for (const [teamName, teamRows] of byTeam) {
      const resolved = resolveTeam(teamName, globalTeamIndex);
      if (resolved && claimed.has(resolved.teamId)) {
        conflicts.push(`"${teamName}" (-> ${league.label}) resolves to ${resolved.teamId}, already claimed by ${claimed.get(resolved.teamId).leagueKey}`);
        continue;
      }
      let teamId, teamMeta, isNew;
      if (resolved) {
        teamId = resolved.teamId;
        teamMeta = { ...teamPool.get(teamId), name: teamPool.get(teamId).name, league: league.label };
        isNew = false;
      } else {
        teamId = mintTeamId(teamName, usedTeamIds);
        usedTeamIds.add(teamId);
        teamMeta = { team_id: teamId, ...synthesizeTeamMetadata(teamName, league.label, existingLeagueTeams) };
        isNew = true;
        synthesized.push(`${teamName} -> ${league.label} (${teamId}), no existing pitch record`);
      }
      claimed.set(teamId, { leagueKey: league.key, teamMeta, footySimRows: teamRows, isNew, footySimName: teamName });
    }
  }

  // Pass 1: convert every claimed club's footy-sim rows, across ALL 7
  // leagues, before any top-up. This builds a complete picture of everyone
  // footy-sim places anywhere, so a thin club's top-up (pass 2) never
  // resurrects a player who genuinely transferred to a DIFFERENT claimed
  // club - it would otherwise duplicate them (or worse, drag back someone
  // who left the tracked universe entirely, defeating Step 5's departures
  // mechanism for exactly the thin-squad clubs most likely to still be
  // carrying a stale row).
  const convertedByTeam = new Map();
  const placedNamesGlobal = new Set();
  for (const [teamId, entry] of claimed) {
    const wageModel = fitWageModel(playerPool.filter((p) => p.leagueKey === entry.leagueKey));
    const valueModel = fitValueModel(playerPool.filter((p) => p.leagueKey === entry.leagueKey));
    const converted = entry.footySimRows.map((row) =>
      convertPlayer(row, teamId, weights, globalNameIndex, wageModel, valueModel, mintAvoidIds, placedIds)
    );
    for (const p of converted) placedNamesGlobal.add(p.name.toLowerCase());
    convertedByTeam.set(teamId, converted);
  }

  // Step 5 - player departures. This can only compare footy-sim's roster
  // against footy-sim's OWN previous roster - not against pitch's
  // pre-migration data, which independently disagrees with footy-sim on
  // thousands of players for reasons that have nothing to do with anyone
  // leaving football (that whole-dataset disagreement is exactly what this
  // migration exists to resolve, once, this run). So the baseline is a
  // snapshot this tool writes of its own footy-sim-derived output (not
  // top-up padding, which is pitch-native fallback data, not footy-sim's) -
  // the first run has no prior snapshot to diff against and establishes one;
  // every run after that gets real departure detection.
  const SNAPSHOT_PATH = path.join(__dirname, 'footysim-snapshot.json');
  const previousSnapshot = fs.existsSync(SNAPSHOT_PATH)
    ? JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'))
    : null;

  const newSnapshot = [];
  for (const [teamId, converted] of convertedByTeam) {
    for (const p of converted) newSnapshot.push({ name: p.name, team_id: teamId });
  }

  const departedDisplay = [];
  const departedLower = new Set(); // fed back into top-up so padding never resurrects a departed player
  if (previousSnapshot) {
    const newNamesLower = new Set(newSnapshot.map((p) => p.name.toLowerCase()));
    for (const p of previousSnapshot) {
      const stillTrackedClub = claimed.has(p.team_id);
      if (!stillTrackedClub) continue; // whole club left the tier - not a player-level story
      const key = p.name.toLowerCase();
      if (!newNamesLower.has(key) && !departedLower.has(key)) {
        departedLower.add(key);
        departedDisplay.push(`${p.name} (was ${p.team_id})`);
      }
    }
  }
  if (!DRY_RUN) fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(newSnapshot, null, 2) + '\n', 'utf8');

  // Build final per-league team+player lists.
  const report = [];
  for (const league of LEAGUES) {
    const teams = [];
    const players = [];
    const gateErrors = [];
    let movedIn = 0, movedOut = 0, keptInPlace = 0, newClubs = 0;

    for (const [teamId, entry] of claimed) {
      if (entry.leagueKey !== league.key) continue;
      const previousLeagueKey = teamPool.get(teamId)?.leagueKey;
      if (entry.isNew) newClubs++;
      else if (previousLeagueKey === league.key) keptInPlace++;
      else movedIn++;

      let converted = convertedByTeam.get(teamId);
      const { squad, added } = topUpSquad(converted, teamId, playerPool, placedIds, placedNamesGlobal, departedLower);
      converted = squad;
      if (added) toppedUp.push(`${entry.teamMeta.name} (${league.label}): +${added} from its existing roster (footy-sim only had ${converted.length - added})`);

      const errors = validateClubRoster(teamId, entry.teamMeta.name, converted);
      if (errors.length) gateErrors.push(...errors);

      teams.push({ team_id: teamId, ...entry.teamMeta });
      players.push(...converted);
    }

    // No passthrough here: footy-sim's per-league club counts exactly match
    // real division sizes in every one of the 7 leagues (verified against
    // this run's own totals - 20/24/24/24/18/20/18), so footy-sim's roster
    // is treated as the complete, authoritative club list for a league it
    // tracks - a pitch club left unclaimed genuinely left this tier (e.g.
    // relegated to a division pitch doesn't model) rather than just going
    // unmentioned this cycle. Passthrough only happens implicitly for Serie A/
    // Eredivisie, which never enter `claimed` at all (footy-sim has no CSV).
    const droppedNames = [];
    for (const [teamId, rec] of teamPool) {
      if (rec.leagueKey !== league.key) continue;
      const c = claimed.get(teamId);
      if (c && c.leagueKey !== league.key) movedOut++;
      else if (!c) droppedNames.push(rec.name);
    }

    report.push({ league: league.label, key: league.key, teamCount: teams.length, playerCount: players.length, players, movedIn, movedOut, keptInPlace, newClubs, droppedNames, gateErrors });

    if (!DRY_RUN) {
      const teamRows = teams.map((t) => Object.fromEntries(TEAM_CSV_HEADER.map((h) => [h, t[h] ?? ''])));
      writeCsvFile(path.join(CSV_DIR, league.pitchTeamsCsv), TEAM_CSV_HEADER, teamRows);
      const playerRows = players.map((p) => Object.fromEntries(PLAYER_CSV_HEADER.map((h) => [
        h, h === 'is_wonderkid' ? (p[h] ? '1' : '0') : (p[h] ?? ''),
      ])));
      writeCsvFile(path.join(CSV_DIR, league.pitchPlayersCsv), PLAYER_CSV_HEADER, playerRows);
    }
  }

  console.log('\n=== reconcile.mjs report ===');
  for (const r of report) {
    console.log(`\n${r.league}: ${r.teamCount} teams, ${r.playerCount} players`);
    console.log(`  moved in: ${r.movedIn}, moved out: ${r.movedOut}, kept in place: ${r.keptInPlace}, new clubs: ${r.newClubs}, dropped: ${r.droppedNames.length}`);
    if (r.droppedNames.length) console.log(`    dropped (no longer in this tracked league): ${r.droppedNames.join(', ')}`);
    if (r.gateErrors.length) {
      console.log(`  VALIDATION WARNINGS (${r.gateErrors.length}) - see docs/plan/06-data-reconciliation.md Step 3; not blocking, per explicit direction to trust footy-sim's data:`);
      r.gateErrors.slice(0, 10).forEach((e) => console.log(`    - ${e}`));
      if (r.gateErrors.length > 10) console.log(`    ... and ${r.gateErrors.length - 10} more`);
    }
  }
  if (!previousSnapshot) {
    console.log('\nNo previous footy-sim snapshot found - this is the baseline run. Departure detection (Step 5) starts working from the next run of this tool.');
  } else if (departedDisplay.length) {
    console.log(`\nDEPARTED (${departedDisplay.length}) - Step 5: in the previous footy-sim-derived generation at a still-tracked club, not found anywhere in this one:`);
    departedDisplay.forEach((d) => console.log(`  - ${d}`));
  } else {
    console.log('\nNo departures since the last run.');
  }
  if (toppedUp.length) {
    console.log(`\nTopped up ${toppedUp.length} thin footy-sim squads from their existing roster:`);
    toppedUp.forEach((t) => console.log(`  - ${t}`));
  }
  if (synthesized.length) {
    console.log(`\nSynthesized ${synthesized.length} new clubs pitch had no record of:`);
    synthesized.forEach((s) => console.log(`  - ${s}`));
  }
  if (conflicts.length) {
    console.log(`\nCONFLICTS (${conflicts.length}) - a club two footy-sim leagues both claim; dropped, needs a human look:`);
    conflicts.forEach((c) => console.log(`  - ${c}`));
  }
  const dupErrors = validateUniqueIds(report.flatMap((r) => r.players));
  if (dupErrors.length) {
    console.log(`\nDUPLICATE player_id ACROSS LEAGUES (${dupErrors.length}) - converter bug, should never happen:`);
    dupErrors.forEach((e) => console.log(`  - ${e}`));
  }
  console.log(DRY_RUN ? '\n(dry run - no files written)' : '\nCSV files written for all 7 leagues.');
}

main();
