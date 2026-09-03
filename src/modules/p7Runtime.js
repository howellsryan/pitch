import { getAllTeams, getSave, getTeam, putTeam, putTeamsBulk } from './db.js';
import { settleDueObligations } from './clubFinance.js';
import { beginFacilityUpgrade, completeDueFacilityUpgrades } from './facilities.js';

/**
 * modules/p7Runtime.js — P7 weekly club-side tick, called from gameweek.js's
 * runEndOfWorldGameweek alongside P5/P6's own weekly advances. Both steps
 * below are naturally idempotent by removal — settleDueObligations drops a
 * paid obligation from its array, completeDueFacilityUpgrades clears a
 * completed upgrade's `upgrading` marker — so a second call in the same
 * week, or a retry after a partial failure, simply finds nothing left to
 * settle. No separate weekKey/idempotency guard is needed the way
 * p5Runtime.js/p6Runtime.js need one.
 */
export async function advanceP7ClubFinanceWeek(save) {
  if (!save) return { settledTeamIds:[], facilityUpgradesCompleted:[] };
  const teams = await getAllTeams();
  const patches = [];
  const facilityUpgradesCompleted = [];
  for (const team of teams) {
    let next = team;
    if (team.finance?.obligations?.length) next = settleDueObligations(next, save);
    if (team.facilities?.tracks) {
      const withFacilities = completeDueFacilityUpgrades(next, save);
      if (withFacilities !== next) facilityUpgradesCompleted.push(team.id);
      next = withFacilities;
    }
    if (next !== team) patches.push(next);
  }
  if (patches.length) await putTeamsBulk(patches);
  return { settledTeamIds:patches.map(team => team.id), facilityUpgradesCompleted };
}

/** IO command for the user's own club, wired to a product surface in WP7. */
export async function startFacilityUpgrade(track) {
  const save = await getSave();
  if (!save) throw new Error('NO_ACTIVE_SAVE');
  const team = await getTeam(save.userTeamId);
  if (!team) throw new Error('TEAM_NOT_FOUND');
  const weekKey = `${save.season}:${save.currentGameweek}`;
  const updated = beginFacilityUpgrade(team, track, {
    weekKey, season:save.season, currentGameweek:save.currentGameweek, transferMarket:save.transferMarket,
  });
  await putTeam(updated);
  return updated.facilities.tracks[track];
}
