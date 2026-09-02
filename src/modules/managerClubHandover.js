import { buildPendingEvents } from './gameweek.js';
import { generateBoardObjective } from './season.js';
import { applyHireOutcome } from './managerAppointments.js';
import { swapClubCompetitionControl } from './managerCompetitionHandoff.js';
import { createScoutingState } from './scouting.js';
import { MAX_RECENT_MANAGER_APPOINTMENTS, createEmptyManagerMarket } from './managers.js';
import { SAFE_BOUNDARY_ERROR_MESSAGE } from './managerUserJourney.js';

/**
 * modules/managerClubHandover.js — P6 WP6: the atomic club-control handover.
 *
 * This is the one place `save.userTeamId` may change. It only runs once a
 * job offer is already accepted (a completed vacancy with
 * `hiredManagerId === userManager.id` — see managerUserJourney.js's
 * acceptUserOffer, which stops short of calling this) and the event queue is
 * empty, matching every other P6 control change's safe boundary.
 *
 * What this does NOT solve (explicit deferrals, not oversights):
 *  - How the world advances while the user's manager is unemployed between
 *    resigning and accepting a new job — that "bounded wait/advance path"
 *    is WP7's UI/runtime concern. This command only guarantees that
 *    whatever save.cups state exists for the departing club *at the moment
 *    of handover* is captured correctly, per the phase guide's own framing
 *    ("snapshots the old controlled club's save.cups state").
 *  - Full match-by-match cup history across the save.cups/worldCompetitions
 *    shape boundary — see managerCompetitionHandoff.js's own header.
 *  - Academy/youth-cohort continuity across a club change — deferred to P9.
 */
export function assertHandoverSafeBoundary(save) {
  if ((save?.pendingEvents ?? []).length) throw new Error(SAFE_BOUNDARY_ERROR_MESSAGE);
}

/**
 * @param save            current save (must have an empty pendingEvents queue)
 * @param allTeams        every team row
 * @param newTeamId       the club the user is taking over
 * @param vacancy         the completed vacancy for newTeamId, with
 *                         hiredManagerId === userManager.id (from
 *                         managerUserJourney.js's acceptUserOffer, already
 *                         persisted by the caller)
 * @param userManager     the user's manager entity (still 'unemployed')
 * @param caretakerManager the vacancy's caretaker entity, required unless
 *                         vacancy.caretakerManagerId === userManager.id
 * @param gwFixtures      this gameweek's fixtures, for rebuilding pendingEvents
 * @param weekKey         current review-checkpoint-style week key
 *
 * Idempotent: calling this again once save.userTeamId already equals
 * newTeamId and the pending handover marker is already cleared is a no-op
 * that returns the save unchanged — a retried/interrupted call can never
 * leave control split between the old and new club.
 */
export function transferClubControl(save, {
  allTeams, newTeamId, vacancy, userManager, caretakerManager = null, gwFixtures = [], weekKey,
}) {
  const market = save.managerMarket ?? createEmptyManagerMarket();
  if (save.userTeamId === newTeamId && market.pendingUserHandover?.clubId !== newTeamId) {
    return { save, teamPatches:[], managerPatches:[], alreadyCompleted:true };
  }
  assertHandoverSafeBoundary(save);
  if (!vacancy || vacancy.status !== 'completed' || vacancy.hiredManagerId !== userManager?.id) {
    throw new Error('HANDOVER_REQUIRES_A_COMPLETED_OFFER_FOR_THIS_MANAGER');
  }
  const newTeam = allTeams.find(team => team.id === newTeamId);
  if (!newTeam) throw new Error('NEW_TEAM_NOT_FOUND');
  const oldTeamId = save.userTeamId;

  const { worldCompetitions, cupsForNewClub } = swapClubCompetitionControl(
    save.worldCompetitions, { oldClubId:oldTeamId, oldClubCups:save.cups ?? {}, newClubId:newTeamId },
  );

  const { hiredManagerPatch, displacedCaretakerPatch } = applyHireOutcome({
    vacancy, hiredManagerId:userManager.id, hiredManager:userManager, caretakerManager, currentDate:save.currentDate,
  });

  const nextPendingEvents = buildPendingEvents(save.currentGameweek, newTeamId, gwFixtures, cupsForNewClub, allTeams);
  const nextBoardObjective = generateBoardObjective(newTeam, newTeam.league ?? save.userLeague);
  const wasCaretaker = vacancy.caretakerManagerId === userManager.id;

  const nextSave = {
    ...save,
    userTeamId:newTeamId,
    userLeague:newTeam.league ?? save.userLeague,
    cups:cupsForNewClub,
    worldCompetitions,
    pendingEvents:nextPendingEvents,
    // Squad-specific state resets for the new squad; tactics/managerDNA/
    // formation/mentality are the manager's own identity and travel with them.
    lineup:null,
    playerRoles:{},
    scouting:createScoutingState(),
    inboundOffers:[],
    collapsedDeals:[],
    boardObjective:nextBoardObjective,
    jobSecurity:65,
    sacked:false,
    managerMarket:{
      ...market,
      pendingUserHandover:null,
      recentAppointments:[
        ...(market.recentAppointments ?? []),
        { clubId:newTeamId, managerId:userManager.id, wasCaretaker, weekKey, reason:'user_appointment' },
      ].slice(-MAX_RECENT_MANAGER_APPOINTMENTS),
    },
  };

  const teamPatches = newTeam.managerId === userManager.id ? [] : [{ ...newTeam, managerId:userManager.id }];
  const managerPatches = displacedCaretakerPatch ? [hiredManagerPatch, displacedCaretakerPatch] : [hiredManagerPatch];

  return { save:nextSave, teamPatches, managerPatches, alreadyCompleted:false };
}
