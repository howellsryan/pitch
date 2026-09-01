import { currentEffectiveLevel } from './playerModel.js';
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
  const confidence = Math.max(.2, Math.min(.96, Number(report.confidence ?? .42)));
  const step = confidence >= .82 ? 2 : confidence >= .56 ? 5 : 10;
  const coarse = (value) => Math.max(1, Math.min(99, Math.round((Number(value) || 1) / step) * step));

  const projected = {
    ...player,
    attack:coarse(player.attack),
    midfield:coarse(player.midfield),
    defence:coarse(player.defence),
    goalkeeping:coarse(player.goalkeeping),
    potentialRating:futureMid,
    potentialKnowledge:confidence,
    isWonderkid:Number(player.age ?? 25) <= 21 && confidence >= .56 && futureMid >= 85,
    scoutingReport:report,
    scoutingView:true,
  };

  if (['ST','CF','RW','LW'].includes(player.position)) projected.attack = currentMid;
  else if (['CM','CDM','CAM','RM','LM'].includes(player.position)) projected.midfield = currentMid;
  else if (['CB','RB','LB'].includes(player.position)) projected.defence = currentMid;
  else if (player.position === 'GK') projected.goalkeeping = currentMid;

  return projected;
}
