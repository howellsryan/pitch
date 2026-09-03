/**
 * modules/managerUserJourney.js — P6 WP5: the user's own resignation,
 * approach and application flow, reusing the same appointment state machine
 * (managerAppointments.js) and vacate transition (managerCareer.js's
 * dismissAndCaretake) that AI managers already go through.
 *
 * Not reachable from any UI action yet. `acceptApproach`/`acceptApplication`
 * deliberately stop at `save.managerMarket.pendingUserHandover` rather than
 * touching `save.userTeamId` — WP6 owns the atomic competition-transfer and
 * club-control handover that actually executes a pending user move safely.
 * `p6Runtime.js` calling this module for real, and a Resign/Apply UI action,
 * land in WP7 once WP6's handover exists to complete the loop.
 */

import { assembleCandidates, completeHandover, extendOffer, isVacancyAvailableForNewCandidate, resolveOffer, scoreCandidateFit } from './managerAppointments.js';
import { dismissAndCaretake } from './managerCareer.js';
import { createCaretakerManager } from './managers.js';

export const MAX_USER_APPROACHES = 8;
export const APPROACH_FIT_THRESHOLD = 55;

// A plain Error factory rather than `export class` — the legacy bundler's
// module stripper (src/build.py's strip_modules) only rewrites
// `export function`/`export const`, not `export class`.
export const SAFE_BOUNDARY_ERROR_MESSAGE = 'USER_MANAGER_ACTION_REQUIRES_EMPTY_EVENT_QUEUE';

export function isSafeBoundaryError(error) {
  return error instanceof Error && error.message === SAFE_BOUNDARY_ERROR_MESSAGE;
}

function assertSafeBoundary(save) {
  if ((save?.pendingEvents ?? []).length) throw new Error(SAFE_BOUNDARY_ERROR_MESSAGE);
}

/**
 * Voluntary resignation. Requires the same safe (empty pendingEvents) event-
 * queue boundary every other P6 control change requires. Vacates the user's
 * manager exactly like an AI departure (immediate caretaker, so the old club
 * is never managerless) and marks the user manager unemployed — it does not
 * touch `save.userTeamId`; the caller still "controls" the old club's fixtures
 * until WP6's handover assigns them a new one.
 */
export function beginUserResignation(save, userManager, team, { weekKey } = {}) {
  assertSafeBoundary(save);
  if (!userManager?.isUser || userManager.status !== 'employed') {
    throw new Error('USER_MANAGER_NOT_EMPLOYED');
  }
  if (!team || team.id !== userManager.currentClubId) {
    throw new Error('TEAM_DOES_NOT_MATCH_USER_MANAGER_CLUB');
  }
  const caretaker = createCaretakerManager(team, { weekKey, currentDate:save.currentDate });
  const { dismissedManager, caretakerManager, vacancy } = dismissAndCaretake(
    userManager, caretaker, { weekKey, reason:'resigned' },
  );
  return { resignedManager:dismissedManager, caretakerManager, vacancy };
}

/**
 * Bounded weekly approach generation while the user is unemployed: at most
 * one new approach per call, only from a club with a genuinely open vacancy
 * whose fit with the user's manager clears `APPROACH_FIT_THRESHOLD`, and only
 * a club that hasn't already approached the user for this same vacancy.
 */
export function generateUserApproaches(userManager, vacancies, teamsById, existingApproaches, { weekKey } = {}) {
  if (!userManager || userManager.status === 'employed') return existingApproaches;
  const alreadyApproachedClubIds = new Set(existingApproaches.map(approach => approach.clubId));
  const openVacancies = vacancies.filter(vacancy => isVacancyAvailableForNewCandidate(vacancy) && !alreadyApproachedClubIds.has(vacancy.clubId));
  const scored = openVacancies
    .map(vacancy => {
      const team = teamsById.get(vacancy.clubId);
      if (!team) return null;
      const fit = scoreCandidateFit(userManager, team);
      return { vacancy, team, fit };
    })
    .filter(entry => entry && entry.fit.overall >= APPROACH_FIT_THRESHOLD)
    .sort((a, b) => b.fit.overall - a.fit.overall);
  if (!scored.length) return existingApproaches;

  const best = scored[0];
  const approach = {
    id:`approach_${best.vacancy.clubId}_${weekKey}`,
    clubId:best.vacancy.clubId,
    vacancyId:best.vacancy.id,
    fit:best.fit.overall,
    offeredWeekKey:weekKey,
    status:'pending',
    source:'approach',
  };
  return [...existingApproaches, approach].slice(-MAX_USER_APPROACHES);
}

