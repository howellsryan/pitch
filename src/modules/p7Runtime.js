import { getAllTeams, getSave, getTeam, putTeam, putTeamsBulk } from './db.js';
import { settleDueObligations } from './clubFinance.js';
import { beginFacilityUpgrade, completeDueFacilityUpgrades } from './facilities.js';
import { advanceP9PostMarketWeek, advanceP9PreDevelopmentWeek } from './p9Runtime.js';

/**
 * modules/p7Runtime.js — P7 weekly club-side tick, called from gameweek.js's
 * runEndOfWorldGameweek alongside P5/P6's own weekly advances. Both P7 steps
 * below are naturally idempotent by removal — settleDueObligations drops a
 * paid obligation from its array, completeDueFacilityUpgrades clears a
 * completed upgrade's `upgrading` marker — so a second call in the same week,
 * or a retry after a partial failure, simply finds nothing left to settle.
 *
 * P9 deliberately reuses this already-existing post-market IO boundary rather
 * than adding another gameweek orchestrator. P3 itself now generates academy
 * evidence before development; the P9 calls here progress bounded regional
 * scouting, refresh canonical loan agreements and emit reports from the P1
 * participation that has already settled. Their own week/report keys make the
 * calls strict retry-safe no-ops.
 */
export async function advanceP7ClubFinanceWeek(save) {
  if (!save) return {
    settledTeamIds:[], facilityUpgradesCompleted:[],
    academyScoutingCompleted:[], academyProspectsAdded:[], loanReports:[],
  };

  const academyPathways = await advanceP9PreDevelopmentWeek(save).catch(() => ({
    scoutingCompleted:[], prospectsAdded:[],
  }));
  const loanPathways = await advanceP9PostMarketWeek(await getSave()).catch(() => ({ loanReports:[] }));

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
  return {
    settledTeamIds:patches.map(team => team.id),
    facilityUpgradesCompleted,
    academyScoutingCompleted:academyPathways.scoutingCompleted ?? [],
    academyProspectsAdded:academyPathways.prospectsAdded ?? [],
    loanReports:loanPathways.loanReports ?? [],
  };
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
