import {
  DETAILED_ATTRIBUTE_KEYS,
  baselineAttribute,
  currentEffectiveLevel,
  normalizeAttributeProfile,
} from './playerModel.js';
import { getPotentialStars } from './potential.js';
import {
  latestScoutingReport,
  normalizeScoutingState,
  observedPlayerBands,
  observedPlayerProfile,
  scoutingReportIsCurrent,
} from './scouting.js';

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
  const exact = report.exact === true;
  const confidence = exact ? 1 : Math.max(.2, Math.min(.96, Number(report.confidence ?? .42)));
  const coarse = coarsenFor(confidence, exact);
  const feeMin = Math.max(0, Number(report.financial?.feeMin ?? player.value ?? 0));
  const feeMax = Math.max(feeMin, Number(report.financial?.feeMax ?? feeMin));
  const wageMin = Math.max(0, Number(report.financial?.wageMin ?? player.wage ?? 0));
  const wageMax = Math.max(wageMin, Number(report.financial?.wageMax ?? wageMin));
  const canonicalProfile = normalizeAttributeProfile(player.attributeProfile, player);
  const attributeProfile = {
    version:canonicalProfile.version,
    ...Object.fromEntries(DETAILED_ATTRIBUTE_KEYS.map(attribute => [attribute, coarse(canonicalProfile[attribute])])),
  };

  const projected = {
    ...player,
    attack:coarse(player.attack),
    midfield:coarse(player.midfield),
    defence:coarse(player.defence),
    goalkeeping:coarse(player.goalkeeping),
    attributeProfile,
    value:Math.round((feeMin + feeMax) / 2),
    wage:Math.round((wageMin + wageMax) / 2),
    potentialRating:futureMid,
    potentialKnowledge:confidence,
    isWonderkid:Number(player.age ?? 25) <= 21 && confidence >= .56 && futureMid >= 85,
    scoutingReport:report,
    scoutingView:true,
    fullyScouted:exact,
  };

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
 * Cheap observed keys for world-sized recruitment lists. Sorting/filtering on
 * canonical values would leak true ability through ordering, so these figures
 * are derived from the same scouting bands used by the full report.
 */
export function projectScoutedListKey(player, scoutingState, context = {}) {
  if (!player) return { rating:0, value:0, potentialStars:0, exact:false };
  const state = context.normalizedScouting
    ?? normalizeScoutingState(scoutingState, { defaultKnowledge:context.defaultKnowledge ?? .42 });
  const stored = context.reportsByPlayerId
    ? context.reportsByPlayerId.get(String(player.id)) ?? null
    : latestScoutingReport(state, player.id);

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
  const confidence = Math.max(.2, Math.min(.96, bands.storedConfidence));
  const coarse = coarsenFor(confidence, false);
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

/** Build the per-load half of a projection context once instead of per player. */
export function scoutingViewContext(scoutingState, context = {}) {
  const normalizedScouting = normalizeScoutingState(
    scoutingState,
    { defaultKnowledge:context.defaultKnowledge ?? .42 },
  );
  const reportsByPlayerId = new Map();
  for (const report of normalizedScouting.reports) reportsByPlayerId.set(String(report.playerId), report);
  return { ...context, normalizedScouting, reportsByPlayerId };
}
