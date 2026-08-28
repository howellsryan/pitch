import { getAllStandings, getStanding, getTeam, putStanding, putStandingsBulk, putTeam } from './db.js';

/** modules/standings.js — sortTable, applyResult, recomputePositions, blankStandingRow, team morale */

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
  if (!hRow || !aRow) return; // fixture not in this table (cup)

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

// ─── Recompute positions ─────────────────────────────────────
export async function recomputePositions() {
  const rows   = await getAllStandings();
  const sorted = sortTable(rows);
  sorted.forEach((row, i) => { row.position = i + 1; });
  await putStandingsBulk(sorted);
  return sorted;
}

// ─── Public getters ──────────────────────────────────────────
export async function getLeagueTable() {
  const rows = await getAllStandings();
  return sortTable(rows);
}

export async function getTableSliceAroundTeam(teamId, radius = 2) {
  const table = await getLeagueTable();
  const idx   = table.findIndex(r => r.teamId === teamId);
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
// Stored per team (not per player) — eased toward a target set by recent
// form each gameweek, plus small one-off bumps from squad news (contract
// renewals, players leaving). Read by potential.js's growth-point calc as
// a small development-speed multiplier — a real, if modest, effect rather
// than the purely cosmetic label this used to be on Home.
export function moraleTargetFromForm(form) {
  const recent = (form ?? []).slice(-4);
  if (!recent.length) return 50;
  const pts = recent.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
  return Math.round(20 + (pts / (recent.length * 3)) * 70); // 20 (all losses) - 90 (all wins)
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
  return 0.85 + (m / 100) * 0.3; // 0.85x at 0 morale, 1.0x at 50, 1.15x at 100
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
    played:         0, won: 0, drawn: 0, lost: 0,
    goalsFor:       0, goalsAgainst: 0, goalDifference: 0,
    points:         0, position: 0, form: [],
  };
}

