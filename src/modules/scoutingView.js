import { baselineAttribute, currentEffectiveLevel } from './playerModel.js';
import { observedPlayerProfile } from './scouting.js';

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
  const step = confidence >= .82 ? 2 : confidence >= .56 ? 5 : 10;
  const coarse = (value) => (exact
    ? Math.max(1, Math.min(99, Math.round(Number(value) || 1)))
    : Math.max(1, Math.min(99, Math.round((Number(value) || 1) / step) * step)));
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
