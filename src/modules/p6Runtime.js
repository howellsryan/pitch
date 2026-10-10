import { getAllManagers, getAllStandings, getAllTeams, getFixturesByGW, getSave, putManagersBulk, putSave, putTeamsBulk } from './db.js';
import {
  MAX_MANAGER_TICK_KEYS,
  accrueManagerRecordsForWeek,
  applyReputationDelta,
  dismissAndCaretake,
  evaluateClubReview,
  isReviewCheckpointDue,
  reviewCheckpointKey,
  shouldResign,
  shouldRetire,
} from './managerCareer.js';
import { applyHireOutcome, assembleCandidates, completeHandover, extendOffer, isVacancyOpen, resolveOffer } from './managerAppointments.js';
import { APPROACH_FIT_THRESHOLD, MAX_USER_APPROACHES, generateUserApproaches } from './managerUserJourney.js';
import { MAX_RECENT_MANAGER_APPOINTMENTS, createCaretakerManager, createEmptyManagerMarket } from './managers.js';

// Deliberately does NOT import managerClubHandover.js here: that module
// imports buildPendingEvents from gameweek.js, which imports
// advanceP6ManagerCareerWeek from this file — importing it here would be a
// real import cycle the legacy bundler's flat concatenation cannot express
// (not just a style issue; there is no linear module order that satisfies
// both directions). Executing an accepted user job offer therefore happens
// from the UI layer instead (managerUserActions.js's
// tryCompletePendingUserHandover, called right after accepting and
// opportunistically on screen load) rather than from this tick.

/** modules/p6Runtime.js — bounded persistence/runtime facade for P6 WP2-WP4. */

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
 * Decide why an AI manager vacates their role, if at all, for this
 * checkpoint. Retirement is checked independently of performance; a poor
 * review can end in resignation (self-initiated) or dismissal, decided by a
 * small seeded roll so results aren't uniform across every struggling club.
 */
function decideVacateReason(manager, review, save) {
  if (shouldRetire(manager, save)) return 'retired';
  if (review.outcome === 'dismiss') {
    return shouldResign(manager, save, { underperforming:true }) ? 'resigned' : 'dismissed';
  }
  return null;
}

/**
 * Resolve every currently open vacancy against the world's unemployed
 * manager pool, processed in a fixed clubId order so two vacancies in the
 * same tick can never be awarded the same candidate (a same-tick reservation
 * via `hiredThisTick`, not a persisted lock). AI appointments resolve
 * immediately once a candidate is assembled — there is no multi-week AI-to-AI
 * negotiation in this scope. A vacancy with no eligible candidate this tick
 * is left open (the caretaker continues) and retried next week.
 *
 * `workingTeamsById` is mutated in place: team.managerId is updated whenever
 * a different manager actually takes over (an external hire displaces the
 * caretaker). Confirming the caretaker permanently needs no team patch here
 * because the checkpoint loop already pointed team.managerId at them the
 * moment the caretaker took over.
 */
