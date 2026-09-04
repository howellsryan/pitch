// tools/lib/teamMatch.mjs
// Resolves an external TEAM name to a pitch team_id. Exact-string matching is
// not safe here: providers and Pitch spell the same club differently often
// enough ("Brighton & Hove Albion" vs "Brighton", "1. FSV Mainz 05" vs
// "Mainz 05") that a real fuzzy step is required. This intentionally does
// NOT bridge genuine club/tier mismatches: those are data changes, not naming
// variants, and must be handled by the caller rather than silently invented.

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

// Hand-verified bridges for real provider/licensing abbreviations that
// normalization cannot reach algorithmically. The FC27 names below are taken
// from EA's own ratings database/team pages; keeping these explicit is safer
// than making fuzzy matching permissive enough to join unrelated clubs.
const ALIASES = {
  'nottingham forest': 'nottm forest',
  'borussia monchengladbach': "borussia m'gladbach",

  // EA SPORTS FC 27 abbreviations.
  'sheffield wed': 'sheffield wednesday',
  'huddersfield': 'huddersfield town',
  'rotherham utd': 'rotherham united',
  'paris sg': 'paris saint-germain',
  'n e c nijmegen': 'nec nijmegen',
  'az': 'az alkmaar',
  'nac': 'nac breda',
  'heracles': 'heracles almelo',

  // Serie A licensing names in EA SPORTS FC 27.
  'lombardia': 'inter milan',
  'milano': 'ac milan',
  'bergamo': 'atalanta bc',
  'latium': 'ss lazio',

  // Pitch stores legal prefixes which EA omits.
  'fiorentina': 'acf fiorentina',
  'lecce': 'us lecce',
  'sassuolo': 'us sassuolo',
  'cremonese': 'us cremonese',
};

export function buildTeamIndex(pitchTeams) {
  const byNorm = new Map();
  for (const t of pitchTeams) {
    byNorm.set(normalizeTeamName(t.name), t.team_id);
  }
  return byNorm;
}

// Returns { teamId, method } on a match, or null - never invents a club.
export function resolveTeam(externalName, teamIndex) {
  const n = normalizeTeamName(externalName);
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
