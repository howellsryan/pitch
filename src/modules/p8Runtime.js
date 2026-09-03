import { getAllPlayers, getAllStandings, getAllTeams, getFixturesByGW, getPlayer, getSave, getTeam, putPlayer, putSave, putTeam } from './db.js';
import { applyLedgerMovement } from './clubFinance.js';
import { buildRivalries, buildCareerEventsBackfill, careerEventChoices, createCareerEventsState, createEventInstance, deriveFanContext, eventWeekKey, expireCareerEvents, normalizeCareerEvents, selectCareerEvents } from './careerEvents.js';

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
  if (!save) return { save, added:[], expired:[], alreadyProcessed:true };
  let state = normalizeCareerEvents(save.careerEvents ?? createCareerEventsState());
  const key = eventWeekKey(save);
  if (state.processedWeekKeys.includes(key)) return { save, added:[], expired:[], alreadyProcessed:true };
  const [team, teams, players, standings, nextFixtures] = await Promise.all([getTeam(save.userTeamId), getAllTeams(), getAllPlayers(), getAllStandings(), getFixturesByGW(Number(save.currentGameweek ?? 0) + 1)]);
  const standing = standingForUser(standings, save.userTeamId);
  const rivalries = buildRivalries(team, teams, state.rivalries);
  const fanContext = deriveFanContext({ form:standing?.form ?? [], jobSecurity:save.jobSecurity, teamMorale:team?.morale, prior:state.fanContext });
  const expiry = expireCareerEvents({ ...state, rivalries, fanContext }, save);
  state = expiry.state;
  const nextFixture = nextFixtures.find(fixture => fixture.homeTeamId === save.userTeamId || fixture.awayTeamId === save.userTeamId);
  const nextOpponentId = nextFixture && (nextFixture.homeTeamId === save.userTeamId ? nextFixture.awayTeamId : nextFixture.homeTeamId);
  const nextOpponent = teams.find(candidate => candidate.id === nextOpponentId);
  const nextOpponentIsRival = Object.values(rivalries).some(rivalry => rivalry.clubIds?.includes(save.userTeamId) && rivalry.clubIds?.includes(nextOpponentId) && Number(rivalry.intensity ?? 0) >= 45);
  const candidates = selectCareerEvents({ save, team, players, standing, fanContext, nextOpponentIsRival, nextOpponentId, nextOpponentName:nextOpponent?.name }, state);
  const added = candidates.map(candidate => createEventInstance(candidate, save));
  const next = {
    ...save,
    careerEvents:{ ...state, active:[...state.active, ...added], rivalries, fanContext, processedWeekKeys:[...state.processedWeekKeys, key].slice(-80) },
  };
  await putSave(next);
  return { save:next, added, expired:expiry.expired, alreadyProcessed:false };
}

function assertPendingEvent(event, save) {
  if (!event || event.status !== 'pending') throw new Error('CAREER_EVENT_NOT_PENDING');
  if (Number(save.currentGameweek ?? 0) > Number(event.expiryGameweek ?? 0)) throw new Error('CAREER_EVENT_EXPIRED');
}

function hasApplied(entity, key) { return (entity?.p8AppliedEffectKeys ?? []).includes(key); }
function markApplied(entity, key) { return { ...entity, p8AppliedEffectKeys:[...(entity.p8AppliedEffectKeys ?? []), key].slice(-40) }; }

async function applyCommand(event, choice, save, effectApplicationKey) {
  const playerId = event.participantIds?.playerId;
  if (choice.command === 'morale') {
    const player = playerId ? await getPlayer(playerId) : null;
    if (!player || player.teamId !== save.userTeamId) throw new Error('EVENT_PARTICIPANT_UNAVAILABLE');
    if (!hasApplied(player, effectApplicationKey)) await putPlayer(markApplied({ ...player, individualMorale:Math.max(0, Math.min(100, Number(player.individualMorale ?? 50) + Number(choice.amount ?? 0))) }, effectApplicationKey));
  } else if (choice.command === 'transfer_list') {
    const player = playerId ? await getPlayer(playerId) : null;
    if (!player || player.teamId !== save.userTeamId) throw new Error('EVENT_PARTICIPANT_UNAVAILABLE');
    if (!hasApplied(player, effectApplicationKey)) await putPlayer(markApplied({ ...player, transferListed:true, individualMorale:Math.max(0, Number(player.individualMorale ?? 50) + Number(choice.amount ?? 0)) }, effectApplicationKey));
  } else if (choice.command === 'early_return') {
    const player = playerId ? await getPlayer(playerId) : null;
    if (!player?.rehabilitation || player.teamId !== save.userTeamId) throw new Error('EVENT_PARTICIPANT_UNAVAILABLE');
    if (!hasApplied(player, effectApplicationKey)) await putPlayer(markApplied({ ...player, rehabilitation:{ ...player.rehabilitation, earlyReturn:true } }, effectApplicationKey));
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
  }
  return choice.command;
}

export async function resolveCareerEvent(eventId, choiceId) {
  let save = await ensureP8CareerEvents();
  const state = normalizeCareerEvents(save.careerEvents);
  const event = state.active.find(item => item.id === eventId);
  if (event?.status !== 'applying') assertPendingEvent(event, save);
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
  }
  const command = await applyCommand({ ...event, effectApplicationKey }, choice, save, effectApplicationKey);
  // Fetch after the domain command so we cannot overwrite its save change.
  save = await getSave();
  const fresh = normalizeCareerEvents(save.careerEvents);
  const current = fresh.active.find(item => item.id === eventId);
  if (!current) return { alreadyApplied:true, save };
  const resolved = { ...current, status:'resolved', selectedChoice:choice.id, effectApplicationKey, resolutionCode:command, resolvedGameweek:save.currentGameweek };
  const nextState = { ...fresh, active:fresh.active.filter(item => item.id !== eventId), resolved:[...fresh.resolved, resolved].slice(-32), cooldowns:{ ...fresh.cooldowns, [`${current.templateId}:${current.participantIds?.playerId ?? current.participantIds?.opponentId ?? 'club'}`]:save.currentGameweek } };
  const next = { ...save, careerEvents:nextState };
  await putSave(next);
  return { alreadyApplied:false, event:resolved, save:next };
}
