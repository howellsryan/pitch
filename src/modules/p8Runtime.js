import { getAllPlayers, getAllStandings, getAllTeams, getFixturesByGW, getManager, getPlayer, getSave, getTeam, putPlayer, putSave, putTeam } from './db.js';
import { applyLedgerMovement } from './clubFinance.js';
import { loanOutPlayer } from './transfers.js';
import { acceptUserOffer, declineUserOffer } from './managerUserJourney.js';
import {
  advanceCareerEventFollowUps,
  buildRivalries,
  buildCareerEventsBackfill,
  careerEventChoices,
  createCareerEventFollowUp,
  createCareerEventsState,
  createEventInstance,
  deriveFanContext,
  eventWeekKey,
  expireCareerEvents,
  isCareerEventExpired,
  invalidateCareerEvents,
  normalizeCareerEvents,
  selectCareerEvents,
} from './careerEvents.js';

/** IO boundary for P8. The Inbox calls these typed commands; it never writes domain objects. */
export async function ensureP8CareerEvents(saveInput = null) {
  const save = saveInput ?? await getSave();
  if (!save) return save;
  const next = buildCareerEventsBackfill(save);
  if (next !== save) await putSave(next);
  return next;
}

function standingForUser(rows, userTeamId) { return rows.find(row => row.teamId === userTeamId) ?? null; }

export async function advanceP8StoryWeek(saveInput = null) {
  let save = await ensureP8CareerEvents(saveInput);
  if (!save) return { save, added:[], expired:[], followUps:[], alreadyProcessed:true };
  let state = normalizeCareerEvents(save.careerEvents ?? createCareerEventsState());
  const key = eventWeekKey(save);
  if (state.processedWeekKeys.includes(key)) return { save, added:[], expired:[], followUps:[], alreadyProcessed:true };
  const [team, teams, players, standings, nextFixtures, userManager] = await Promise.all([
    getTeam(save.userTeamId), getAllTeams(), getAllPlayers(), getAllStandings(), getFixturesByGW(Number(save.currentGameweek ?? 0) + 1), getManager(save.userManagerId),
  ]);
  const standing = standingForUser(standings, save.userTeamId);
  const rivalries = buildRivalries(team, teams, state.rivalries);
  const fanContext = deriveFanContext({ form:standing?.form ?? [], jobSecurity:save.jobSecurity, teamMorale:team?.morale, prior:state.fanContext });
  const expiry = expireCareerEvents({ ...state, rivalries, fanContext }, save);
  state = expiry.state;
  const nextFixture = nextFixtures.find(fixture => fixture.homeTeamId === save.userTeamId || fixture.awayTeamId === save.userTeamId);
  const nextOpponentId = nextFixture && (nextFixture.homeTeamId === save.userTeamId ? nextFixture.awayTeamId : nextFixture.homeTeamId);
  const nextOpponent = teams.find(candidate => candidate.id === nextOpponentId);
  const nextOpponentIsRival = Object.values(rivalries).some(rivalry => rivalry.clubIds?.includes(save.userTeamId) && rivalry.clubIds?.includes(nextOpponentId) && Number(rivalry.intensity ?? 0) >= 45);
  const snapshot = { save, team, teams, players, standing, fanContext, userManager, nextOpponentIsRival, nextOpponentId, nextOpponentName:nextOpponent?.name };
  const invalidation = invalidateCareerEvents(state, snapshot);
  state = invalidation.state;
  const followUps = advanceCareerEventFollowUps(state, snapshot);
  state = followUps.state;
  const candidates = selectCareerEvents(snapshot, state);
  const selected = candidates.map(candidate => createEventInstance(candidate, save));
  const added = [...followUps.promoted, ...selected];
  const next = {
    ...save,
    careerEvents:{
      ...state,
      active:[...state.active, ...selected],
      rivalries,
      fanContext,
      processedWeekKeys:[...state.processedWeekKeys, key].slice(-80),
    },
  };
  await putSave(next);
  return { save:next, added, expired:expiry.expired, invalidated:invalidation.invalid, followUps:followUps.promoted, autoResolved:followUps.autoResolved, alreadyProcessed:false };
}

function assertPendingEvent(event, save) {
  if (!event || event.status !== 'pending') throw new Error('CAREER_EVENT_NOT_PENDING');
  if (isCareerEventExpired(event, save)) throw new Error('CAREER_EVENT_EXPIRED');
}

function hasApplied(entity, key) { return (entity?.p8AppliedEffectKeys ?? []).includes(key); }
function markApplied(entity, key) { return { ...entity, p8AppliedEffectKeys:[...(entity.p8AppliedEffectKeys ?? []), key].slice(-40) }; }

