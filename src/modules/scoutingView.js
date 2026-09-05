import { baselineAttribute, currentEffectiveLevel } from './playerModel.js';
import { getPotentialStars } from './potential.js';
import { observedPlayerBands, observedPlayerProfile, latestScoutingReport, normalizeScoutingState, scoutingReportIsCurrent } from './scouting.js';

/**
 * UI-only projection over a canonical player row.
 *
 * External recruitment surfaces may sort/filter/display this copy, but transfer
 * commands still receive only the canonical player id and resolve authoritative
 * state themselves. The projection never writes back to the player store.
 */
export function projectScoutedPlayerView(player, scoutingState, context = {}) {
  if (!player) return player;
  const report = observedPlayerProfile(player, scoutingState, context);
  if (!report) return player;

  const currentMin = Number(report.current?.min ?? currentEffectiveLevel(player) ?? 50);
  const currentMax = Number(report.current?.max ?? currentMin);
  const futureMin = Number(report.future?.min ?? currentMin);
  const futureMax = Number(report.future?.max ?? futureMin);
  const currentMid = Math.max(1, Math.min(99, Math.round((currentMin + currentMax) / 2)));
  const futureMid = Math.max(currentMid, Math.min(99, Math.round((futureMin + futureMax) / 2)));
  // A completed dedicated scout reads exactly, so it is not rounded into a band
  // the way a partial observation is.
  const exact = report.exact === true;
  const confidence = exact ? 1 : Math.max(.2, Math.min(.96, Number(report.confidence ?? .42)));
  const coarse = coarsenFor(confidence, exact);
  const feeMin = Math.max(0, Number(report.financial?.feeMin ?? player.value ?? 0));
  const feeMax = Math.max(feeMin, Number(report.financial?.feeMax ?? feeMin));
  const wageMin = Math.max(0, Number(report.financial?.wageMin ?? player.wage ?? 0));
  const wageMax = Math.max(wageMin, Number(report.financial?.wageMax ?? wageMin));

  const projected = {
    ...player,
    attack:coarse(player.attack),
    midfield:coarse(player.midfield),
    defence:coarse(player.defence),
    goalkeeping:coarse(player.goalkeeping),
    value:Math.round((feeMin + feeMax) / 2),
    wage:Math.round((wageMin + wageMax) / 2),
    potentialRating:futureMid,
    potentialKnowledge:confidence,
    isWonderkid:Number(player.age ?? 25) <= 21 && confidence >= .56 && futureMid >= 85,
    scoutingReport:report,
    scoutingView:true,
    fullyScouted:exact,
  };

  // The observed level belongs in whichever attribute the canonical model calls
  // this position's baseline. Re-listing the positions here had CAM writing to
  // midfield while playerModel treats it as an attacker, so a CAM's scouted
  // ability landed in the wrong row.
  projected[baselineAttribute(player.position)] = currentMid;

  return projected;
}

/** Shared by the full projection and the cheap list key, so both fog alike. */
function coarsenFor(confidence, exact) {
  const step = confidence >= .82 ? 2 : confidence >= .56 ? 5 : 10;
  return (value) => (exact
    ? Math.max(1, Math.min(99, Math.round(Number(value) || 1)))
    : Math.max(1, Math.min(99, Math.round((Number(value) || 1) / step) * step)));
}

/**
 * The figures a recruitment list sorts and filters on, without copying the
 * whole player row or building the prose half of a report.
 *
 * Sorting a world-sized list on canonical attributes would both contradict the
 * scouted figures on screen and leak a player's true ability through the
 * ordering. This returns the *observed* ability, fee and potential — the same
 * numbers `projectScoutedPlayerView` derives, asserted equal to them by test —
 * cheaply enough to run over every player in the world on each load.
 *
 * `scoutingViewContext` builds the shared, per-load half of `context` once.
 */
export function projectScoutedListKey(player, scoutingState, context = {}) {
  if (!player) return { rating:0, value:0, potentialStars:0, exact:false };
  const state = context.normalizedScouting ?? normalizeScoutingState(scoutingState, { defaultKnowledge:context.defaultKnowledge ?? .42 });
  const stored = context.reportsByPlayerId
    ? context.reportsByPlayerId.get(String(player.id)) ?? null
    : latestScoutingReport(state, player.id);

  // A player who has actually been scouted is rare enough that the full,
  // report-aware projection is affordable — and it is the only path that honours
  // staleness widening and a dedicated scout's exact reading.
  if (stored && scoutingReportIsCurrent(stored, context.season)) {
    const projected = projectScoutedPlayerView(player, state, context);
    return {
      rating:Math.round(Number(currentEffectiveLevel(projected)) || 0),
      value:Math.round(Number(projected.value) || 0),
      potentialStars:getPotentialStars(projected),
      exact:projected.fullyScouted === true,
    };
  }

  const bands = observedPlayerBands(player, { ...context, confidence:state.defaultKnowledge });
  const currentMid = Math.max(1, Math.min(99, Math.round((bands.current.min + bands.current.max) / 2)));
  const futureMid = Math.max(currentMid, Math.min(99, Math.round((bands.future.min + bands.future.max) / 2)));
  // The rounded figure, exactly as a persisted report would store it and as
  // `projectScoutedPlayerView` reads it back — an unrounded value fogs
  // differently either side of a step boundary.
  const confidence = Math.max(.2, Math.min(.96, bands.storedConfidence));
  const coarse = coarsenFor(confidence, false);
  // Effective level and the potential estimate read a scattered set of fields:
  // traits, rehabilitation, position suitability, form, morale, sharpness,
  // fitness, and the id the potential bias is seeded from. Every one of them is
  // listed here rather than copying the whole row, which is what keeps this
  // affordable over a world-sized list — and `scoutingView.test.js` asserts the
  // result equals the full projection across players that exercise each of
  // them, so a field added to either selector fails a test instead of quietly
  // skewing the market list.
  const shim = {
    id:player.id,
    name:player.name,
    position:player.position,
    age:player.age,
    form:player.form,
    fitness:player.fitness,
    individualMorale:player.individualMorale,
    sharpness:player.sharpness,
    injured:player.injured,
    rehabilitation:player.rehabilitation,
    positionSuitability:player.positionSuitability,
    traits:player.traits,
    growthProfile:player.growthProfile,
    peakAge:player.peakAge,
    attack:coarse(player.attack),
    midfield:coarse(player.midfield),
    defence:coarse(player.defence),
    goalkeeping:coarse(player.goalkeeping),
    potentialRating:futureMid,
    potentialKnowledge:confidence,
    isWonderkid:Number(player.age ?? 25) <= 21 && confidence >= .56 && futureMid >= 85,
  };
  shim[baselineAttribute(player.position)] = currentMid;
  return {
    rating:Math.round(Number(currentEffectiveLevel(shim)) || 0),
    value:Math.round((bands.financial.feeMin + bands.financial.feeMax) / 2),
    potentialStars:getPotentialStars(shim),
    exact:false,
  };
}

/**
 * The per-load half of a projection context: normalising the scouting ledger
 * and indexing its reports once instead of per player.
 */
export function scoutingViewContext(scoutingState, context = {}) {
  const normalizedScouting = normalizeScoutingState(scoutingState, { defaultKnowledge:context.defaultKnowledge ?? .42 });
  const reportsByPlayerId = new Map();
  for (const report of normalizedScouting.reports) reportsByPlayerId.set(String(report.playerId), report);
  return { ...context, normalizedScouting, reportsByPlayerId };
}
