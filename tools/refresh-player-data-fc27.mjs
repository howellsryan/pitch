#!/usr/bin/env node
/**
 * Refreshes Pitch's new-career player universe from EA SPORTS FC 27.
 *
 * FC 27 is authoritative here for:
 *   - player club affiliation
 *   - overall rating
 *   - position
 *   - six face attributes (PAC/SHO/PAS/DRI/DEF/PHY)
 *   - age/nationality where exposed by EA's server-rendered ratings data
 *
 * Pitch remains authoritative for game-specific fields EA's public ratings
 * listing does not model for us (stable player IDs, wages, values, potential,
 * wonderkid state). Existing values are preserved where a player can be
 * matched; new players are fitted to the existing league curves.
 *
 * Only players whose FC 27 club resolves to one of Pitch's existing teams are
 * imported. We never invent a missing club. Existing Pitch players that FC 27
 * marks as unattached are staged under their previous club solely so the
 * existing new-career free-agent seeder can move them to `free_agents`.
 *
 * The external crawl runs only through `npm run refresh:players` / the scheduled
 * workflow. Ordinary builds remain deterministic and offline.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsvFile, writeCsvFile } from './lib/csv.mjs';
import { ALL_LEAGUES, VALID_POSITIONS } from './lib/leagueSchema.mjs';
import { buildTeamIndex, normalizeTeamName, resolveTeam } from './lib/teamMatch.mjs';
import { demonymForCountry } from './lib/nationality.mjs';
import { generatePotential, fitValueModel, fitWageModel } from './lib/fieldGeneration.mjs';
import {
  CURRENT_SEASON_REFERENCE_DATE,
  aggregatesFromEa,
  attrsFromEa,
  eaNameAliases,
  mintPlayerId,
  normalizePersonName,
  overallOfPitchRow,
} from './lib/playerRefresh.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CSV_DIR = path.join(ROOT, 'src/data/csv');
const FREE_AGENT_DATA = path.join(ROOT, 'src/data/startingFreeAgents.js');
const REPORT_PATH = path.join(ROOT, 'tools/player-data-report.json');
const DRY_RUN = process.argv.includes('--dry-run');
const EA_MAX_PAGES = Number(process.env.PITCH_EA_MAX_PAGES || 500);
const EA_LIST = 'https://www.ea.com/games/ea-sports-fc/ratings';
const UA = 'Mozilla/5.0 (compatible; PitchRosterRefresh/2.0; +https://github.com/howellsryan/pitch)';

const PLAYER_HEADER = [
  'team_id', 'player_id', 'name', 'nationality', 'position', 'age',
  'attack', 'midfield', 'defence', 'goalkeeping', 'value_millions',
  'wage_thousands', 'potential', 'is_wonderkid',
];
const TEAM_HEADER = [
  'team_id', 'name', 'short_name', 'crest', 'league', 'stadium',
  'stadium_capacity', 'budget_millions', 'reputation', 'primary_color',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const isFreeAgentClub = (value) => {
  const normalized = normalizeTeamName(value || '');
  return !normalized || normalized === 'free agents' || normalized === 'free agent';
};

async function fetchWithRetry(url, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
      if (response.ok) {
        return {
          body: await response.text(),
          lastModified: response.headers.get('last-modified'),
          date: response.headers.get('date'),
        };
      }
      lastError = new Error(`${response.status} ${response.statusText}`);
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(`Unable to fetch ${url}: ${lastError?.message || 'unknown error'}`);
}

function parseNextData(html) {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function biggestAthleteArray(value, best = { length: 0, array: null }, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return best;
  seen.add(value);
  if (Array.isArray(value) && value.length && value.some((item) => item && typeof item === 'object' && 'overallRating' in item)) {
    const athletes = value.filter((item) => item && typeof item === 'object' && Number.isFinite(Number(item.overallRating)));
    if (athletes.length > best.length) best = { length: athletes.length, array: athletes };
  }
  for (const nested of Object.values(value)) best = biggestAthleteArray(nested, best, seen);
  return best;
}

function trimEaPlayer(item) {
  const stats = {};
  for (const key of ['pac', 'sho', 'pas', 'dri', 'def', 'phy']) {
    const value = item?.stats?.[key]?.value ?? item?.stats?.[key];
    if (Number.isFinite(Number(value))) stats[key] = { value: Number(value) };
  }
  const age = finite(item.age ?? item.playerAge);
  return {
    id: String(item.id ?? ''),
    commonName: item.commonName ?? '',
    firstName: item.firstName ?? '',
    lastName: item.lastName ?? '',
    fullName: item.fullName ?? item.name ?? '',
    overallRating: Number(item.overallRating),
    position: { shortLabel: item?.position?.shortLabel ?? item?.position?.label ?? '' },
    team: { label: item?.team?.label ?? item?.team?.name ?? '' },
    league: { label: item?.league?.label ?? item?.league?.name ?? '' },
    nationality: { label: item?.nationality?.label ?? item?.nationality?.name ?? '' },
    age,
    gender: item?.gender?.id ?? item?.gender ?? null,
    stats,
  };
}

async function fetchEaPlayers() {
  const seen = new Set();
  const players = [];
  let sourceDate = null;
  for (let page = 1; page <= EA_MAX_PAGES; page++) {
    const url = `${EA_LIST}?gender=0&page=${page}`;
    const response = await fetchWithRetry(url);
    sourceDate ||= response.lastModified || response.date;
    const array = biggestAthleteArray(parseNextData(response.body)).array || [];
    if (!array.length) {
      if (page === 1) throw new Error('EA FC 27 ratings page did not expose a server-rendered athlete array');
      break;
    }
    let fresh = 0;
    for (const raw of array) {
      const item = trimEaPlayer(raw);
      if (!item.id || seen.has(item.id)) continue;
      if (item.gender !== null && Number(item.gender) !== 0) continue;
      seen.add(item.id);
      players.push(item);
      fresh++;
    }
    if (fresh === 0) break;
    if (page % 25 === 0) console.log(`  EA FC 27: ${page} pages, ${players.length} men's players`);
    await sleep(125);
  }
  if (players.length < 10000) throw new Error(`EA FC 27 crawl returned only ${players.length} men's players`);
  return { rows: players, url: EA_LIST, lastModified: sourceDate };
}

function eaDisplayName(player) {
  const common = String(player.commonName || '').trim();
  if (common) return common;
  const firstLast = [player.firstName, player.lastName].filter(Boolean).join(' ').trim();
  return firstLast || String(player.fullName || '').trim() || `EA Player ${player.id}`;
}

function eaClubKey(player) {
  const team = String(player.team?.label || '').trim();
  const league = String(player.league?.label || '').trim();
  return `${league}\u0000${team}`;
}

function loadPitchData() {
  const teams = [];
  const players = [];
  for (const league of ALL_LEAGUES) {
    const teamRows = readCsvFile(path.join(CSV_DIR, league.pitchTeamsCsv)).rows
      .map((row) => ({ ...row, leagueKey: league.key }));
    const playerRows = readCsvFile(path.join(CSV_DIR, league.pitchPlayersCsv)).rows
      .map((row) => ({ ...row, leagueKey: league.key }));
    teams.push(...teamRows);
    players.push(...playerRows);
  }
  return { teams, players };
}

function existingNamesByTeam(existingPlayers) {
  const result = new Map();
  for (const player of existingPlayers) {
    if (!result.has(player.team_id)) result.set(player.team_id, new Set());
    const alias = normalizePersonName(player.name);
    if (alias) result.get(player.team_id).add(alias);
  }
  return result;
}

function eaClubGroups(eaPlayers) {
  const groups = new Map();
  for (const player of eaPlayers) {
    const label = String(player.team?.label || '').trim();
    if (isFreeAgentClub(label)) continue;
    const key = eaClubKey(player);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label,
        league: String(player.league?.label || '').trim(),
        players: [],
      });
    }
    groups.get(key).players.push(player);
  }
  return [...groups.values()];
}

function rosterOverlapScore(eaPlayers, pitchNameSet) {
  if (!pitchNameSet?.size) return 0;
  let score = 0;
  for (const player of eaPlayers) {
    const aliases = eaNameAliases(player);
    if (aliases.some((alias) => pitchNameSet.has(alias))) score++;
  }
  return score;
}

function resolveEaClubs(eaPlayers, existingTeams, existingPlayers) {
  const pitchIndex = buildTeamIndex(existingTeams);
  const pitchNames = existingNamesByTeam(existingPlayers);
  const groups = eaClubGroups(eaPlayers);
  const candidatesByPitch = new Map();
  const unresolvedEaClubs = [];

  for (const group of groups) {
    const direct = resolveTeam(group.label, pitchIndex);
    let candidate = null;
    if (direct) {
      const overlap = rosterOverlapScore(group.players, pitchNames.get(direct.teamId));
      if (direct.method !== 'contains' || overlap >= 3) {
        const methodBonus = direct.method === 'exact' ? 40 : direct.method === 'alias' ? 35 : 15;
        candidate = { pitchTeamId: direct.teamId, method: direct.method, score: overlap * 100 + methodBonus, overlap };
      }
    }
    if (!candidate) {
      const overlaps = existingTeams
        .map((team) => ({
          pitchTeamId: team.team_id,
          overlap: rosterOverlapScore(group.players, pitchNames.get(team.team_id)),
        }))
        .filter((entry) => entry.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap);
      const best = overlaps[0];
      const second = overlaps[1];
      if (best && best.overlap >= 3 && (!second || best.overlap >= second.overlap + 2)) {
        candidate = { ...best, method: 'roster-overlap', score: best.overlap * 100 + 20 };
      }
    }

    if (!candidate) {
      unresolvedEaClubs.push({ name: group.label, league: group.league, players: group.players.length });
      continue;
    }
    if (!candidatesByPitch.has(candidate.pitchTeamId)) candidatesByPitch.set(candidate.pitchTeamId, []);
    candidatesByPitch.get(candidate.pitchTeamId).push({
      ...candidate,
      eaClubKey: group.key,
      eaClub: group.label,
      eaLeague: group.league,
      players: group.players.length,
    });
  }

  const eaClubToPitch = new Map();
  const pitchToEaClub = new Map();
  const collisions = [];
  for (const team of existingTeams) {
    const candidates = (candidatesByPitch.get(team.team_id) || [])
      .sort((a, b) => b.score - a.score || b.players - a.players);
    if (!candidates.length) continue;
    const chosen = candidates[0];
    eaClubToPitch.set(chosen.eaClubKey, team.team_id);
    pitchToEaClub.set(team.team_id, chosen);
    if (candidates.length > 1) collisions.push({ pitchTeamId: team.team_id, chosen, rejected: candidates.slice(1) });
  }

  return { eaClubToPitch, pitchToEaClub, unresolvedEaClubs, collisions };
}

function buildExistingMatcher(existingPlayers) {
  const byAlias = new Map();
  for (const player of existingPlayers) {
    const alias = normalizePersonName(player.name);
    if (!alias) continue;
    if (!byAlias.has(alias)) byAlias.set(alias, []);
    byAlias.get(alias).push(player);
  }
  return (eaPlayer, targetTeamId, usedExistingIds) => {
    const candidates = new Map();
    for (const alias of eaNameAliases(eaPlayer)) {
      for (const player of byAlias.get(alias) || []) {
        if (!usedExistingIds.has(player.player_id)) candidates.set(player.player_id, player);
      }
    }
    const values = [...candidates.values()];
    const sameTeam = values.filter((player) => player.team_id === targetTeamId);
    if (sameTeam.length === 1) return sameTeam[0];
    if (values.length === 1) return values[0];
    return null;
  };
}

function stripInternal(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !['leagueKey', '__line', 'stagedFreeAgent'].includes(key)));
}

function renderStartingFreeAgents(names, eaDate) {
  const escaped = names.map((name) => `  '${String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`).join('\n');
  return `/**\n * Generated by tools/refresh-player-data.mjs.\n * Player club and rating source: EA SPORTS FC 27 (${eaDate || 'current public database'}).\n */\nexport const STARTING_FREE_AGENT_NAMES = Object.freeze([\n${escaped}\n]);\n`;
}

function makeLeagueModels(existingPlayers) {
  const wages = new Map();
  const values = new Map();
  for (const league of ALL_LEAGUES) {
    const players = existingPlayers.filter((player) => player.leagueKey === league.key);
    wages.set(league.key, fitWageModel(players));
    values.set(league.key, fitValueModel(players));
  }
  return { wages, values };
}

async function main() {
  console.log('=== Pitch FC 27 player refresh ===');
  console.log(`Mode: ${DRY_RUN ? 'dry run' : 'write'}\n`);

  const { teams: existingTeams, players: existingPlayers } = loadPitchData();
  console.log(`Pitch baseline: ${existingTeams.length} teams, ${existingPlayers.length} players`);

  console.log('Fetching official EA SPORTS FC 27 player database...');
  const eaResult = await fetchEaPlayers();
  const eaPlayers = eaResult.rows;
  console.log(`  EA FC 27: ${eaPlayers.length} men's players`);

  const { eaClubToPitch, pitchToEaClub, unresolvedEaClubs, collisions } = resolveEaClubs(eaPlayers, existingTeams, existingPlayers);
  const unresolvedPitchTeams = existingTeams
    .filter((team) => !pitchToEaClub.has(team.team_id))
    .map((team) => ({ teamId: team.team_id, name: team.name, league: team.leagueKey }));
  if (unresolvedPitchTeams.length) {
    const sample = unresolvedPitchTeams.slice(0, 30).map((team) => `${team.name} [${team.league}]`).join(', ');
    throw new Error(`Could not reconcile ${unresolvedPitchTeams.length} existing Pitch teams to FC 27 clubs: ${sample}`);
  }

  const teamById = new Map(existingTeams.map((team) => [team.team_id, team]));
  const existingMatch = buildExistingMatcher(existingPlayers);
  const usedExistingIds = new Set();
  const reservedIds = new Set(existingPlayers.map((player) => player.player_id));
  const finalPlayerIds = new Set();
  const { wages: wageModelByLeague, values: valueModelByLeague } = makeLeagueModels(existingPlayers);
  const finalPlayers = [];
  const ratingSwings = [];
  const ageFallbacks = [];
  const nationalityFallbacks = [];
  let movedPlayers = 0;
  let newPlayers = 0;

  function finalizeEaPlayer(ea, targetTeamId, existing, { stagedFreeAgent = false } = {}) {
    const team = teamById.get(targetTeamId);
    const targetLeague = team.leagueKey;
    const rating = Math.max(1, Math.min(99, Math.round(Number(ea.overallRating))));
    const eaPosition = String(ea.position?.shortLabel || '').toUpperCase();
    const position = VALID_POSITIONS.has(eaPosition) ? eaPosition : String(existing?.position || 'CM').toUpperCase();
    const age = Number.isFinite(ea.age) && ea.age > 14 && ea.age < 60
      ? ea.age
      : Number(existing?.age || 24);
    if (!(Number.isFinite(ea.age) && ea.age > 14 && ea.age < 60)) ageFallbacks.push(eaDisplayName(ea));
    const nationalityLabel = String(ea.nationality?.label || '').trim();
    const nationality = nationalityLabel ? demonymForCountry(nationalityLabel) : String(existing?.nationality || '');
    if (!nationalityLabel) nationalityFallbacks.push(eaDisplayName(ea));
    const attrs = attrsFromEa(ea);
    const aggregates = aggregatesFromEa(position, rating, attrs, undefined, existing);
    const existingPotential = finite(existing?.potential);
    const potential = Math.min(99, Math.max(
      rating,
      existingPotential && existingPotential >= rating ? existingPotential : generatePotential(rating, age),
    ));
    const wageModel = wageModelByLeague.get(targetLeague);
    const valueModel = valueModelByLeague.get(targetLeague);
    const wageThousands = Number(existing?.wage_thousands) > 0 ? Number(existing.wage_thousands) : wageModel(rating);
    const valueMillions = Number(existing?.value_millions) > 0 ? Number(existing.value_millions) : valueModel(rating, age);
    let playerId = existing?.player_id;
    if (!playerId) playerId = mintPlayerId(targetTeamId, eaDisplayName(ea), reservedIds);
    if (finalPlayerIds.has(playerId)) playerId = mintPlayerId(targetTeamId, eaDisplayName(ea), reservedIds);
    finalPlayerIds.add(playerId);

    const previousOverall = overallOfPitchRow(existing);
    if (existing && Math.abs(previousOverall - rating) >= 4) {
      ratingSwings.push({ name: eaDisplayName(ea), team: targetTeamId, from: previousOverall, to: rating });
    }

    return {
      team_id: targetTeamId,
      player_id: playerId,
      name: eaDisplayName(ea),
      nationality,
      position,
      age,
      attack: aggregates.attack,
      midfield: aggregates.midfield,
      defence: aggregates.defence,
      goalkeeping: aggregates.goalkeeping,
      value_millions: valueMillions,
      wage_thousands: wageThousands,
      potential,
      is_wonderkid: existing
        ? (existing.is_wonderkid === '1' || existing.is_wonderkid === 'true' || existing.is_wonderkid === true)
        : (age <= 21 && potential - rating >= 12),
      leagueKey: targetLeague,
      stagedFreeAgent,
    };
  }

  for (const ea of eaPlayers) {
    const clubLabel = String(ea.team?.label || '').trim();
    if (isFreeAgentClub(clubLabel)) continue;
    const targetTeamId = eaClubToPitch.get(eaClubKey(ea));
    if (!targetTeamId) continue;
    const existing = existingMatch(ea, targetTeamId, usedExistingIds);
    if (existing) {
      usedExistingIds.add(existing.player_id);
      if (existing.team_id !== targetTeamId) movedPlayers++;
    } else newPlayers++;
    finalPlayers.push(finalizeEaPlayer(ea, targetTeamId, existing));
  }

  // FC 27 can expose unattached players with no club / a free-agent club label.
  // If Pitch already carried that player, retain the row under their old team so
  // the existing new-career seeder moves them into the free-agent pool.
  const freeAgentNames = [];
  for (const ea of eaPlayers) {
    const clubLabel = String(ea.team?.label || '').trim();
    if (!isFreeAgentClub(clubLabel)) continue;
    const existing = existingMatch(ea, null, usedExistingIds);
    if (!existing || !teamById.has(existing.team_id)) continue;
    usedExistingIds.add(existing.player_id);
    const row = finalizeEaPlayer(ea, existing.team_id, existing, { stagedFreeAgent: true });
    finalPlayers.push(row);
    freeAgentNames.push(row.name);
  }
  freeAgentNames.sort((a, b) => a.localeCompare(b));

  const duplicates = [];
  const ids = new Set();
  for (const player of finalPlayers) {
    if (ids.has(player.player_id)) duplicates.push(player.player_id);
    ids.add(player.player_id);
  }
  if (duplicates.length) throw new Error(`Duplicate player IDs after FC 27 refresh: ${duplicates.slice(0, 10).join(', ')}`);

  const rosterProblems = [];
  for (const team of existingTeams) {
    const active = finalPlayers.filter((player) => player.team_id === team.team_id && !player.stagedFreeAgent);
    const keepers = active.filter((player) => player.position === 'GK').length;
    if (active.length < 16 || keepers < 1) rosterProblems.push(`${team.name}: ${active.length} active players / ${keepers} GK`);
  }
  if (rosterProblems.length) {
    throw new Error(`FC 27 roster validation failed:\n  ${rosterProblems.slice(0, 40).join('\n  ')}`);
  }

  const finalByName = new Map(finalPlayers.map((player) => [normalizePersonName(player.name), player]));
  const sanity = Object.fromEntries(['Milos Kerkez', 'Antony'].map((name) => {
    const player = finalByName.get(normalizePersonName(name));
    return [name, player ? {
      teamId: player.team_id,
      position: player.position,
      overall: overallOfPitchRow(player),
      attack: player.attack,
      midfield: player.midfield,
      defence: player.defence,
      goalkeeping: player.goalkeeping,
    } : null];
  }));

  const clubResolution = existingTeams.map((team) => ({
    teamId: team.team_id,
    pitchName: team.name,
    eaClub: pitchToEaClub.get(team.team_id)?.eaClub || null,
    eaLeague: pitchToEaClub.get(team.team_id)?.eaLeague || null,
    method: pitchToEaClub.get(team.team_id)?.method || null,
    rosterOverlap: pitchToEaClub.get(team.team_id)?.overlap || 0,
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    referenceDate: CURRENT_SEASON_REFERENCE_DATE,
    sourceOfTruth: {
      clubs: 'EA SPORTS FC 27',
      ratings: 'EA SPORTS FC 27',
      positions: 'EA SPORTS FC 27',
      attributes: 'EA SPORTS FC 27',
    },
    sources: {
      eaFc27: { url: eaResult.url, lastModified: eaResult.lastModified || null },
    },
    baseline: { teams: existingTeams.length, players: existingPlayers.length },
    result: {
      teams: existingTeams.length,
      players: finalPlayers.length,
      freeAgents: freeAgentNames.length,
      movedPlayers,
      newPlayers,
      removedPlayersApprox: Math.max(0, existingPlayers.length - usedExistingIds.size),
    },
    coverage: {
      eaPlayersCrawled: eaPlayers.length,
      pitchTeamsResolved: pitchToEaClub.size,
      pitchTeamsTotal: existingTeams.length,
      fc27RatedPlayersImported: finalPlayers.length,
      ratingsFallback: 0,
      ageFallbacks: ageFallbacks.length,
      nationalityFallbacks: nationalityFallbacks.length,
    },
    teamResolution: {
      clubs: clubResolution,
      unresolvedPitchTeams,
      unresolvedEaClubs: unresolvedEaClubs.slice(0, 400),
      collisions,
    },
    freeAgents: freeAgentNames,
    ageFallbacks: ageFallbacks.slice(0, 300),
    nationalityFallbacks: nationalityFallbacks.slice(0, 300),
    ratingSwings: ratingSwings.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from)).slice(0, 250),
    sanity,
  };

  console.log(`\nFC 27 clubs resolved: ${pitchToEaClub.size}/${existingTeams.length}`);
  console.log(`Players imported: ${finalPlayers.length}; moved clubs: ${movedPlayers}; new to Pitch: ${newPlayers}; free agents staged: ${freeAgentNames.length}`);
  console.log(`Ratings: ${finalPlayers.length}/${finalPlayers.length} from EA FC 27 (100.0%)`);
  console.log(`Metadata fallbacks: age=${ageFallbacks.length}, nationality=${nationalityFallbacks.length}`);
  console.log(`Sanity: Kerkez=${JSON.stringify(sanity['Milos Kerkez'])}; Antony=${JSON.stringify(sanity.Antony)}`);

  if (!DRY_RUN) {
    for (const league of ALL_LEAGUES) {
      const teams = existingTeams.filter((team) => team.leagueKey === league.key).map(stripInternal);
      const teamIds = new Set(teams.map((team) => team.team_id));
      const players = finalPlayers
        .filter((player) => player.leagueKey === league.key && teamIds.has(player.team_id))
        .map(stripInternal);
      writeCsvFile(path.join(CSV_DIR, league.pitchTeamsCsv), TEAM_HEADER, teams);
      writeCsvFile(path.join(CSV_DIR, league.pitchPlayersCsv), PLAYER_HEADER, players);
      console.log(`  wrote ${league.label}: ${teams.length} teams / ${players.length} players`);
    }
    fs.writeFileSync(FREE_AGENT_DATA, renderStartingFreeAgents(freeAgentNames, eaResult.lastModified), 'utf8');
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`\nReport: ${path.relative(ROOT, REPORT_PATH)}`);
  } else {
    console.log('\nDry run: no repository files were changed.');
  }
}

main().catch((error) => {
  console.error(`\n❌ player refresh failed: ${error.stack || error.message || error}`);
  process.exitCode = 1;
});
