// tools/lib/validate.mjs
// Step 3 of docs/plan/06-data-reconciliation.md - the gate a converted
// club's roster must clear before it's written. Applied per-club, to the
// rows the converter is actually substituting in (see the note in
// tools/csv-to-league.mjs): pitch's own pre-existing data for a club that
// footy-sim has no match for is left untouched and is not re-validated
// against this stricter bar - several already-live clubs (Wolves at 14
// players, Ipswich at 1 GK, Le Havre at 12) predate this gate and would
// fail it if it were applied retroactively, which would make the gate
// impossible to ever pass. The gate exists to catch a converter bug or a
// bad footy-sim row, not to re-litigate squads this phase isn't touching.

import { VALID_POSITIONS } from './leagueSchema.mjs';

export function validateClubRoster(teamId, teamName, players, { minSquad = 16, minGk = 2 } = {}) {
  const errors = [];
  if (players.length < minSquad) {
    errors.push(`${teamName} (${teamId}): only ${players.length} players, need >=${minSquad}`);
  }
  const gkCount = players.filter((p) => p.position === 'GK').length;
  if (gkCount < minGk) {
    errors.push(`${teamName} (${teamId}): only ${gkCount} GK, need >=${minGk}`);
  }
  for (const p of players) {
    if (!VALID_POSITIONS.has(p.position)) {
      errors.push(`${teamName} (${teamId}): ${p.name} has invalid position "${p.position}"`);
    }
    for (const field of ['attack', 'midfield', 'defence', 'goalkeeping']) {
      const v = p[field];
      if (!Number.isFinite(v) || v < 1 || v > 99) {
        errors.push(`${teamName} (${teamId}): ${p.name} ${field}=${v} out of range [1,99]`);
      }
    }
    if (!Number.isFinite(p.age) || p.age < 15 || p.age > 45) {
      errors.push(`${teamName} (${teamId}): ${p.name} age=${p.age} out of range [15,45]`);
    }
    // "Current rating" here must match what the game itself reads
    // (matchEngine.js's primaryRating / potential.js's _primaryRating): the
    // single position-relevant aggregate, not footy-sim's own holistic
    // RATING column - a calibrated weight can legitimately derive a position
    // aggregate higher than footy-sim's rounder overall figure.
    const currentRating = p.position === 'GK' ? p.goalkeeping : Math.max(p.attack, p.midfield, p.defence);
    if (Number.isFinite(p.potential) && Number.isFinite(currentRating) && p.potential < currentRating) {
      errors.push(`${teamName} (${teamId}): ${p.name} potential ${p.potential} < rating ${currentRating}`);
    }
  }
  return errors;
}

// Checks a wage bill against a band derived from pitch's own existing
// wage/budget ratios for that league (see tools/reconcile.mjs's
// fitWageModel) - a sanity check on the generator, not a hard game rule.
export function validateWageBand(teamId, teamName, players, budgetMillions, ratioBand) {
  const errors = [];
  const annualWageBill = players.reduce((sum, p) => sum + (p.wage_thousands || 0) * 1000 * 52, 0);
  const budget = budgetMillions * 1_000_000;
  if (budget <= 0) return errors;
  const ratio = annualWageBill / budget;
  if (ratio < ratioBand.min || ratio > ratioBand.max) {
    errors.push(
      `${teamName} (${teamId}): wage bill ratio ${ratio.toFixed(2)} outside band ` +
      `[${ratioBand.min.toFixed(2)}, ${ratioBand.max.toFixed(2)}]`
    );
  }
  return errors;
}

export function validateUniqueIds(allPlayers) {
  const errors = [];
  const seen = new Map();
  for (const p of allPlayers) {
    if (seen.has(p.player_id)) {
      errors.push(`Duplicate player_id "${p.player_id}": ${seen.get(p.player_id)} and ${p.team_id}`);
    } else {
      seen.set(p.player_id, p.team_id);
    }
  }
  return errors;
}

export function validateRatingDelta(deltaSamples, threshold = 4) {
  if (deltaSamples.length === 0) return { mae: null, errors: [] };
  const mae = deltaSamples.reduce((s, d) => s + Math.abs(d), 0) / deltaSamples.length;
  const errors = [];
  if (mae > threshold) {
    errors.push(`Converted-vs-native rating MAE ${mae.toFixed(2)} exceeds threshold ${threshold}`);
  }
  return { mae, errors };
}
