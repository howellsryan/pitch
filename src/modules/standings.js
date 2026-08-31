import { getAllStandings, getSave, getStanding, getTeam, putStanding, putStandingsBulk, putTeam } from './db.js';

/** modules/standings.js — league-aware tables, result projection and team morale */

// ─── Sort helpers ────────────────────────────────────────────
export function sortTable(rows) {
  return [...rows].sort((a, b) => {
    if (b.points          !== a.points)          return b.points          - a.points;
    if (b.goalDifference  !== a.goalDifference)  return b.goalDifference  - a.goalDifference;
    if (b.goalsFor        !== a.goalsFor)        return b.goalsFor        - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });
}

// ─── Apply one result ────────────────────────────────────────
export async function applyResult(result) {
  const [hRow, aRow] = await Promise.all([
    getStanding(result.homeTeamId),
    getStanding(result.awayTeamId),
  ]);
  if (!hRow || !aRow) return; // fixture not in a persisted league table (cup)

  mutateRow(hRow, result.homeGoals, result.awayGoals);
  mutateRow(aRow, result.awayGoals, result.homeGoals);
  await Promise.all([putStanding(hRow), putStanding(aRow)]);
}

export function mutateRow(row, gf, ga) {
  row.played++;
  row.goalsFor      += gf;
  row.goalsAgainst  += ga;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (gf > ga)       { row.won++;   row.points += 3; row.form = [...(row.form ?? []).slice(-4), 'W']; }
  else if (gf === ga){ row.drawn++; row.points += 1; row.form = [...(row.form ?? []).slice(-4), 'D']; }
  else               { row.lost++;                   row.form = [...(row.form ?? []).slice(-4), 'L']; }
}

function groupByLeague(rows) {
  const groups = new Map();
  for (const row of rows) {
    const league = row.league ?? 'Premier League';
    if (!groups.has(league)) groups.set(league, []);
    groups.get(league).push(row);
  }
  return groups;
}

// ─── Recompute positions independently for every world league ─────
export async function recomputePositions() {
  const rows = await getAllStandings();
  const output = [];
  for (const leagueRows of groupByLeague(rows).values()) {
    const sorted = sortTable(leagueRows);
    sorted.forEach((row, index) => { row.position = index + 1; });
    output.push(...sorted);
  }
  await putStandingsBulk(output);
  return output;
}

// ─── Public getters ──────────────────────────────────────────
export async function getLeagueTable(leagueName = null) {
  const rows = await getAllStandings();
  let league = leagueName;
  if (!league) {
    const save = await getSave();
    league = save?.userLeague ?? null;
  }
  const filtered = league ? rows.filter(row => (row.league ?? league) === league) : rows;
  return sortTable(filtered);
}

export async function getTableSliceAroundTeam(teamId, radius = 2) {
  const rows = await getAllStandings();
  const target = rows.find(row => row.teamId === teamId);
  if (!target) return [];
  const league = target.league ?? (await getSave())?.userLeague ?? 'Premier League';
  const table = sortTable(rows.filter(row => (row.league ?? league) === league));
  const idx = table.findIndex(row => row.teamId === teamId);
  if (idx === -1) return table;
  const from = Math.max(0, idx - radius);
  const to   = Math.min(table.length - 1, idx + radius);
  return table.slice(from, to + 1).map((row, i) => ({
    ...row,
    isUserTeam:      row.teamId === teamId,
    displayPosition: from + i + 1,
  }));
}

// ─── Team morale ──────────────────────────────────────────────
export function moraleTargetFromForm(form) {
  const recent = (form ?? []).slice(-4);
  if (!recent.length) return 50;
  const pts = recent.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
  return Math.round(20 + (pts / (recent.length * 3)) * 70);
}

export function easeMorale(current, target, rate = 0.3) {
  const cur = current ?? 50;
  return Math.max(0, Math.min(100, Math.round(cur + (target - cur) * rate)));
}

export function bumpMorale(current, delta) {
  return Math.max(0, Math.min(100, Math.round((current ?? 50) + delta)));
}

export function moraleDevMultiplier(morale) {
  const m = Math.max(0, Math.min(100, morale ?? 50));
  return 0.85 + (m / 100) * 0.3;
}

export async function updateTeamMorale(teamId) {
  const [team, row] = await Promise.all([getTeam(teamId), getStanding(teamId)]);
  if (!team) return;
  const target    = moraleTargetFromForm(row?.form);
  const newMorale = easeMorale(team.morale, target);
  if (newMorale !== (team.morale ?? 50)) await putTeam({ ...team, morale: newMorale });
}

// ─── Build blank standings row ───────────────────────────────
export function blankStandingRow(team) {
  return {
    teamId:         team.id,
    teamName:       team.name,
    shortName:      team.shortName,
    crest:          team.crest,
    league:         team.league ?? 'Premier League',
    played:         0, won: 0, drawn: 0, lost: 0,
    goalsFor:       0, goalsAgainst: 0, goalDifference: 0,
    points:         0, position: 0, form: [],
  };
}
