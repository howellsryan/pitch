#!/usr/bin/env node
/**
 * Refreshes Pitch's new-career football data from two current public sources:
 *   1. Transfermarkt datasets (weekly) for current club membership, DOB,
 *      nationality, position and market value.
 *   2. EA SPORTS FC 27's official public ratings pages for current overall and
 *      six face attributes. FC 27 is the post-2025/26 rating baseline, so this
 *      avoids hand-tuned reputation guesses after the 2024/25 + 2025/26 seasons.
 *
 * Transfermarkt's curated clubs table only contains clubs tied to the dataset's
 * tracked competition set. The much broader players table also carries each
 * player's current club ID/name/domestic competition, so this tool derives the
 * complete current-club map from players and then enriches it with clubs.csv.
 * That is what keeps Championship, League One and League Two in the same refresh
 * path as the top-flight leagues.
 *
 * This tool deliberately does NOT run from `npm run build`: normal builds stay
 * deterministic/offline. Run `npm run refresh:players`; the scheduled workflow
 * runs the same command and opens a reviewable data PR.
 *
 * Players whose current club is not represented by a Pitch team are omitted.
 * Existing Pitch players who are genuinely unattached are retained only so the
 * existing new-career free-agent seeder can move them to `free_agents` before
 * the career starts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { readCsvFile, writeCsvFile } from './lib/csv.mjs';
import { ALL_LEAGUES, VALID_POSITIONS } from './lib/leagueSchema.mjs';
import { buildTeamIndex, normalizeTeamName, resolveTeam } from './lib/teamMatch.mjs';
import { demonymForCountry } from './lib/nationality.mjs';
import { generatePotential, fitValueModel, fitWageModel } from './lib/fieldGeneration.mjs';
import {
  CURRENT_SEASON_REFERENCE_DATE,
  TRANSFERMARKT_COMPETITION_TO_LEAGUE,
  aggregatesFromEa,
  aggregatesFromOverall,
  attrsFromEa,
  calculateAge,
  eaNameAliases,
  mapTransfermarktPosition,
  mintPlayerId,
  normalizePersonName,
  overallOfPitchRow,
  roundedMillions,
} from './lib/playerRefresh.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CSV_DIR = path.join(ROOT, 'src/data/csv');
const FREE_AGENT_DATA = path.join(ROOT, 'src/data/startingFreeAgents.js');
const REPORT_PATH = path.join(ROOT, 'tools/player-data-report.json');
const DRY_RUN = process.argv.includes('--dry-run');
const EA_MAX_PAGES = Number(process.env.PITCH_EA_MAX_PAGES || 500);
const MIN_EA_MATCH_RATE = Number(process.env.PITCH_MIN_EA_MATCH_RATE || 0.80);
const TM_BASE = 'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data';
const EA_LIST = 'https://www.ea.com/games/ea-sports-fc/ratings';
const UA = 'Mozilla/5.0 (compatible; PitchRosterRefresh/1.0; +https://github.com/howellsryan/pitch)';

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
const cleanId = (value) => String(value ?? '').trim().replace(/\.0$/, '');
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function parseRfc4180(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  if (!rows.length) return [];
  const header = rows.shift().map((value) => value.replace(/^\uFEFF/, '').trim());
  return rows
    .filter((cols) => cols.some((value) => String(value).trim()))
    .map((cols) => Object.fromEntries(header.map((key, index) => [key, cols[index] ?? ''])));
}

async function fetchWithRetry(url, { binary = false, attempts = 5 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: binary ? '*/*' : 'text/html' } });
      if (response.ok) {
        return {
          body: binary ? Buffer.from(await response.arrayBuffer()) : await response.text(),
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

async function fetchTransfermarktTable(name) {
  const url = `${TM_BASE}/${name}.csv.gz`;
  const response = await fetchWithRetry(url, { binary: true });
  const text = gunzipSync(response.body).toString('utf8');
  return { rows: parseRfc4180(text), url, lastModified: response.lastModified || response.date };
}

function buildCurrentClubRows(tmPlayers, tmClubs) {
  const byId = new Map();
  for (const club of tmClubs) {
    const id = cleanId(club.club_id);
    if (id) byId.set(id, { ...club, club_id: id });
  }
  for (const player of tmPlayers) {
    const id = cleanId(player.current_club_id);
    const name = String(player.current_club_name || '').trim();
    if (!id || !name) continue;
    const competition = String(player.current_club_domestic_competition_id || '').trim();
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, {
        club_id: id,
        name,
        domestic_competition_id: competition,
        derived_from_players: true,
      });
      continue;
    }
    if (!existing.name) existing.name = name;
    if (!existing.domestic_competition_id && competition) existing.domestic_competition_id = competition;
  }
  return [...byId.values()];
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
  return {
    id: String(item.id ?? ''),
    commonName: item.commonName ?? '',
    firstName: item.firstName ?? '',
    lastName: item.lastName ?? '',
    fullName: item.fullName ?? item.name ?? '',
    overallRating: Number(item.overallRating),
    position: { shortLabel: item?.position?.shortLabel ?? item?.position?.label ?? '' },
    team: { label: item?.team?.label ?? item?.team?.name ?? '' },
    gender: item?.gender?.id ?? item?.gender ?? null,
    stats,
  };
}

