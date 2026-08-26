// tools/lib/nameMatch.mjs
// Matches a footy-sim full name ("Manuel Neuer") to a pitch row, which may be
// abbreviated ("M. Neuer") outside the Premier League (see CLAUDE.md's
// dataset-comparison table). Exact string equality would miss almost every
// non-PL player, so matching is by (normalized surname + first-initial)
// within the same club - reliable in practice since two same-surname,
// same-initial teammates are rare, and false negatives here just mean a
// player gets treated as unmatched (falls through to "mint a new id /
// generate the missing fields"), never a wrong join.
function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function cleanToken(s) {
  return stripDiacritics(s).toLowerCase().replace(/[^a-z]/g, '');
}

// Returns { surname, initial } or null if the name can't be split.
export function nameKey(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const surname = cleanToken(parts[parts.length - 1]);
  const initial = cleanToken(parts[0])[0] || '';
  if (!surname || !initial) return null;
  return `${initial}|${surname}`;
}

// Builds a Map from `${teamId}::${nameKey}` -> row, for a list of pitch
// player rows that already carry a resolved team_id.
export function buildNameIndex(rows, teamIdField = 'team_id', nameField = 'name') {
  const index = new Map();
  for (const row of rows) {
    const key = nameKey(row[nameField]);
    if (!key) continue;
    index.set(`${row[teamIdField]}::${key}`, row);
  }
  return index;
}

export function findByName(index, teamId, fullName) {
  const key = nameKey(fullName);
  if (!key) return null;
  return index.get(`${teamId}::${key}`) || null;
}
