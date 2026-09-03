import {
  getAllTeams, getFixturesByGW, getManager, getSave, getTeam,
  putManagersBulk, putSave, putTeamsBulk,
} from './db.js';
import { reviewCheckpointKey } from './managerCareer.js';
import { isVacancyAvailableForNewCandidate } from './managerAppointments.js';
import {
  acceptUserOffer, applyToVacancy, beginUserResignation, declineUserOffer,
} from './managerUserJourney.js';
import { transferClubControl } from './managerClubHandover.js';
import { createEmptyManagerMarket } from './managers.js';

/**
 * modules/managerUserActions.js — P6 WP7: the thin IO-touching command layer
 * a UI action calls. Pure decision logic lives in managerUserJourney.js /
 * managerClubHandover.js; this module is only "read save/managers/teams,
 * call the pure function, persist the result."
 */

function weekKeyFor(save) {
  return reviewCheckpointKey(save);
}

/**
 * Everything a manager-career UI needs in one read. `approaches` and
 * `applications` are kept separate — the same underlying market.userApproaches
 * list, but distinguished by `source` — because they mean different things to
 * a user: an approach is a club expressing interest (has a fit score), an
 * application is the user's own proactive request (no fit score, and its
 * vacancy must not still be offered as "open" to apply to again).
 */
export async function getManagerCareerView() {
  const save = await getSave();
  if (!save) return null;
  const market = save.managerMarket ?? createEmptyManagerMarket();
  const [userManager, allTeams] = await Promise.all([getManager(save.userManagerId), getAllTeams()]);
  const teamsById = new Map(allTeams.map(team => [team.id, team]));
  const isUnemployed = userManager?.status !== 'employed';
  const pursuedClubIds = new Set((market.userApproaches ?? []).map(approach => approach.clubId));
  const openVacancies = market.vacancies
    .filter(vacancy => isVacancyAvailableForNewCandidate(vacancy) && !pursuedClubIds.has(vacancy.clubId))
    .map(vacancy => ({ vacancy, team:teamsById.get(vacancy.clubId) }))
    .filter(entry => entry.team);
  const resolvedApproaches = (market.userApproaches ?? [])
    .map(approach => ({ approach, vacancy:market.vacancies.find(v => v.id === approach.vacancyId), team:teamsById.get(approach.clubId) }))
    .filter(entry => entry.vacancy && entry.team);
  return {
    save, userManager, market,
    currentTeam:isUnemployed ? null : teamsById.get(save.userTeamId),
    isUnemployed,
    canResign:!isUnemployed && (save.pendingEvents ?? []).length === 0,
    approaches:resolvedApproaches.filter(entry => entry.approach.source === 'approach'),
    applications:resolvedApproaches.filter(entry => entry.approach.source === 'application'),
    openVacancies,
  };
}

/**
 * Voluntary resignation. Requires the empty-pendingEvents safe boundary
 * (managerUserJourney.js's beginUserResignation enforces it) — the caller
 * should check `canResign` from getManagerCareerView first for a clean UI
 * message rather than relying solely on the thrown error.
 */
export async function resignAsManager() {
  const save = await getSave();
  const [userManager, team] = await Promise.all([getManager(save.userManagerId), getTeam(save.userTeamId)]);
  const weekKey = weekKeyFor(save);
  const { resignedManager, caretakerManager, vacancy } = beginUserResignation(save, userManager, team, { weekKey });
  await putManagersBulk([resignedManager, caretakerManager]);
  await putTeamsBulk([{ ...team, managerId:caretakerManager.id }]);
  const market = save.managerMarket ?? createEmptyManagerMarket();
  await putSave({
    ...save,
    managerMarket:{ ...market, vacancies:[...market.vacancies, vacancy].slice(-200) },
  });
  return { resignedManager, caretakerManager, vacancy };
}

/** Proactively apply to an open vacancy while unemployed. */
export async function applyForVacancy(vacancyId) {
  const save = await getSave();
  const userManager = await getManager(save.userManagerId);
  const market = save.managerMarket ?? createEmptyManagerMarket();
  if (market.pendingUserHandover) throw new Error('ALREADY_HAVE_A_PENDING_JOB_OFFER');
  const vacancy = market.vacancies.find(item => item.id === vacancyId);
  if (!vacancy) throw new Error('VACANCY_NOT_FOUND');
  if ((market.userApproaches ?? []).some(item => item.clubId === vacancy.clubId)) {
    throw new Error('ALREADY_PURSUING_THIS_CLUB');
  }
  const weekKey = weekKeyFor(save);
  const application = applyToVacancy(userManager, vacancy, { weekKey });
  await putSave({ ...save, managerMarket:{ ...market, userApproaches:[...(market.userApproaches ?? []), application] } });
  return application;
}

