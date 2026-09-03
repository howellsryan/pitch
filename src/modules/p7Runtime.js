import { getAllTeams, putTeamsBulk } from './db.js';
import { settleDueObligations } from './clubFinance.js';

/**
 * modules/p7Runtime.js — P7 WP3 weekly finance tick. Pays every club's due
 * transfer-installment obligations (scheduled by db.js's
 * settleTransferMarketDealAtomic) once per completed world gameweek, called
 * from gameweek.js's runEndOfWorldGameweek alongside P5/P6's own weekly
 * advances. No separate weekKey/idempotency guard is needed here the way
 * p5Runtime.js/p6Runtime.js need one: settleDueObligations removes a paid
 * obligation from the array, so a second call in the same week (or a retry
 * after a partial failure) simply finds nothing left to pay — the mechanism
 * is naturally idempotent, not merely idempotency-guarded.
 */
export async function advanceP7ClubFinanceWeek(save) {
  if (!save) return { settledTeamIds:[] };
  const teams = await getAllTeams();
  const patches = [];
  for (const team of teams) {
    if (!team.finance?.obligations?.length) continue;
    const settled = settleDueObligations(team, save);
    if (settled !== team) patches.push(settled);
  }
  if (patches.length) await putTeamsBulk(patches);
  return { settledTeamIds:patches.map(team => team.id) };
}
