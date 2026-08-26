// tools/lib/rating.mjs
// footy-sim's six FIFA-style attributes (pace/shooting/passing/dribbling/
// defending/physical) collapse into pitch's four aggregates (attack/midfield/
// defence/goalkeeping), weighted by position group. See docs/plan/
// 06-data-reconciliation.md Step 2. Weights here are the plan's starting
// point; tools/calibrate-weights.mjs fits a calibrated replacement against
// players present in both datasets and writes tools/weights.json, which
// reconcile.mjs loads in preference to these defaults.

export const ATTR_KEYS = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'];

export function posGroup(pos) {
  if (pos === 'GK') return 'GK';
  if (pos === 'CB' || pos === 'RB' || pos === 'LB') return 'DEF';
  if (pos === 'CDM' || pos === 'CM' || pos === 'RM' || pos === 'LM' || pos === 'CAM') return 'MID';
  return 'FWD'; // RW, LW, CF, ST
}

export const DEFAULT_WEIGHTS = {
  attack: {
    GK: [0, 0, 0, 0, 0, 0],
    DEF: [0.15, 0.10, 0.20, 0.20, 0.05, 0.30],
    MID: [0.15, 0.20, 0.30, 0.25, 0.00, 0.10],
    FWD: [0.20, 0.35, 0.15, 0.25, 0.00, 0.05],
  },
  midfield: {
    GK: [0, 0, 0, 0, 0, 0],
    DEF: [0.10, 0.05, 0.35, 0.25, 0.10, 0.15],
    MID: [0.10, 0.10, 0.40, 0.25, 0.05, 0.10],
    FWD: [0.15, 0.10, 0.30, 0.30, 0.00, 0.15],
  },
  defence: {
    GK: [0, 0, 0, 0, 0, 0],
    DEF: [0.15, 0.00, 0.05, 0.05, 0.55, 0.20],
    MID: [0.10, 0.00, 0.10, 0.05, 0.55, 0.20],
    FWD: [0.10, 0.00, 0.10, 0.05, 0.55, 0.20],
  },
};

export function clamp(v, lo = 1, hi = 99) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

// attrs: { pace, shooting, passing, dribbling, defending, physical } (footy-sim's
// six, in that order). Returns 1-99. GK aggregates are not derived from
// attributes at all (the plan's own weight table zeroes them) - callers
// should inherit/default those, not call this for a GK's attack/midfield/defence.
export function deriveAggregate(target, pos, attrs, weights = DEFAULT_WEIGHTS) {
  const group = posGroup(pos);
  const w = weights[target][group];
  const vals = [attrs.pace, attrs.shooting, attrs.passing, attrs.dribbling, attrs.defending, attrs.physical];
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += w[i] * vals[i];
  return clamp(sum);
}
