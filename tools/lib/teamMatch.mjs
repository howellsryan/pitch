// tools/lib/teamMatch.mjs
// Resolves a footy-sim TEAM name to a pitch team_id. Exact-string matching is
// not safe here: footy-sim and pitch spell the same club differently often
// enough ("Brighton & Hove Albion" vs "Brighton", "1. FSV Mainz 05" vs
// "Mainz 05") that a real fuzzy step is required. This intentionally does
// NOT try to bridge genuine tier mismatches (a club footy-sim puts in one
// division that pitch has in another) - those are real upstream data errors,
// not naming variants, and are left unmatched on purpose so the caller can
// fall back to pitch's existing roster for that club. See docs/plan/
// 06-data-reconciliation.md Step 2: "fail loudly on a miss, never invent a
// club."

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Generic club-name furniture only - never a word that distinguishes one
// English club from another in the same city (City/United/Town/Albion/
// Athletic/Rovers/Wanderers/Hotspur/Forest/County all stay - stripping them
// collides "Manchester City" with "Manchester United").
const GENERIC_TOKENS = new Set([
  'fc', 'cf', 'ac', 'afc', 'sc', 'cfc', 'bc', 'osc', 'ud', 'rcd', 'sd', 'cd',
  'ca', 'ss', 'ssc', 'asc', 'ol', 'om', 'vfl', 'vfb', 'tsg', 'rb', 'sv',
  'ssv', 'fsv', 'the', 'club', 'calcio', 'de', 'la',
  '1', '04', '05', '1899', '1900', '1904', '1905', '1907', '1909', '1910', '1919',
]);

export function normalizeTeamName(name) {
  let s = stripDiacritics(name).toLowerCase();
  s = s.replace(/[&.'’]/g, ' ');
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  let words = s.split(/\s+/).filter((w) => w && !GENERIC_TOKENS.has(w));
  if (words.length === 0) words = s.split(/\s+/);
  return words.join(' ');
}

// Hand-verified bridges for real abbreviations that normalization can't
// reach algorithmically (no shared substring). Keyed by normalized
// footy-sim name -> normalized pitch name. Extend when audit-rosters.mjs
// reports a new unmatched name that is actually the same club.
const ALIASES = {
  'nottingham forest': 'nottm forest',
  'borussia monchengladbach': "borussia m'gladbach",
};

export function buildTeamIndex(pitchTeams) {
  const byNorm = new Map();
  for (const t of pitchTeams) {
    byNorm.set(normalizeTeamName(t.name), t.team_id);
  }
  return byNorm;
}

// Returns { teamId, method } on a match, or null - never invents a club.
export function resolveTeam(footySimName, teamIndex) {
  let n = normalizeTeamName(footySimName);
  if (ALIASES[n]) {
    const aliased = normalizeTeamName(ALIASES[n]);
    if (teamIndex.has(aliased)) return { teamId: teamIndex.get(aliased), method: 'alias' };
  }
  if (teamIndex.has(n)) return { teamId: teamIndex.get(n), method: 'exact' };
  for (const [pn, id] of teamIndex) {
    if (pn.length >= 4 && n.length >= 4 && (pn.includes(n) || n.includes(pn))) {
      return { teamId: id, method: 'contains' };
    }
  }
  return null;
}
