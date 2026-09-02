import { getAllManagers, getAllStandings, getAllTeams, getFixturesByGW, getSave, putManagersBulk, putSave } from './db.js';
import {
  MAX_MANAGER_TICK_KEYS,
  accrueManagerRecordsForWeek,
  applyReputationDelta,
  dismissAndCaretake,
  evaluateClubReview,
  isReviewCheckpointDue,
  reviewCheckpointKey,
} from './managerCareer.js';
import { createCaretakerManager, createEmptyManagerMarket } from './managers.js';

/** modules/p6Runtime.js — bounded persistence/runtime facade for P6 WP2. */

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

/**
 * P6's once-per-world-week step, called alongside P5/P4's ticks from the same
 * `runEndOfWorldGameweek` boundary in gameweek.js. Accrues this week's match
 * records for every employed manager, then — at most once per bounded review
 * checkpoint (`MANAGER_REVIEW_INTERVAL_GWS`) — evaluates every AI-managed
 * club and dismisses/replaces-with-caretaker where warranted. The user's own
 * manager is scored but never auto-dismissed here (see managerCareer.js).
 */
export async function advanceP6ManagerCareerWeek(saveInput = null) {
  let save = saveInput ?? await getSave();
  if (!save) return { save, dismissed:[], warnings:[], alreadyProcessed:true };
  const market = save.managerMarket ?? createEmptyManagerMarket();
  const weekKey = reviewCheckpointKey(save);
  if ((market.processedWeekKeys ?? []).includes(weekKey)) {
    return { save, dismissed:[], warnings:[], alreadyProcessed:true };
  }

  const [managers, teams, fixtures] = await Promise.all([
    getAllManagers(), getAllTeams(), getFixturesByGW(save.currentGameweek),
  ]);
  const originalById = new Map(managers.map(manager => [manager.id, manager]));
  const workingById = new Map(originalById);

  for (const patched of accrueManagerRecordsForWeek(managers, fixtures)) {
    workingById.set(patched.id, patched);
  }

  const dismissed = [];
  const warnings = [];
  let vacancies = market.vacancies ?? [];
  let reviewedCheckpoints = market.reviewedCheckpoints ?? [];

  if (isReviewCheckpointDue(save)) {
    const managerByClubId = new Map(
      [...workingById.values()]
        .filter(manager => manager.status === 'employed' && manager.currentClubId)
        .map(manager => [manager.currentClubId, manager]),
    );
    const standingByClub = new Map((await getAllStandings()).map(standing => [standing.teamId, standing]));
    const teamsByLeague = groupBy(teams, team => team.league ?? 'Premier League');

    for (const team of teams) {
      const manager = managerByClubId.get(team.id);
      if (!manager) continue;
      const review = evaluateClubReview({
        manager, team, standing:standingByClub.get(team.id),
        leagueTeams:teamsByLeague.get(team.league ?? 'Premier League') ?? [team],
        save,
      });
      // The user is scored like any other club (reputation/warning feed a
      // future Inbox/Home surface) but a 'dismiss' outcome is never applied
      // to them here — real user job movement is gated behind WP5/WP6.
      if (review.outcome === 'dismiss' && !manager.isUser) {
        const caretaker = createCaretakerManager(team, { weekKey, currentDate:save.currentDate });
        const { dismissedManager, caretakerManager, vacancy } = dismissAndCaretake(manager, caretaker, { weekKey });
        workingById.set(dismissedManager.id, dismissedManager);
        workingById.set(caretakerManager.id, caretakerManager);
        vacancies = [...vacancies, vacancy].slice(-200);
        dismissed.push({ clubId:team.id, managerId:manager.id, caretakerId:caretaker.id });
      } else if (review.reputationDelta) {
        workingById.set(manager.id, applyReputationDelta(manager, review.reputationDelta));
        if (review.outcome === 'warning') warnings.push({ clubId:team.id, managerId:manager.id });
      }
    }
    reviewedCheckpoints = [...reviewedCheckpoints, weekKey].slice(-MAX_MANAGER_TICK_KEYS);
  }

  const changedManagers = [...workingById.values()].filter(manager => originalById.get(manager.id) !== manager);
  if (changedManagers.length) await putManagersBulk(changedManagers);

  const nextSave = {
    ...save,
    managerMarket:{
      ...market,
      vacancies,
      reviewedCheckpoints,
      processedWeekKeys:[...(market.processedWeekKeys ?? []), weekKey].slice(-MAX_MANAGER_TICK_KEYS),
    },
  };
  await putSave(nextSave);
  return { save:nextSave, dismissed, warnings, alreadyProcessed:false };
}
