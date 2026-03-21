/** modules/standings.js — sortTable, applyResult, recomputePositions, blankStandingRow */

import { getAllStandings, getStanding, putStanding, putStandingsBulk } from './db.js';

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

function mutateRow(row, gf, ga) {
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
