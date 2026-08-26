// tools/lib/teamSynthesis.mjs
// Generates team metadata (stadium, budget, reputation, colors, crest) for a
// club footy-sim places in a tracked league that pitch has no existing
// record of anywhere (a genuinely new entrant to the tracked universe, e.g.
// a promoted-from-an-untracked-tier club). Scaled off the league's own
// existing clubs so a synthesized entrant doesn't stand out - not real-world
// research (pitch has no source for a lower-tier club's actual stadium),
// just a plausible placeholder consistent with the league's data shape.

const PALETTE = [
  { hex: '#DA020E', emoji: '🔴' }, { hex: '#034694', emoji: '🔵' },
  { hex: '#00A650', emoji: '🟢' }, { hex: '#FDB913', emoji: '🟡' },
  { hex: '#000000', emoji: '⚫' }, { hex: '#FFFFFF', emoji: '⚪' },
  { hex: '#F36C21', emoji: '🟠' }, { hex: '#5C2D91', emoji: '🟣' },
  { hex: '#7B3F00', emoji: '🟤' },
];

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function slugify(name) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function mintTeamId(name, existingIds) {
  const base = slugify(name);
  if (!existingIds.has(base)) return base;
  let i = 2;
  while (existingIds.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

// leagueTeams: existing (pre-synthesis) pitch team rows for this league, used
// to scale a new entrant's numbers to a plausible bottom-of-the-table level.
export function synthesizeTeamMetadata(name, leagueLabel, leagueTeams) {
  const h = hashString(name);
  const primary = PALETTE[h % PALETTE.length];
  const secondary = PALETTE[(h >>> 4) % PALETTE.length];
  const crest = primary.hex === secondary.hex ? primary.emoji : `${primary.emoji}${secondary.emoji}`;

  const budgets = leagueTeams.map((t) => Number(t.budget_millions)).filter(Number.isFinite);
  const reps = leagueTeams.map((t) => Number(t.reputation)).filter(Number.isFinite);
  const caps = leagueTeams.map((t) => Number(t.stadium_capacity)).filter(Number.isFinite);

  return {
    name,
    short_name: name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 4) || name.slice(0, 3).toUpperCase(),
    crest,
    league: leagueLabel,
    stadium: `${name} Stadium`,
    stadium_capacity: Math.round(percentile(caps, 0.15)) || 12000,
    budget_millions: Math.max(1, Math.round(percentile(budgets, 0.15))) || 5,
    reputation: Math.max(30, Math.round(percentile(reps, 0.15))) || 50,
    primary_color: primary.hex,
  };
}