async function applyManagerApproach(event, choice, save, effectApplicationKey) {
  if (hasApplied(save, effectApplicationKey)) return `manager_approach_${choice.outcome}`;
  const market = save.managerMarket ?? {};
  const approachId = event.participantIds?.approachId;
  const approach = (market.userApproaches ?? []).find(item => item.id === approachId);
  if (!approach) throw new Error('APPROACH_NOT_FOUND');
  const vacancy = (market.vacancies ?? []).find(item => item.id === approach.vacancyId);
  if (!vacancy) throw new Error('VACANCY_NOT_FOUND');
  const userManager = await getManager(save.userManagerId);
  if (!userManager) throw new Error('USER_MANAGER_NOT_FOUND');
  const nextApproaches = (market.userApproaches ?? []).filter(item => item.id !== approachId);
  const weekKey = eventWeekKey(save);

  if (choice.outcome === 'accept') {
    if (market.pendingUserHandover && market.pendingUserHandover.clubId !== approach.clubId) throw new Error('ALREADY_HAVE_A_PENDING_JOB_OFFER');
    const result = acceptUserOffer(vacancy, userManager.id, { weekKey });
    const nextVacancies = (market.vacancies ?? []).map(item => item.id === vacancy.id ? result.vacancy : item);
    await putSave(markApplied({
      ...save,
      managerMarket:{ ...market, vacancies:nextVacancies, userApproaches:nextApproaches, pendingUserHandover:result.pendingUserHandover },
    }, effectApplicationKey));
    return 'manager_approach_accept';
  }

  const declined = declineUserOffer(vacancy, userManager.id, { weekKey });
  const nextVacancies = (market.vacancies ?? []).map(item => item.id === vacancy.id ? declined : item);
  await putSave(markApplied({ ...save, managerMarket:{ ...market, vacancies:nextVacancies, userApproaches:nextApproaches } }, effectApplicationKey));
  return 'manager_approach_decline';
}

const RECOVERABLE_EVENT_COMMAND_ERRORS = new Set([
  'EVENT_PARTICIPANT_UNAVAILABLE', 'TEAM_NOT_FOUND', 'WINDOW_CLOSED', 'NO_LOAN_TAKERS',
  'SIGNED_THIS_SEASON', 'ALREADY_ON_LOAN', 'APPROACH_NOT_FOUND', 'VACANCY_NOT_FOUND',
  'VACANCY_NOT_OPEN', 'VACANCY_NO_LONGER_AVAILABLE', 'USER_MANAGER_NOT_FOUND',
  'OFFER_NOT_FOR_THIS_CANDIDATE', 'ALREADY_HAVE_A_PENDING_JOB_OFFER',
]);

async function releaseRecoverableEventClaim(eventId, effectApplicationKey) {
  const latest = await getSave();
  if (!latest) return;
  const latestState = normalizeCareerEvents(latest.careerEvents);
  const claimed = latestState.active.find(item => item.id === eventId);
  if (claimed?.status !== 'applying' || claimed.effectApplicationKey !== effectApplicationKey) return;
  const pending = { ...claimed, status:'pending', selectedChoice:null, effectApplicationKey:null };
  await putSave({ ...latest, careerEvents:{ ...latestState, active:latestState.active.map(item => item.id === eventId ? pending : item) } });
}

async function applyCommand(event, choice, save, effectApplicationKey) {
  const playerId = event.participantIds?.playerId;
  if (choice.command === 'morale') {
    const player = playerId ? await getPlayer(playerId) : null;
    if (!player || player.teamId !== save.userTeamId) throw new Error('EVENT_PARTICIPANT_UNAVAILABLE');
    if (!hasApplied(player, effectApplicationKey)) await putPlayer(markApplied({ ...player, individualMorale:Math.max(0, Math.min(100, Number(player.individualMorale ?? 50) + Number(choice.amount ?? 0))) }, effectApplicationKey));
  } else if (choice.command === 'transfer_list') {
    const player = playerId ? await getPlayer(playerId) : null;
    if (!player || player.teamId !== save.userTeamId) throw new Error('EVENT_PARTICIPANT_UNAVAILABLE');
    if (!hasApplied(player, effectApplicationKey)) await putPlayer(markApplied({ ...player, transferListed:true, individualMorale:Math.max(0, Math.min(100, Number(player.individualMorale ?? 50) + Number(choice.amount ?? 0))) }, effectApplicationKey));
  } else if (choice.command === 'early_return') {
    const player = playerId ? await getPlayer(playerId) : null;
    if (!player?.rehabilitation || player.teamId !== save.userTeamId) throw new Error('EVENT_PARTICIPANT_UNAVAILABLE');
    if (!hasApplied(player, effectApplicationKey)) await putPlayer(markApplied({ ...player, rehabilitation:{ ...player.rehabilitation, earlyReturn:true } }, effectApplicationKey));
  } else if (choice.command === 'loan_out') {
    const player = playerId ? await getPlayer(playerId) : null;
    if (hasApplied(player, effectApplicationKey)) return 'loan_out';
    if (!player || player.teamId !== save.userTeamId) {
      if (event.status === 'applying' && player?.onLoan && player.loanOriginalTeamId === save.userTeamId) return 'loan_out';
      throw new Error('EVENT_PARTICIPANT_UNAVAILABLE');
    }
    await loanOutPlayer(playerId);
    const moved = await getPlayer(playerId);
    if (moved && !hasApplied(moved, effectApplicationKey)) await putPlayer(markApplied(moved, effectApplicationKey));
    return 'loan_out';
  } else if (choice.command === 'team_morale') {
    const team = await getTeam(save.userTeamId);
    if (!team) throw new Error('TEAM_NOT_FOUND');
    if (!hasApplied(team, effectApplicationKey)) await putTeam(markApplied({ ...team, morale:Math.max(0, Math.min(100, Number(team.morale ?? 50) + Number(choice.amount ?? 0))) }, effectApplicationKey));
  } else if (choice.command === 'finance') {
    const team = await getTeam(save.userTeamId);
    if (!team) throw new Error('TEAM_NOT_FOUND');
    if (!hasApplied(team, effectApplicationKey)) await putTeam(markApplied(applyLedgerMovement(team, { category:'commercial_income', amount:Number(choice.amount ?? 0), description:'P8 cost-cutting plan', weekKey:eventWeekKey(save) }), effectApplicationKey));
  } else if (choice.command === 'job_security') {
    if (!hasApplied(save, effectApplicationKey)) await putSave(markApplied({ ...save, jobSecurity:Math.max(0, Math.min(100, Number(save.jobSecurity ?? 65) + Number(choice.amount ?? 0))) }, effectApplicationKey));
  } else if (choice.command === 'manager_approach') {
    return applyManagerApproach(event, choice, save, effectApplicationKey);
  }
  return choice.command;
}