/**
 * Accept or decline a pending approach/application. Accepting resolves the
 * vacancy's offer and records `pendingUserHandover` — it does not move the
 * user immediately; call `tryCompletePendingUserHandover` right after (the
 * UI does this automatically) to execute the actual club-control handover
 * as soon as the event queue is safely empty, exactly like every other P6
 * control change. p6Runtime.js's weekly tick deliberately does NOT execute
 * it itself — see that file's own note on why importing managerClubHandover.js
 * there would be a real module cycle.
 */
export async function respondToApproach(approachId, outcome) {
  const save = await getSave();
  const userManager = await getManager(save.userManagerId);
  const market = save.managerMarket ?? createEmptyManagerMarket();
  if (outcome === 'accept' && market.pendingUserHandover) throw new Error('ALREADY_HAVE_A_PENDING_JOB_OFFER');
  const approach = (market.userApproaches ?? []).find(item => item.id === approachId);
  if (!approach) throw new Error('APPROACH_NOT_FOUND');
  const vacancy = market.vacancies.find(item => item.id === approach.vacancyId);
  if (!vacancy) throw new Error('VACANCY_NOT_FOUND');
  // The vacancy may have been filled by an AI candidate since this approach
  // was generated (protected for one tick, not forever) — surface that
  // clearly rather than silently no-opping through extendOffer/resolveOffer.
  if (vacancy.status === 'completed') throw new Error('VACANCY_NO_LONGER_AVAILABLE');
  const weekKey = weekKeyFor(save);
  const nextApproaches = (market.userApproaches ?? []).filter(item => item.id !== approachId);

  if (outcome === 'accept') {
    const { vacancy:resolved, pendingUserHandover } = acceptUserOffer(vacancy, userManager.id, { weekKey });
    const nextVacancies = market.vacancies.map(item => item.id === vacancy.id ? resolved : item);
    await putSave({ ...save, managerMarket:{ ...market, vacancies:nextVacancies, userApproaches:nextApproaches, pendingUserHandover } });
    return { accepted:true, pendingUserHandover };
  }
  const declined = declineUserOffer(vacancy, userManager.id, { weekKey });
  const nextVacancies = market.vacancies.map(item => item.id === vacancy.id ? declined : item);
  await putSave({ ...save, managerMarket:{ ...market, vacancies:nextVacancies, userApproaches:nextApproaches } });
  return { accepted:false };
}

/**
 * Execute an already-accepted handover immediately, if the event queue is
 * safely empty right now. Used right after `respondToApproach('accept')` so
 * the user doesn't have to wait for the next world-week tick when nothing is
 * actually pending. p6Runtime.js's weekly tick calls the same
 * transferClubControl as a fallback for whenever this couldn't run inline.
 */
export async function tryCompletePendingUserHandover() {
  const save = await getSave();
  const market = save.managerMarket ?? createEmptyManagerMarket();
  const pending = market.pendingUserHandover;
  if (!pending || (save.pendingEvents ?? []).length) return { completed:false };

  const vacancy = market.vacancies.find(item => item.id === pending.vacancyId);
  if (!vacancy) return { completed:false };
  const [userManager, allTeams, gwFixtures] = await Promise.all([
    getManager(save.userManagerId), getAllTeams(), getFixturesByGW(save.currentGameweek),
  ]);
  const caretakerManager = vacancy.caretakerManagerId === userManager.id ? null : await getManager(vacancy.caretakerManagerId);
  const weekKey = weekKeyFor(save);
  const result = transferClubControl(save, {
    allTeams, newTeamId:pending.clubId, vacancy, userManager, caretakerManager, gwFixtures, weekKey,
  });
  if (result.alreadyCompleted) return { completed:false };
  if (result.teamPatches.length) await putTeamsBulk(result.teamPatches);
  if (result.managerPatches.length) await putManagersBulk(result.managerPatches);
  await putSave(result.save);
  return { completed:true, save:result.save };
}