function resolveOpenVacancies(vacancies, workingById, workingTeamsById, weekKey, currentDate, userManagerId, userInterests = [], canOfferUser = true) {
  const hiredThisTick = new Set();
  const hired = [];
  const completedAppointments = [];
  const nextVacancies = [];
  const interestsById = new Map(userInterests.map(interest => [interest.id, interest]));

  for (let vacancy of [...vacancies].sort((a, b) => a.clubId.localeCompare(b.clubId))) {
    if (!isVacancyOpen(vacancy)) { nextVacancies.push(vacancy); continue; }
    const team = workingTeamsById.get(vacancy.clubId);
    if (!team) { nextVacancies.push(vacancy); continue; }
    const interest = userInterests.find(item => item.vacancyId === vacancy.id && item.status !== 'rejected');
    const userManager = canOfferUser ? workingById.get(userManagerId) : null;
    const userAvailable = userManager?.status === 'unemployed';

    // A genuine human offer stays reserved until the user responds. Missing
    // interest or lost availability releases stale reservations back to AI.
    if (vacancy.status === 'offer_extended' && vacancy.offer?.candidateManagerId === userManagerId) {
      if (userAvailable && interest) { nextVacancies.push(vacancy); continue; }
      vacancy = resolveOffer(vacancy, 'declined', { weekKey });
    }

    // Applications compete in the same ranked pool as AI hires. A selected
    // user receives an offer rather than an automatic appointment.
    const excludeIds = [vacancy.previousManagerId, ...(!interest || !userAvailable ? [userManagerId] : []), ...(vacancy.declinedCandidateIds ?? []), ...hiredThisTick];
    const candidates = assembleCandidates(vacancy, team, [...workingById.values()], { excludeIds })
      .filter(candidate => candidate.managerId !== userManagerId || candidate.fit.overall >= APPROACH_FIT_THRESHOLD);
    let selected = candidates[0];
    if (vacancy.status === 'offer_extended') {
      // Respect an imported/in-flight AI offer instead of accepting its offer
      // while accidentally hiring a different candidate.
      selected = candidates.find(candidate => candidate.managerId === vacancy.offer?.candidateManagerId);
      if (!selected) vacancy = resolveOffer(vacancy, 'declined', { weekKey });
    }
    if (interest && userAvailable && selected && selected.managerId === userManagerId) {
      nextVacancies.push(extendOffer(vacancy, userManagerId, { weekKey }));
      interestsById.set(interest.id, { ...interest, fit:selected.fit.overall, status:interest.source === 'application' ? 'offered' : 'pending', decisionWeekKey:weekKey });
      continue;
    }
    if (interest) {
      if (interest.source === 'application') {
        interestsById.set(interest.id, { ...interest, status:'rejected', decision:selected ? 'another_candidate' : 'not_available', decisionWeekKey:weekKey });
      } else interestsById.delete(interest.id);
    }
    if (!selected) { nextVacancies.push(vacancy); continue; }

    const hiredManagerId = selected.managerId;
    const wasCaretaker = hiredManagerId === vacancy.caretakerManagerId;
    const completedVacancy = completeHandover(
      resolveOffer(extendOffer(vacancy, hiredManagerId, { weekKey }), 'accepted', { weekKey }),
      { hiredManagerId, weekKey },
    );
    hiredThisTick.add(hiredManagerId);
    hired.push({ clubId:vacancy.clubId, managerId:hiredManagerId, wasCaretaker });
    completedAppointments.push({
      clubId:completedVacancy.clubId, managerId:completedVacancy.hiredManagerId,
      wasCaretaker, weekKey:completedVacancy.resolvedWeekKey, reason:vacancy.reason,
    });

    const { hiredManagerPatch, displacedCaretakerPatch } = applyHireOutcome({
      vacancy:completedVacancy, hiredManagerId,
      hiredManager:workingById.get(hiredManagerId),
      caretakerManager:workingById.get(vacancy.caretakerManagerId),
      currentDate,
    });
    workingById.set(hiredManagerId, hiredManagerPatch);
    if (!wasCaretaker) {
      // team.managerId only needs patching for an external hire — a
      // confirmed caretaker already has it pointed at them since the
      // checkpoint loop that created them.
      if (displacedCaretakerPatch) workingById.set(displacedCaretakerPatch.id, displacedCaretakerPatch);
      workingTeamsById.set(team.id, { ...team, managerId:hiredManagerId });
    }
    // A completed vacancy is a live-queue exit, not itself history to retain —
    // `completedAppointments` above is what feeds managerMarket.recentAppointments.
  }

  return { nextVacancies, hired, completedAppointments, userInterests:[...interestsById.values()] };
}

/**
 * P6's once-per-world-week step, called alongside P5/P4's ticks from the same
 * `runEndOfWorldGameweek` boundary in gameweek.js.
 *
 *  1. Accrue this week's match records for every employed manager.
 *  2. At most once per bounded review checkpoint (`MANAGER_REVIEW_INTERVAL_GWS`),
 *     evaluate every club and vacate AI roles that retire/resign/are dismissed —
 *     immediately handing the club to a caretaker (and pointing team.managerId
 *     at them) so it is never managerless. The user's own manager is scored
 *     the same way but never auto-vacated.
 *  3. Every week, resolve any currently open vacancy against the world's
 *     unemployed manager pool (see resolveOpenVacancies above).
 */