/**
 * The user proactively applies to a specific open vacancy rather than
 * waiting for an approach. Unlike `generateUserApproaches`, this bypasses the
 * fit threshold — applying is always allowed, being shortlisted is not
 * guaranteed (the club may still prefer another candidate later).
 * `source:'application'` distinguishes this from a club-initiated approach —
 * it has no computed fit score, and a UI must not present it as the club
 * having expressed interest.
 */
export function applyToVacancy(userManager, vacancy, { weekKey } = {}) {
  if (!userManager || userManager.status === 'employed') throw new Error('USER_MANAGER_NOT_AVAILABLE');
  if (!isVacancyAvailableForNewCandidate(vacancy)) throw new Error('VACANCY_NOT_OPEN');
  return {
    id:`application_${vacancy.clubId}_${weekKey}`,
    clubId:vacancy.clubId,
    vacancyId:vacancy.id,
    offeredWeekKey:weekKey,
    status:'pending',
    source:'application',
  };
}

/**
 * Accept a pending approach/application. Extends and resolves the offer
 * through the shared appointment state machine, then records the outcome as
 * `pendingUserHandover` rather than moving the user immediately — the actual
 * world-mutating handover is WP6's atomic command.
 */
/** Neither accept nor decline may act on an offer that isn't actually the user's. */
function assertOfferBelongsToCandidate(vacancy, candidateManagerId) {
  if (vacancy.status === 'offer_extended' && vacancy.offer?.candidateManagerId !== candidateManagerId) {
    throw new Error('OFFER_NOT_FOR_THIS_CANDIDATE');
  }
}

export function acceptUserOffer(vacancy, userManagerId, { weekKey } = {}) {
  assertOfferBelongsToCandidate(vacancy, userManagerId);
  const offered = extendOffer(vacancy, userManagerId, { weekKey });
  const resolved = resolveOffer(offered, 'accepted', { weekKey });
  // resolveOffer only flips status to 'completed'; managerClubHandover.js's
  // transferClubControl requires hiredManagerId to actually be set, which is
  // completeHandover's job (same as the AI path in p6Runtime.js).
  const accepted = completeHandover(resolved, { hiredManagerId:userManagerId, weekKey });
  return {
    vacancy:accepted,
    pendingUserHandover:{ clubId:accepted.clubId, vacancyId:accepted.id, weekKey },
  };
}

export function declineUserOffer(vacancy, userManagerId, { weekKey } = {}) {
  assertOfferBelongsToCandidate(vacancy, userManagerId);
  const offered = extendOffer(vacancy, userManagerId, { weekKey });
  return resolveOffer(offered, 'declined', { weekKey });
}

/**
 * A rough sense of how many other clubs would realistically want the user's
 * manager right now — used to keep the "stay unemployed and wait" path from
 * feeling arbitrary. Reuses `assembleCandidates`' own eligibility rule so the
 * count matches what would actually be offered.
 */
export function countPlausibleOpenings(userManager, vacancies, teamsById) {
  if (!userManager || userManager.status === 'employed') return 0;
  let count = 0;
  for (const vacancy of vacancies) {
    if (!isVacancyAvailableForNewCandidate(vacancy)) continue;
    const team = teamsById.get(vacancy.clubId);
    if (!team) continue;
    const candidates = assembleCandidates(vacancy, team, [userManager]);
    if (candidates.length && candidates[0].fit.overall >= APPROACH_FIT_THRESHOLD) count += 1;
  }
  return count;
}
