/**
 * Club-quality metrics for the entry screen's club select
 * (docs/plan/07-redesign.md, R1).
 *
 * The picker has to answer "how hard is this club going to be?" *before* a
 * save exists, so everything here works off the static rosters in src/data/
 * rather than anything stored. Player quality comes from matchEngine's own
 * primaryRating(), so the strength shown in the picker is the same view of a
 * player the simulation takes — this is a display metric derived from
 * simulation inputs, never fed back into the simulation.
 *
 * No DOM, same rule as src/modules/.
 */
import { primaryRating } from '../modules/matchEngine.js';

/** Strength is judged on a starting XI, not a whole squad: a 30-man roster's
 *  weak tail says nothing about the side that takes the field. */
export const STARTING_XI = 11;

function ratings(players) {
  if (!Array.isArray(players)) return [];
  return players
    .map((p) => (p ? primaryRating(p) : null))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
}

/**
 * Mean rating of the best XI, 0–100. A squad thinner than 11 is averaged over
 * what it has — Phase 6 left a couple of clubs genuinely short (see CLAUDE.md
 * §0), and dividing those by 11 would libel them.
 */
export function squadStrength(players) {
  const rated = ratings(players);
  if (rated.length === 0) return 0;
  const top = rated.slice(0, STARTING_XI);
  return Math.round(top.reduce((a, b) => a + b, 0) / top.length);
}

/** Best-rated player, for the one name that makes a club feel real. */
export function keyPlayer(players) {
  if (!Array.isArray(players)) return null;
  let best = null;
  let bestRating = -Infinity;
  for (const p of players) {
    if (!p) continue;
    const r = primaryRating(p);
    if (!Number.isFinite(r) || r <= bestRating) continue;
    best = p;
    bestRating = r;
  }
  return best;
}

/**
 * Career difficulty, keyed off reputation rather than squad strength.
 * Reputation is the game's own club-standing scalar — it already drives the
 * starting budget, the board objective and the youth cohort, so it is what
 * actually determines how hard the job is, and a club can have a decent XI
 * while the board still expects survival.
 *
 * Ordered high to low; the first match wins.
 */
const BANDS = [
  { min: 85, key: 'elite',       label: 'Elite',       note: 'Trophies expected, patience short' },
  { min: 74, key: 'contender',   label: 'Contender',   note: 'Europe is the baseline' },
  { min: 62, key: 'established', label: 'Established', note: 'Mid-table, room to build' },
  { min: 48, key: 'underdog',    label: 'Underdog',    note: 'Survival first, ambition later' },
  { min: 0,  key: 'minnows',     label: 'Minnows',     note: 'Every window is a fight' },
];

export function difficultyBand(reputation) {
  const rep = Number.isFinite(reputation) ? reputation : 0;
  return BANDS.find((b) => rep >= b.min) ?? BANDS[BANDS.length - 1];
}