export async function resolveCareerEvent(eventId, choiceId) {
  let save = await ensureP8CareerEvents();
  let state = normalizeCareerEvents(save.careerEvents);
  let event = state.active.find(item => item.id === eventId);
  if (!event) {
    const resolvedEvent = state.resolved.find(item => item.id === eventId);
    if (resolvedEvent?.selectedChoice === choiceId) return { alreadyApplied:true, event:resolvedEvent, save };
    throw new Error('CAREER_EVENT_NOT_PENDING');
  }
  if (event.status !== 'applying') assertPendingEvent(event, save);
  const choice = careerEventChoices(event).find(item => item.id === choiceId);
  if (!choice) throw new Error('CAREER_EVENT_CHOICE_INVALID');
  if (event.status === 'applying' && event.selectedChoice !== choice.id) throw new Error('CAREER_EVENT_IN_PROGRESS');
  const effectApplicationKey = `${event.id}:${choice.id}`;

  // Claim before writing any other store. A resumed call sees `applying` and
  // replays the same idempotency key; entity markers make that replay a no-op.
  if (event.status !== 'applying') {
    const claimed = { ...event, status:'applying', selectedChoice:choice.id, effectApplicationKey };
    await putSave({ ...save, careerEvents:{ ...state, active:state.active.map(item => item.id === eventId ? claimed : item) } });
    save = await getSave();
    state = normalizeCareerEvents(save.careerEvents);
    event = state.active.find(item => item.id === eventId) ?? claimed;
  }

  let command;
  try {
    command = await applyCommand(event, choice, save, effectApplicationKey);
  } catch (error) {
    if (RECOVERABLE_EVENT_COMMAND_ERRORS.has(error?.message)) {
      await releaseRecoverableEventClaim(eventId, effectApplicationKey);
    }
    throw error;
  }
  // Fetch after the domain command so we cannot overwrite its save change.
  save = await getSave();
  const fresh = normalizeCareerEvents(save.careerEvents);
  const current = fresh.active.find(item => item.id === eventId);
  if (!current) {
    const resolvedEvent = fresh.resolved.find(item => item.id === eventId);
    return { alreadyApplied:true, event:resolvedEvent ?? null, save };
  }
  const followUp = createCareerEventFollowUp(current, choice.id, save);
  const resolved = { ...current, status:'resolved', selectedChoice:choice.id, effectApplicationKey, resolutionCode:command, resolvedGameweek:save.currentGameweek };
  const nextFollowUps = followUp && !(fresh.pendingFollowUps ?? []).some(item => item.id === followUp.id)
    ? [...(fresh.pendingFollowUps ?? []), followUp].slice(-12)
    : (fresh.pendingFollowUps ?? []);
  const nextState = {
    ...fresh,
    active:fresh.active.filter(item => item.id !== eventId),
    resolved:[...fresh.resolved, resolved].slice(-32),
    pendingFollowUps:nextFollowUps,
    cooldowns:{ ...fresh.cooldowns, [`${current.templateId}:${current.participantIds?.playerId ?? current.participantIds?.approachId ?? current.participantIds?.opponentId ?? current.participantIds?.clubId ?? 'club'}`]:save.currentGameweek },
  };
  const next = { ...save, careerEvents:nextState };
  await putSave(next);
  return { alreadyApplied:false, event:resolved, followUp, save:next };
}