async function fetchEaPlayers() {
  const seen = new Set();
  const players = [];
  let sourceDate = null;
  for (let page = 1; page <= EA_MAX_PAGES; page++) {
    const separator = EA_LIST.includes('?') ? '&' : '?';
    const url = `${EA_LIST}${separator}gender=0&page=${page}`;
    const response = await fetchWithRetry(url);
    sourceDate ||= response.lastModified || response.date;
    const nextData = parseNextData(response.body);
    const array = biggestAthleteArray(nextData).array || [];
    if (!array.length) {
      if (page === 1) throw new Error('EA FC ratings page did not expose a server-rendered athlete array');
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

function buildEaMatcher(eaPlayers) {
  const byAlias = new Map();
  const bySurname = new Map();
  for (const player of eaPlayers) {
    for (const alias of eaNameAliases(player)) {
      if (!byAlias.has(alias)) byAlias.set(alias, []);
      byAlias.get(alias).push(player);
      const surname = alias.split(' ').filter(Boolean).at(-1);
      if (surname) {
        if (!bySurname.has(surname)) bySurname.set(surname, []);
        bySurname.get(surname).push(player);
      }
    }
  }

  function choose(candidates, clubName) {
    if (!candidates?.length) return null;
    const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
    if (unique.length === 1) return unique[0];
    const clubNorm = normalizeTeamName(clubName || '');
    const clubMatches = unique.filter((candidate) => {
      const teamNorm = normalizeTeamName(candidate.team?.label || '');
      return teamNorm && clubNorm && (teamNorm === clubNorm || teamNorm.includes(clubNorm) || clubNorm.includes(teamNorm));
    });
    if (clubMatches.length === 1) return clubMatches[0];
    return unique.sort((a, b) => b.overallRating - a.overallRating)[0];
  }

  return (name, clubName) => {
    const normalized = normalizePersonName(name);
    const exact = choose(byAlias.get(normalized), clubName);
    if (exact) return { player: exact, method: 'exact' };
    const tokens = normalized.split(' ').filter(Boolean);
    if (!tokens.length) return null;
    const surname = tokens.at(-1);
    const candidates = [...new Map((bySurname.get(surname) || []).map((candidate) => [candidate.id, candidate])).values()];
    let best = null;
    for (const candidate of candidates) {
      for (const alias of eaNameAliases(candidate)) {
        const candidateTokens = alias.split(' ').filter(Boolean);
        const shared = tokens.filter((token) => candidateTokens.includes(token)).length;
        const initialsAgree = tokens[0]?.[0] && candidateTokens[0]?.[0] === tokens[0][0];
        const score = shared * 3 + (initialsAgree ? 1 : 0);
        if (shared >= Math.min(2, tokens.length) && (!best || score > best.score)) best = { candidate, score };
      }
    }
    return best ? { player: best.candidate, method: 'fuzzy' } : null;
  };
}

function buildExistingMatcher(existingPlayers) {
  const exact = new Map();
  const bySurname = new Map();
  for (const player of existingPlayers) {
    const normalized = normalizePersonName(player.name);
    if (!exact.has(normalized)) exact.set(normalized, []);
    exact.get(normalized).push(player);
    const surname = normalized.split(' ').filter(Boolean).at(-1);
    if (surname) {
      if (!bySurname.has(surname)) bySurname.set(surname, []);
      bySurname.get(surname).push(player);
    }
  }
  return (name, targetTeamId, usedIds) => {
    const normalized = normalizePersonName(name);
    const exactMatches = (exact.get(normalized) || []).filter((player) => !usedIds.has(player.player_id));
    const sameTeam = exactMatches.filter((player) => player.team_id === targetTeamId);
    if (sameTeam.length === 1) return sameTeam[0];
    if (exactMatches.length === 1) return exactMatches[0];
    const sourceTokens = normalized.split(' ').filter(Boolean);
    const surname = sourceTokens.at(-1);
    const candidates = (bySurname.get(surname) || []).filter((player) => !usedIds.has(player.player_id));
    const abbreviated = candidates.filter((player) => {
      const oldTokens = normalizePersonName(player.name).split(' ').filter(Boolean);
      if (oldTokens.at(-1) !== surname) return false;
      const oldFirst = oldTokens[0] || '';
      const sourceFirst = sourceTokens[0] || '';
      return oldFirst.length === 1 && sourceFirst.startsWith(oldFirst);
    });
    const abbreviatedSameTeam = abbreviated.filter((player) => player.team_id === targetTeamId);
    if (abbreviatedSameTeam.length === 1) return abbreviatedSameTeam[0];
    if (abbreviated.length === 1) return abbreviated[0];
    return null;
  };
}

function marketValueRatingEstimate(draft, peers) {
  if (!peers.length) return 65;
  const value = finite(draft.source.market_value_in_eur);
  const age = Number(draft.age || 24);
  if (!value || value <= 0) {
    const sorted = peers.map((peer) => peer.rating).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 65;
  }
  const logValue = Math.log10(value + 100000);
  const ranked = peers
    .map((peer) => {
      const peerValue = finite(peer.source.market_value_in_eur) || 100000;
      const distance = Math.abs(Math.log10(peerValue + 100000) - logValue) + Math.abs(Number(peer.age || age) - age) * 0.025;
      return { ...peer, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 16);
  let weighted = 0;
  let weights = 0;
  for (const peer of ranked) {
    const weight = 1 / (0.15 + peer.distance);
    weighted += peer.rating * weight;
    weights += weight;
  }
  return Math.max(45, Math.min(92, Math.round(weighted / weights)));
}

function renderStartingFreeAgents(names, metadata) {
  const escaped = names.map((name) => `  '${String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`).join('\n');
  return `/**\n * Generated by tools/refresh-player-data.mjs.\n * Transfer roster source: ${metadata.transfermarktDate || 'current weekly dataset'}\n * Rating source: EA SPORTS FC 27 (${metadata.eaDate || 'current public database'}).\n */\nexport const STARTING_FREE_AGENT_NAMES = Object.freeze([\n${escaped}\n]);\n`;
}

function loadPitchData() {
  const teams = [];
  const players = [];
  for (const league of ALL_LEAGUES) {
    const teamPath = path.join(CSV_DIR, league.pitchTeamsCsv);
    const playerPath = path.join(CSV_DIR, league.pitchPlayersCsv);
    const teamRows = readCsvFile(teamPath).rows.map(({ __line, ...row }) => ({ ...row, leagueKey: league.key }));
    const playerRows = readCsvFile(playerPath).rows.map(({ __line, ...row }) => ({ ...row, leagueKey: league.key }));
    teams.push(...teamRows);
    players.push(...playerRows);
  }
  return { teams, players };
}

function stripInternal(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !['leagueKey', 'sourceClubId'].includes(key)));
}

async function main() {
  console.log('=== Pitch current-player refresh ===');
  console.log(`Mode: ${DRY_RUN ? 'dry run' : 'write'}\n`);

  const { teams: existingTeams, players: existingPlayers } = loadPitchData();
  console.log(`Pitch baseline: ${existingTeams.length} teams, ${existingPlayers.length} players`);

  console.log('Fetching current Transfermarkt roster tables...');
  const [tmPlayersResult, tmClubsResult] = await Promise.all([
    fetchTransfermarktTable('players'),
    fetchTransfermarktTable('clubs'),
  ]);
  const tmPlayers = tmPlayersResult.rows;
  const tmClubs = tmClubsResult.rows;
  const currentClubs = buildCurrentClubRows(tmPlayers, tmClubs);
  console.log(`  Transfermarkt: ${tmClubs.length} curated clubs, ${currentClubs.length} current clubs derived, ${tmPlayers.length} players`);

  console.log('Fetching official EA SPORTS FC 27 ratings...');
  const eaResult = await fetchEaPlayers();
  const eaPlayers = eaResult.rows;
  console.log(`  EA FC 27: ${eaPlayers.length} men's players\n`);

  const leagueByKey = new Map(ALL_LEAGUES.map((league) => [league.key, league]));
  const pitchTeamIndex = buildTeamIndex(existingTeams);
  const sourceClubById = new Map(currentClubs.map((club) => [cleanId(club.club_id), club]));
  const sourceClubToPitch = new Map();
  const pitchToSourceClub = new Map();

  for (const club of currentClubs) {
    const resolved = resolveTeam(club.name, pitchTeamIndex);
    if (!resolved) continue;
    const clubId = cleanId(club.club_id);
    if (pitchToSourceClub.has(resolved.teamId)) {
      const previous = pitchToSourceClub.get(resolved.teamId);
      const pitchTeam = existingTeams.find((team) => team.team_id === resolved.teamId);
      const expectedCode = Object.entries(TRANSFERMARKT_COMPETITION_TO_LEAGUE).find(([, key]) => key === pitchTeam?.leagueKey)?.[0];
      if (expectedCode && club.domestic_competition_id === expectedCode && previous.domestic_competition_id !== expectedCode) {
        sourceClubToPitch.delete(cleanId(previous.club_id));
      } else continue;
    }
    sourceClubToPitch.set(clubId, resolved.teamId);
    pitchToSourceClub.set(resolved.teamId, club);
  }

  const unresolvedPitchTeams = existingTeams
    .filter((team) => !pitchToSourceClub.has(team.team_id))
    .map((team) => ({ teamId: team.team_id, name: team.name, league: team.leagueKey }));

  const finalTeams = [];
  const teamTargetLeague = new Map();
  const droppedTeams = [];
  const movedTeams = [];
  for (const team of existingTeams) {
    const sourceClub = pitchToSourceClub.get(team.team_id);
    if (!sourceClub) continue;
    const targetLeague = TRANSFERMARKT_COMPETITION_TO_LEAGUE[sourceClub.domestic_competition_id];
    if (!targetLeague || !leagueByKey.has(targetLeague)) {
      droppedTeams.push({ teamId: team.team_id, name: team.name, currentCompetition: sourceClub.domestic_competition_id });
      continue;
    }
    const league = leagueByKey.get(targetLeague);
    const next = {
      ...team,
      league: league.label,
      leagueKey: targetLeague,
      sourceClubId: cleanId(sourceClub.club_id),
    };
    finalTeams.push(next);
    teamTargetLeague.set(team.team_id, targetLeague);
    if (team.leagueKey !== targetLeague) movedTeams.push({ teamId: team.team_id, name: team.name, from: team.leagueKey, to: targetLeague });
  }

  const missingPitchClubs = currentClubs
    .filter((club) => TRANSFERMARKT_COMPETITION_TO_LEAGUE[club.domestic_competition_id] && !sourceClubToPitch.has(cleanId(club.club_id)))
    .map((club) => ({ clubId: cleanId(club.club_id), name: club.name, competition: club.domestic_competition_id }));

  if (unresolvedPitchTeams.length) {
    const sample = unresolvedPitchTeams.slice(0, 20).map((team) => `${team.name} [${team.league}]`).join(', ');
    throw new Error(`Could not reconcile ${unresolvedPitchTeams.length} existing Pitch teams to the current club source: ${sample}`);
  }

  const eaMatch = buildEaMatcher(eaPlayers);
  const existingMatch = buildExistingMatcher(existingPlayers);
  const usedExistingIds = new Set();
  const usedIds = new Set(existingPlayers.map((player) => player.player_id));
  const drafts = [];
  const eaMisses = [];
  let fuzzyEaMatches = 0;
  let movedPlayers = 0;
  let newPlayers = 0;

  for (const source of tmPlayers) {
    const currentClubId = cleanId(source.current_club_id);
    if (!currentClubId || !sourceClubToPitch.has(currentClubId)) continue;
    const targetTeamId = sourceClubToPitch.get(currentClubId);
    const targetLeague = teamTargetLeague.get(targetTeamId);
    if (!targetLeague) continue;
    const sourceClub = sourceClubById.get(currentClubId);
    const existing = existingMatch(source.name, targetTeamId, usedExistingIds);
    if (existing) usedExistingIds.add(existing.player_id);
    else newPlayers++;
    if (existing && existing.team_id !== targetTeamId) movedPlayers++;
    const matched = eaMatch(source.name, sourceClub?.name || source.current_club_name);
    if (matched?.method === 'fuzzy') fuzzyEaMatches++;
    if (!matched) eaMisses.push({ name: source.name, team: sourceClub?.name || source.current_club_name, league: targetLeague });
    const mappedTmPosition = mapTransfermarktPosition(source.sub_position, source.position);
    const eaPosition = String(matched?.player?.position?.shortLabel || '').toUpperCase();
    const position = VALID_POSITIONS.has(eaPosition) ? eaPosition : mappedTmPosition;
    const age = calculateAge(source.date_of_birth) ?? Number(existing?.age ?? 24);
    drafts.push({
      source,
      sourceClub,
      targetTeamId,
      targetLeague,
      existing,
      ea: matched?.player || null,
      rating: matched?.player ? Number(matched.player.overallRating) : null,
      position,
      age,
    });
  }

  const peersByLeague = new Map();
  for (const draft of drafts) {
    if (!Number.isFinite(draft.rating)) continue;
    if (!peersByLeague.has(draft.targetLeague)) peersByLeague.set(draft.targetLeague, []);
    peersByLeague.get(draft.targetLeague).push(draft);
  }
  for (const draft of drafts) {
    if (!Number.isFinite(draft.rating)) draft.rating = marketValueRatingEstimate(draft, peersByLeague.get(draft.targetLeague) || []);
  }

  const overallEaMatchRate = drafts.length ? (drafts.length - eaMisses.length) / drafts.length : 0;
  if (overallEaMatchRate < MIN_EA_MATCH_RATE) {
    throw new Error(`EA FC 27 rating match coverage ${(overallEaMatchRate * 100).toFixed(1)}% is below ${(MIN_EA_MATCH_RATE * 100).toFixed(1)}%`);
  }

  const oldPlayersByLeague = new Map();
  for (const league of ALL_LEAGUES) oldPlayersByLeague.set(league.key, existingPlayers.filter((player) => player.leagueKey === league.key));
  const wageModelByLeague = new Map(ALL_LEAGUES.map((league) => [league.key, fitWageModel(oldPlayersByLeague.get(league.key) || [])]));
  const valueModelByLeague = new Map(ALL_LEAGUES.map((league) => [league.key, fitValueModel(oldPlayersByLeague.get(league.key) || [])]));

  const finalPlayers = [];
  const finalPlayerIds = new Set();
  const ratingSwings = [];

  function finalizeDraft(draft, { forcePlayerId = null } = {}) {
    const rating = Math.max(1, Math.min(99, Math.round(draft.rating)));
    const existing = draft.existing;
    const attrs = draft.ea ? attrsFromEa(draft.ea) : null;
    const aggregates = draft.ea
      ? aggregatesFromEa(draft.position, rating, attrs, undefined, existing)
      : aggregatesFromOverall(draft.position, rating, existing);
    const existingPotential = finite(existing?.potential);
    const potential = Math.max(rating, existingPotential && existingPotential >= rating ? existingPotential : generatePotential(rating, draft.age));
    const marketValueEur = finite(draft.source.market_value_in_eur);
    const valueModel = valueModelByLeague.get(draft.targetLeague);
    const valueMillions = marketValueEur && marketValueEur > 0
      ? roundedMillions((marketValueEur / 1_000_000) * 0.86)
      : Number(existing?.value_millions) > 0
        ? Number(existing.value_millions)
        : valueModel(rating, draft.age);
    const wageModel = wageModelByLeague.get(draft.targetLeague);
    const wageThousands = Number(existing?.wage_thousands) > 0 ? Number(existing.wage_thousands) : wageModel(rating);
    let playerId = forcePlayerId || existing?.player_id;
    if (!playerId) playerId = mintPlayerId(draft.targetTeamId, draft.source.name, usedIds);
    if (finalPlayerIds.has(playerId)) playerId = mintPlayerId(draft.targetTeamId, draft.source.name, usedIds);
    finalPlayerIds.add(playerId);
    const previousOverall = overallOfPitchRow(existing);
    if (existing && Math.abs(previousOverall - rating) >= 4) {
      ratingSwings.push({ name: draft.source.name, team: draft.targetTeamId, from: previousOverall, to: rating, source: draft.ea ? 'EA FC 27' : 'market-value fallback' });
    }
    return {
      team_id: draft.targetTeamId,
      player_id: playerId,
      name: draft.source.name,
      nationality: demonymForCountry(draft.source.country_of_citizenship),
      position: draft.position,
      age: draft.age,
      attack: aggregates.attack,
      midfield: aggregates.midfield,
      defence: aggregates.defence,
      goalkeeping: aggregates.goalkeeping,
      value_millions: valueMillions,
      wage_thousands: wageThousands,
      potential,
      is_wonderkid: existing
        ? (existing.is_wonderkid === '1' || existing.is_wonderkid === 'true' || existing.is_wonderkid === true)
        : (draft.age <= 21 && potential - rating >= 12),
      leagueKey: draft.targetLeague,
    };
  }

  for (const draft of drafts) finalPlayers.push(finalizeDraft(draft));

  // Preserve only genuinely unattached players from the old Pitch universe.
  // They remain under their prior club in the static CSV just long enough for
  // seedVerifiedStartingFreeAgents() to move them to `free_agents` on new game.
  const tmFreeByName = new Map();
  for (const source of tmPlayers) {
    if (cleanId(source.current_club_id)) continue;
    const key = normalizePersonName(source.name);
    if (key) tmFreeByName.set(key, source);
  }
  const includedOldIds = new Set(finalPlayers.map((player) => player.player_id));
  const freeAgentNames = [];
  for (const old of existingPlayers) {
    if (includedOldIds.has(old.player_id)) continue;
    const source = tmFreeByName.get(normalizePersonName(old.name));
    if (!source) continue;
    const targetLeague = teamTargetLeague.get(old.team_id);
    if (!targetLeague) continue;
    const matched = eaMatch(source.name, '');
    const draft = {
      source,
      sourceClub: null,
      targetTeamId: old.team_id,
      targetLeague,
      existing: old,
      ea: matched?.player || null,
      rating: matched?.player ? Number(matched.player.overallRating) : overallOfPitchRow(old),
      position: VALID_POSITIONS.has(String(matched?.player?.position?.shortLabel || '').toUpperCase())
        ? String(matched.player.position.shortLabel).toUpperCase()
        : mapTransfermarktPosition(source.sub_position, source.position),
      age: calculateAge(source.date_of_birth) ?? Number(old.age ?? 24),
    };
    finalPlayers.push(finalizeDraft(draft, { forcePlayerId: old.player_id }));
    freeAgentNames.push(source.name);
  }
  freeAgentNames.sort((a, b) => a.localeCompare(b));

  const playerIds = new Set();
  const duplicateIds = [];
  for (const player of finalPlayers) {
    if (playerIds.has(player.player_id)) duplicateIds.push(player.player_id);
    playerIds.add(player.player_id);
  }
  if (duplicateIds.length) throw new Error(`Duplicate player IDs after refresh: ${duplicateIds.slice(0, 10).join(', ')}`);

  const rosterProblems = [];
  const freeKeys = new Set(freeAgentNames.map(normalizePersonName));
  for (const team of finalTeams) {
    const roster = finalPlayers.filter((player) => player.team_id === team.team_id);
    const activeRoster = roster.filter((player) => !freeKeys.has(normalizePersonName(player.name)));
    const keepers = activeRoster.filter((player) => player.position === 'GK').length;
    if (activeRoster.length < 16 || keepers < 2) rosterProblems.push(`${team.name}: ${activeRoster.length} active players / ${keepers} GK`);
  }
  if (rosterProblems.length) throw new Error(`Current-source roster validation failed:\n  ${rosterProblems.slice(0, 30).join('\n  ')}`);

  const removedPlayerCount = Math.max(0, existingPlayers.length - usedExistingIds.size - freeAgentNames.length);
  const finalByName = new Map(finalPlayers.map((player) => [normalizePersonName(player.name), player]));
  const sanityNames = ['Milos Kerkez', 'Antony'];
  const sanity = Object.fromEntries(sanityNames.map((name) => {
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

  const report = {
    generatedAt: new Date().toISOString(),
    referenceDate: CURRENT_SEASON_REFERENCE_DATE,
    sources: {
      transfermarkt: {
        playersUrl: tmPlayersResult.url,
        clubsUrl: tmClubsResult.url,
        lastModified: tmPlayersResult.lastModified || tmClubsResult.lastModified || null,
      },
      eaFc27: { url: eaResult.url, lastModified: eaResult.lastModified || null },
    },
    baseline: { teams: existingTeams.length, players: existingPlayers.length },
    result: {
      teams: finalTeams.length,
      players: finalPlayers.length,
      freeAgents: freeAgentNames.length,
      movedTeams: movedTeams.length,
      droppedTeams: droppedTeams.length,
      newPlayers,
      movedPlayers,
      removedPlayersApprox: removedPlayerCount,
    },
    ratingCoverage: {
      eaPlayersCrawled: eaPlayers.length,
      rosterPlayers: drafts.length,
      eaMatched: drafts.length - eaMisses.length,
      eaMatchRate: Number(overallEaMatchRate.toFixed(4)),
      fuzzyEaMatches,
      fallbackRatings: eaMisses.length,
    },
    teamResolution: {
      currentClubsDerived: currentClubs.length,
      resolvedPitchTeams: finalTeams.length,
      unresolvedPitchTeams,
      sourceClubsInTrackedLeaguesWithoutPitchTeam: missingPitchClubs,
      movedTeams,
      droppedTeams,
    },
    freeAgents: freeAgentNames,
    ratingSwings: ratingSwings.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from)).slice(0, 200),
    eaMisses: eaMisses.slice(0, 300),
    sanity,
  };

  console.log(`\nResolved teams: ${finalTeams.length}; source clubs omitted because Pitch has no team: ${missingPitchClubs.length}`);
  console.log(`Players: ${finalPlayers.length}; current free agents: ${freeAgentNames.length}; moved between Pitch clubs: ${movedPlayers}; new to Pitch: ${newPlayers}`);
  console.log(`EA FC 27 coverage: ${drafts.length - eaMisses.length}/${drafts.length} (${(overallEaMatchRate * 100).toFixed(1)}%), fuzzy: ${fuzzyEaMatches}`);
  console.log(`Sanity: Kerkez=${JSON.stringify(sanity['Milos Kerkez'])}; Antony=${JSON.stringify(sanity.Antony)}`);

  if (!DRY_RUN) {
    for (const league of ALL_LEAGUES) {
      const teams = finalTeams
        .filter((team) => team.leagueKey === league.key)
        .map(stripInternal);
      const teamIds = new Set(teams.map((team) => team.team_id));
      const players = finalPlayers
        .filter((player) => player.leagueKey === league.key && teamIds.has(player.team_id))
        .map(stripInternal);
      writeCsvFile(path.join(CSV_DIR, league.pitchTeamsCsv), TEAM_HEADER, teams);
      writeCsvFile(path.join(CSV_DIR, league.pitchPlayersCsv), PLAYER_HEADER, players);
      console.log(`  wrote ${league.label}: ${teams.length} teams / ${players.length} players`);
    }
    fs.writeFileSync(FREE_AGENT_DATA, renderStartingFreeAgents(freeAgentNames, {
      transfermarktDate: tmPlayersResult.lastModified,
      eaDate: eaResult.lastModified,
    }), 'utf8');
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`\nReport: ${path.relative(ROOT, REPORT_PATH)}`);
  } else {
    console.log('\nDry run: no repository files written.');
  }
}

main().catch((error) => {
  console.error(`\n❌ player refresh failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