export async function advanceP6ManagerCareerWeek(saveInput = null) {
  let save = saveInput ?? await getSave();
  if (!save) return { save, dismissed:[], warnings:[], hired:[], alreadyProcessed:true };
  const market = save.managerMarket ?? createEmptyManagerMarket();
  const weekKey = reviewCheckpointKey(save);
  if ((market.processedWeekKeys ?? []).includes(weekKey)) {
    return { save, dismissed:[], warnings:[], hired:[], alreadyProcessed:true };
  }

  const [managers, teams, fixtures] = await Promise.all([
    getAllManagers(), getAllTeams(), getFixturesByGW(save.currentGameweek),
  ]);
  const originalTeamsById = new Map(teams.map(team => [team.id, team]));
  const workingTeamsById = new Map(originalTeamsById);
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
      const reason = manager.isUser ? null : decideVacateReason(manager, review, save);
      if (reason) {
        const caretaker = createCaretakerManager(team, { weekKey, currentDate:save.currentDate });
        const { dismissedManager, caretakerManager, vacancy } = dismissAndCaretake(manager, caretaker, { weekKey, reason });
        workingById.set(dismissedManager.id, dismissedManager);
        workingById.set(caretakerManager.id, caretakerManager);
        workingTeamsById.set(team.id, { ...(workingTeamsById.get(team.id) ?? team), managerId:caretakerManager.id });
        vacancies = [...vacancies, vacancy].slice(-200);
        dismissed.push({ clubId:team.id, managerId:manager.id, caretakerId:caretaker.id, reason });
      } else if (review.reputationDelta) {
        workingById.set(manager.id, applyReputationDelta(manager, review.reputationDelta));
        if (review.outcome === 'warning') warnings.push({ clubId:team.id, managerId:manager.id });
      }
    }
    reviewedCheckpoints = [...reviewedCheckpoints, weekKey].slice(-MAX_MANAGER_TICK_KEYS);
  }

  // Generate at most one unsolicited approach, and only when the club would
  // rank the user ahead of its actual available candidates. Applications are
  // independently assessed during the deterministic vacancy pass below.
  const userManager = (save.userManagerId && !market.pendingUserHandover) ? workingById.get(save.userManagerId) : null;
  const existingInterests = (market.userApproaches ?? []).slice(-MAX_USER_APPROACHES);
  const generatedApproaches = userManager
    ? generateUserApproaches(userManager, vacancies, workingTeamsById, existingInterests, { weekKey, managerPool:[...workingById.values()] })
    : existingInterests;

  const resolution = resolveOpenVacancies(vacancies, workingById, workingTeamsById, weekKey, save.currentDate, save.userManagerId, generatedApproaches, !market.pendingUserHandover);
  vacancies = resolution.nextVacancies;
  const recentAppointments = resolution.completedAppointments.length
    ? [...(market.recentAppointments ?? []), ...resolution.completedAppointments].slice(-MAX_RECENT_MANAGER_APPOINTMENTS)
    : (market.recentAppointments ?? []);

  const openVacancyIds = new Set(vacancies.filter(isVacancyOpen).map(vacancy => vacancy.id));
  const userApproaches = resolution.userInterests
    .filter(interest => interest.status === 'rejected' || openVacancyIds.has(interest.vacancyId))
    .slice(-MAX_USER_APPROACHES);

  const changedTeams = [...workingTeamsById.values()].filter(team => originalTeamsById.get(team.id) !== team);
  if (changedTeams.length) await putTeamsBulk(changedTeams);

  const changedManagers = [...workingById.values()].filter(manager => originalById.get(manager.id) !== manager);
  if (changedManagers.length) await putManagersBulk(changedManagers);

  const nextSave = {
    ...save,
    managerMarket:{
      ...market,
      vacancies,
      reviewedCheckpoints,
      recentAppointments,
      userApproaches,
      processedWeekKeys:[...(market.processedWeekKeys ?? []), weekKey].slice(-MAX_MANAGER_TICK_KEYS),
    },
  };
  await putSave(nextSave);
  return { save:nextSave, dismissed, warnings, hired:resolution.hired, alreadyProcessed:false };
}
