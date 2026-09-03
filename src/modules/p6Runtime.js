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
import { applyHireOutcome, assembleCandidates, completeHandover, extendOffer, isVacancyAvailableForNewCandidate, isVacancyOpen, resolveOffer } from './managerAppointments.js';
import { generateUserApproaches } from './managerUserJourney.js';
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
function resolveOpenVacancies(vacancies, workingById, workingTeamsById, weekKey, currentDate, userManagerId, protectedClubIds = new Set()) {
  const hiredThisTick = new Set();
  const hired = [];
  const completedAppointments = [];
  const nextVacancies = [];

  for (const vacancy of [...vacancies].sort((a, b) => a.clubId.localeCompare(b.clubId))) {
    if (!isVacancyOpen(vacancy)) { nextVacancies.push(vacancy); continue; }
    // A club that just approached the user this same tick gives them first
    // refusal for one tick rather than being instantly filled by an AI
    // candidate the same week — otherwise AI resolution (below) is
    // immediate enough that the user would almost never see a live vacancy.
    if (protectedClubIds.has(vacancy.clubId)) { nextVacancies.push(vacancy); continue; }
    const team = workingTeamsById.get(vacancy.clubId);
    if (!team) { nextVacancies.push(vacancy); continue; }

    // The user's own manager, while unemployed, is never auto-hired by this
    // AI pipeline — joining a club is only ever the user's own deliberate
    // accept action (managerUserActions.js's respondToApproach), even if
    // they'd otherwise be the best-fitting candidate for this vacancy.
    const excludeIds = [vacancy.previousManagerId, userManagerId, ...(vacancy.declinedCandidateIds ?? []), ...hiredThisTick];
    const candidates = assembleCandidates(vacancy, team, [...workingById.values()], { excludeIds });
    if (!candidates.length) { nextVacancies.push(vacancy); continue; }

    const hiredManagerId = candidates[0].managerId;
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

  return { nextVacancies, hired, completedAppointments };
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

  // Bounded weekly approach generation while the user is unemployed AND has
  // no already-accepted offer awaiting handover — at most one new approach
  // per call (see generateUserApproaches) — runs BEFORE AI resolution below,
  // using this week's vacancies as they stood at the start of the tick: AI
  // resolution is otherwise immediate, so a user would almost never see a
  // genuinely open vacancy if this ran after it.
  const userManager = (save.userManagerId && !market.pendingUserHandover) ? workingById.get(save.userManagerId) : null;
  const previousApproachClubIds = new Set((market.userApproaches ?? []).map(approach => approach.clubId));
  const generatedApproaches = userManager
    ? generateUserApproaches(userManager, vacancies, workingTeamsById, market.userApproaches ?? [], { weekKey })
    : (market.userApproaches ?? []);
  // Any club that newly approached the user this tick gives them first
  // refusal for one tick rather than being auto-filled by AI resolution below.
  const protectedClubIds = new Set(
    generatedApproaches.filter(approach => !previousApproachClubIds.has(approach.clubId)).map(approach => approach.clubId),
  );

  const resolution = resolveOpenVacancies(vacancies, workingById, workingTeamsById, weekKey, save.currentDate, save.userManagerId, protectedClubIds);
  vacancies = resolution.nextVacancies;
  const recentAppointments = resolution.completedAppointments.length
    ? [...(market.recentAppointments ?? []), ...resolution.completedAppointments].slice(-MAX_RECENT_MANAGER_APPOINTMENTS)
    : (market.recentAppointments ?? []);

  // Prune any approach whose vacancy AI resolution just filled (or that no
  // longer exists) — otherwise generateUserApproaches' alreadyApproachedClubIds
  // would block that club from ever approaching this manager again.
  const openVacancyIds = new Set(vacancies.filter(isVacancyAvailableForNewCandidate).map(vacancy => vacancy.id));
  const userApproaches = generatedApproaches.filter(approach => openVacancyIds.has(approach.vacancyId));

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
