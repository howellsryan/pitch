/**
 * P8 story engine: pure template/evaluation layer. Instances deliberately
 * keep IDs, state and compact tokens only; the UI owns the prose.
 */
export const CAREER_EVENTS_VERSION = 2;
export const MAX_ACTIVE_CAREER_EVENTS = 3;
export const MAX_RESOLVED_CAREER_EVENTS = 32;
export const MAX_PENDING_FOLLOW_UPS = 12;
export const EVENT_EXPIRY_WEEKS = 2;

export const EVENT_TEMPLATES = [
  { id:'manager_approach', version:1, category:'career', priority:96, cooldown:2, expiry:2 },
  { id:'broken_promise', version:1, category:'squad', priority:90, cooldown:8, expiry:2 },
  { id:'star_contract', version:1, category:'squad', priority:84, cooldown:8, expiry:2 },
  { id:'board_pressure', version:1, category:'board', priority:80, cooldown:5, expiry:2 },
  { id:'budget_pressure', version:1, category:'finance', priority:75, cooldown:7, expiry:2 },
  { id:'early_return', version:1, category:'medical', priority:70, cooldown:6, expiry:1 },
  { id:'youngster_loan', version:1, category:'squad', priority:68, cooldown:10, expiry:2 },
  { id:'press_derby', version:1, category:'press', priority:55, cooldown:6, expiry:1 },
  { id:'promise_review', version:1, category:'squad', priority:92, cooldown:0, expiry:2, followUp:true },
  { id:'contract_review', version:1, category:'squad', priority:86, cooldown:0, expiry:2, followUp:true },
  { id:'budget_review', version:1, category:'finance', priority:82, cooldown:0, expiry:2, followUp:true },
  { id:'youngster_path_review', version:1, category:'squad', priority:74, cooldown:0, expiry:2, followUp:true },
];

const TEMPLATE_BY_ID = new Map(EVENT_TEMPLATES.map(template => [template.id, template]));
export const eventTemplateFor = id => TEMPLATE_BY_ID.get(id) ?? null;
export const eventWeekKey = save => `${String(save?.season ?? 'unknown')}:${Number(save?.currentGameweek ?? 0)}`;

function eventParticipantKey(participantIds = {}) {
  return participantIds.playerId ?? participantIds.approachId ?? participantIds.opponentId ?? participantIds.clubId ?? 'club';
}

function eventCooldownKey(templateId, participantIds = {}) {
  return `${templateId}:${eventParticipantKey(participantIds)}`;
}

function parseCareerDate(value) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
}

function addWeeksIso(value, weeks) {
  const time = parseCareerDate(value);
  if (time == null) return null;
  return new Date(time + Math.max(0, Number(weeks) || 0) * 7 * 86_400_000).toISOString();
}

function seasonStartYear(save) {
  const parsed = parseInt(String(save?.season ?? '').split('/')[0], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function contractYearsRemaining(player, save) {
  const currentYear = seasonStartYear(save);
  if (player?.contractExpiry == null) return 2;
  return Math.max(0, Number(player.contractExpiry) - currentYear);
}

function financeCash(snapshot) {
  return Number(snapshot?.team?.finance?.cash ?? snapshot?.team?.budget ?? 0);
}

export function createCareerEventsState() {
  return {
    version:CAREER_EVENTS_VERSION,
    active:[],
    resolved:[],
    pendingFollowUps:[],
    cooldowns:{},
    processedWeekKeys:[],
    rivalries:{},
    fanContext:{ sentiment:50, pressure:0 },
  };
}

export function normalizeCareerEvents(value) {
  const state = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...createCareerEventsState(), ...state,
    version:CAREER_EVENTS_VERSION,
    active:Array.isArray(state.active) ? state.active.slice(-MAX_ACTIVE_CAREER_EVENTS) : [],
    resolved:Array.isArray(state.resolved) ? state.resolved.slice(-MAX_RESOLVED_CAREER_EVENTS) : [],
    pendingFollowUps:Array.isArray(state.pendingFollowUps) ? state.pendingFollowUps.slice(-MAX_PENDING_FOLLOW_UPS) : [],
    cooldowns:state.cooldowns && typeof state.cooldowns === 'object' ? state.cooldowns : {},
    processedWeekKeys:Array.isArray(state.processedWeekKeys) ? state.processedWeekKeys.slice(-80) : [],
    rivalries:state.rivalries && typeof state.rivalries === 'object' ? state.rivalries : {},
    fanContext:{ sentiment:50, pressure:0, ...(state.fanContext ?? {}) },
  };
}

export function careerEventsNeedBackfill(save) {
  return !save || Number(save?.careerEvents?.version ?? 0) < CAREER_EVENTS_VERSION;
}

export function buildCareerEventsBackfill(save) {
  if (!save || !careerEventsNeedBackfill(save)) return save;
  return { ...save, careerEvents:normalizeCareerEvents(save.careerEvents) };
}

export function deriveFanContext({ form = [], jobSecurity = 65, teamMorale = 50, prior = null } = {}) {
  const points = form.slice(-5).reduce((total, result) => total + (result === 'W' ? 3 : result === 'D' ? 1 : 0), 0);
  const formPressure = Math.max(0, 9 - points) * 5;
  const pressure = Math.max(0, Math.min(100, Math.round(formPressure + Math.max(0, 55 - Number(jobSecurity)) * .55 + Math.max(0, 48 - Number(teamMorale)) * .35)));
  const sentiment = Math.max(0, Math.min(100, Math.round(100 - pressure)));
  return { sentiment, pressure, previousPressure:Number(prior?.pressure ?? 0) };
}

export function buildRivalries(userTeam, teams = [], existing = {}) {
  const current = { ...(existing ?? {}) };
  if (!userTeam?.id) return current;
  const candidates = teams
    .filter(team => team.id !== userTeam.id && team.league === userTeam.league)
    .sort((a, b) => Math.abs(Number(b.reputation ?? 0) - Number(userTeam.reputation ?? 0)) - Math.abs(Number(a.reputation ?? 0) - Number(userTeam.reputation ?? 0)) || String(a.id).localeCompare(String(b.id)))
    .slice(0, 3);
  for (const team of candidates) {
    const key = [userTeam.id, team.id].sort().join(':');
    if (!current[key]) current[key] = {
      clubIds:[userTeam.id, team.id].sort(),
      intensity:Math.max(35, Math.min(70, 45 + Math.round(Math.min(Number(userTeam.reputation ?? 70), Number(team.reputation ?? 70)) / 5))),
      source:'league_peer',
    };
  }
  return current;
}

function eligibleCandidates(snapshot) {
  const save = snapshot.save ?? {};
  const userTeamId = save.userTeamId;
  const userPlayers = (snapshot.players ?? []).filter(player => player.teamId === userTeamId);
  const broken = userPlayers
    .filter(player => player.playingTimeAgreement?.status === 'broken')
    .sort((a, b) => Number(a.individualMorale ?? 50) - Number(b.individualMorale ?? 50) || String(a.id).localeCompare(String(b.id)))[0];
  const rehab = userPlayers
    .filter(player => player.rehabilitation?.status === 'rehabilitation' && Number(player.rehabilitation?.matchReadiness ?? 0) >= 55 && Number(player.rehabilitation?.matchReadiness ?? 0) < 90)
    .sort((a, b) => Number(b.rehabilitation?.matchReadiness ?? 0) - Number(a.rehabilitation?.matchReadiness ?? 0) || String(a.id).localeCompare(String(b.id)))[0];
  const youngster = userPlayers
    .filter(player => player.id !== broken?.id)
    .filter(player => Number(player.age ?? 99) <= 21 && player.squadRole === 'prospect')
    .filter(player => !player.onLoan && !player.loanedFrom && !player.signedThisSeason)
    .filter(player => ['at_risk','broken'].includes(player.playingTimeAgreement?.status) || Number(player.playingTimeAgreement?.deliveryScore ?? 1) < .72)
    .sort((a, b) => Number(a.playingTimeAgreement?.deliveryScore ?? 1) - Number(b.playingTimeAgreement?.deliveryScore ?? 1) || Number(b.potentialRating ?? 0) - Number(a.potentialRating ?? 0) || String(a.id).localeCompare(String(b.id)))[0];
  const star = userPlayers
    .filter(player => player.id !== broken?.id && player.id !== youngster?.id)
    .filter(player => !player.onLoan && !player.loanedFrom)
    .filter(player => ['crucial','important'].includes(player.squadRole) || Number(player.value ?? 0) >= 20_000_000)
    .filter(player => contractYearsRemaining(player, save) <= 1)
    .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0) || Number(a.individualMorale ?? 50) - Number(b.individualMorale ?? 50) || String(a.id).localeCompare(String(b.id)))[0];
  const approach = (save.managerMarket?.userApproaches ?? [])
    .filter(item => item?.source === 'approach' && (item.status ?? 'pending') === 'pending')
    .sort((a, b) => Number(b.fit ?? 0) - Number(a.fit ?? 0) || String(a.id).localeCompare(String(b.id)))[0];
  const approachTeam = approach ? (snapshot.teams ?? []).find(team => team.id === approach.clubId) : null;
  const form = snapshot.standing?.form ?? [];
  const pressure = snapshot.fanContext?.pressure ?? 0;
  const cash = financeCash(snapshot);
  return [
    approach ? {
      templateId:'manager_approach',
      participantIds:{ approachId:approach.id, clubId:approach.clubId },
      tokens:{ clubName:approachTeam?.name ?? 'another club', fit:Math.round(Number(approach.fit ?? 0)) },
    } : null,
    broken ? { templateId:'broken_promise', participantIds:{ playerId:broken.id }, tokens:{ playerName:broken.name ?? 'A key player' } } : null,
    star ? {
      templateId:'star_contract',
      participantIds:{ playerId:star.id },
      tokens:{ playerName:star.name ?? 'A senior player', yearsLeft:contractYearsRemaining(star, save) },
    } : null,
    rehab ? { templateId:'early_return', participantIds:{ playerId:rehab.id }, tokens:{ playerName:rehab.name ?? 'A player', readiness:Math.round(rehab.rehabilitation.matchReadiness) } } : null,
    youngster ? {
      templateId:'youngster_loan',
      participantIds:{ playerId:youngster.id },
      tokens:{ playerName:youngster.name ?? 'A young player', age:Number(youngster.age ?? 0) },
    } : null,
    (pressure >= 52 || (form.slice(-4).filter(result => result === 'L').length >= 3)) ? { templateId:'board_pressure', participantIds:{}, tokens:{ pressure } } : null,
    cash < 3_000_000 ? { templateId:'budget_pressure', participantIds:{}, tokens:{ cash } } : null,
    snapshot.nextOpponentIsRival && pressure >= 35 ? { templateId:'press_derby', participantIds:{ opponentId:snapshot.nextOpponentId ?? null }, tokens:{ opponentName:snapshot.nextOpponentName ?? 'your rivals' } } : null,
  ].filter(Boolean);
}

function isCoolingDown(state, candidate, week) {
  const template = eventTemplateFor(candidate.templateId);
  const last = Number(state.cooldowns[eventCooldownKey(candidate.templateId, candidate.participantIds)] ?? -999);
  return Number(week) - last < Number(template?.cooldown ?? 0);
}

export function selectCareerEvents(snapshot, stateInput) {
  const state = normalizeCareerEvents(stateInput);
  const week = Number(snapshot?.save?.currentGameweek ?? 0);
  const activeKeys = new Set(state.active.map(event => eventCooldownKey(event.templateId, event.participantIds)));
  const activePlayerIds = new Set(state.active.map(event => event.participantIds?.playerId).filter(Boolean));
  const activeApproachIds = new Set(state.active.map(event => event.participantIds?.approachId).filter(Boolean));
  return eligibleCandidates(snapshot)
    .filter(candidate => !isCoolingDown(state, candidate, week))
    .filter(candidate => !activeKeys.has(eventCooldownKey(candidate.templateId, candidate.participantIds)))
    .filter(candidate => !candidate.participantIds?.playerId || !activePlayerIds.has(candidate.participantIds.playerId))
    .filter(candidate => !candidate.participantIds?.approachId || !activeApproachIds.has(candidate.participantIds.approachId))
    .sort((a, b) => Number(eventTemplateFor(b.templateId)?.priority ?? 0) - Number(eventTemplateFor(a.templateId)?.priority ?? 0) || a.templateId.localeCompare(b.templateId))
    .slice(0, Math.max(0, MAX_ACTIVE_CAREER_EVENTS - state.active.length));
}

export function createEventInstance(candidate, save) {
  const template = eventTemplateFor(candidate.templateId);
  const week = Number(save.currentGameweek ?? 0);
  const suffix = eventParticipantKey(candidate.participantIds);
  return {
    id:candidate.instanceId ?? `event_${template.id}_${String(save.season).replace(/[^a-z0-9]/gi, '')}_${week}_${suffix}`,
    templateId:template.id,
    templateVersion:template.version,
    category:template.category,
    createdGameweek:week,
    createdDate:save.currentDate ?? null,
    expiryGameweek:week + template.expiry,
    expiryDate:addWeeksIso(save.currentDate, template.expiry),
    status:'pending',
    participantIds:candidate.participantIds,
    tokens:candidate.tokens,
    selectedChoice:null,
    effectApplicationKey:null,
    followUpState:candidate.followUpState ?? null,
    resolutionCode:null,
  };
}

export function isCareerEventExpired(event, save) {
  const now = parseCareerDate(save?.currentDate);
  const expiryDate = parseCareerDate(event?.expiryDate);
  if (now != null && expiryDate != null) return now > expiryDate;
  return Number(save?.currentGameweek ?? 0) > Number(event?.expiryGameweek ?? Number.MAX_SAFE_INTEGER);
}

export function expireCareerEvents(stateInput, save) {
  const state = normalizeCareerEvents(stateInput);
  const week = Number(save?.currentGameweek ?? 0);
  const expired = state.active.filter(event => isCareerEventExpired(event, save));
  if (!expired.length) return { state, expired:[] };
  const resolved = [...state.resolved, ...expired.map(event => ({ ...event, status:'expired', resolutionCode:'expired', resolvedGameweek:week }))].slice(-MAX_RESOLVED_CAREER_EVENTS);
  return { state:{ ...state, active:state.active.filter(event => !expired.includes(event)), resolved }, expired };
}

const FOLLOW_UP_RULES = Object.freeze({
  broken_promise:{ recommit:{ templateId:'promise_review', delayWeeks:2, expiryWeeks:2 } },
  youngster_loan:{ stay_path:{ templateId:'youngster_path_review', delayWeeks:3, expiryWeeks:2 } },
  star_contract:{ reassure:{ templateId:'contract_review', delayWeeks:3, expiryWeeks:2 } },
  budget_pressure:{ protect_squad:{ templateId:'budget_review', delayWeeks:2, expiryWeeks:2 } },
});

export function createCareerEventFollowUp(event, choiceId, save) {
  const rule = FOLLOW_UP_RULES[event?.templateId]?.[choiceId];
  if (!rule) return null;
  const dueDate = addWeeksIso(save?.currentDate, rule.delayWeeks);
  const expiryDate = addWeeksIso(save?.currentDate, rule.delayWeeks + rule.expiryWeeks);
  return {
    id:`followup_${event.id}_${rule.templateId}`,
    templateId:rule.templateId,
    sourceEventId:event.id,
    sourceTemplateId:event.templateId,
    sourceChoiceId:choiceId,
    createdWeekKey:eventWeekKey(save),
    dueGameweek:Number(save?.currentGameweek ?? 0) + rule.delayWeeks,
    dueDate,
    expiryGameweek:Number(save?.currentGameweek ?? 0) + rule.delayWeeks + rule.expiryWeeks,
    expiryDate,
    participantIds:{ ...(event.participantIds ?? {}) },
    tokens:{ ...(event.tokens ?? {}), priorChoice:choiceId },
  };
}

function followUpIsDue(followUp, save) {
  const now = parseCareerDate(save?.currentDate);
  const due = parseCareerDate(followUp?.dueDate);
  if (now != null && due != null) return now >= due;
  return Number(save?.currentGameweek ?? 0) >= Number(followUp?.dueGameweek ?? Number.MAX_SAFE_INTEGER);
}

function followUpIsExpired(followUp, save) {
  const now = parseCareerDate(save?.currentDate);
  const expiry = parseCareerDate(followUp?.expiryDate);
  if (now != null && expiry != null) return now > expiry;
  return Number(save?.currentGameweek ?? 0) > Number(followUp?.expiryGameweek ?? Number.MAX_SAFE_INTEGER);
}

function followUpResolution(followUp, snapshot) {
  const playerId = followUp.participantIds?.playerId;
  const player = playerId ? (snapshot.players ?? []).find(item => item.id === playerId) : null;
  const userTeamId = snapshot.save?.userTeamId;
  if (['promise_review','youngster_path_review','contract_review'].includes(followUp.templateId)) {
    if (!player) return 'participant_unavailable';
    if (followUp.templateId === 'youngster_path_review' && player.onLoan && player.loanOriginalTeamId === userTeamId) return 'pathway_loaned';
    if (player.teamId !== userTeamId) return 'participant_moved';
  }
  if (followUp.templateId === 'promise_review' && player.playingTimeAgreement?.status !== 'broken') return 'promise_recovered';
  if (followUp.templateId === 'youngster_path_review') {
    const agreement = player.playingTimeAgreement;
    if (['fulfilled','settling'].includes(agreement?.status) || Number(agreement?.appearanceShare ?? 0) >= .22) return 'pathway_improved';
  }
  if (followUp.templateId === 'contract_review' && contractYearsRemaining(player, snapshot.save) > 1) return 'contract_resolved';
  if (followUp.templateId === 'budget_review' && financeCash(snapshot) >= 3_000_000) return 'finances_stabilised';
  return null;
}

function compactFollowUpResolution(followUp, snapshot, resolutionCode) {
  const template = eventTemplateFor(followUp.templateId);
  return {
    id:`event_${followUp.id}`,
    templateId:followUp.templateId,
    templateVersion:template?.version ?? 1,
    category:template?.category ?? 'career',
    status:'resolved',
    participantIds:followUp.participantIds,
    tokens:followUp.tokens,
    selectedChoice:null,
    effectApplicationKey:null,
    followUpState:{ sourceEventId:followUp.sourceEventId, sourceTemplateId:followUp.sourceTemplateId, sourceChoiceId:followUp.sourceChoiceId },
    resolutionCode,
    resolvedGameweek:Number(snapshot.save?.currentGameweek ?? 0),
  };
}

export function advanceCareerEventFollowUps(stateInput, snapshot) {
  let state = normalizeCareerEvents(stateInput);
  if (!state.pendingFollowUps.length) return { state, promoted:[], autoResolved:[] };
  const pending = [];
  const promoted = [];
  const autoResolved = [];
  const ordered = [...state.pendingFollowUps].sort((a, b) => {
    const priority = Number(eventTemplateFor(b.templateId)?.priority ?? 0) - Number(eventTemplateFor(a.templateId)?.priority ?? 0);
    return priority || String(a.id).localeCompare(String(b.id));
  });
  let availableSlots = Math.max(0, MAX_ACTIVE_CAREER_EVENTS - state.active.length);

  for (const followUp of ordered) {
    if (followUpIsExpired(followUp, snapshot.save)) {
      autoResolved.push(compactFollowUpResolution(followUp, snapshot, 'followup_expired'));
      continue;
    }
    if (!followUpIsDue(followUp, snapshot.save)) {
      pending.push(followUp);
      continue;
    }
    const resolvedCode = followUpResolution(followUp, snapshot);
    if (resolvedCode) {
      autoResolved.push(compactFollowUpResolution(followUp, snapshot, resolvedCode));
      continue;
    }
    if (availableSlots <= 0) {
      pending.push(followUp);
      continue;
    }
    const instance = createEventInstance({
      templateId:followUp.templateId,
      participantIds:followUp.participantIds,
      tokens:followUp.tokens,
      instanceId:`event_${followUp.id}`,
      followUpState:{ sourceEventId:followUp.sourceEventId, sourceTemplateId:followUp.sourceTemplateId, sourceChoiceId:followUp.sourceChoiceId },
    }, snapshot.save);
    promoted.push(instance);
    availableSlots -= 1;
  }

  state = {
    ...state,
    active:[...state.active, ...promoted],
    pendingFollowUps:pending.slice(-MAX_PENDING_FOLLOW_UPS),
    resolved:[...state.resolved, ...autoResolved].slice(-MAX_RESOLVED_CAREER_EVENTS),
  };
  return { state, promoted, autoResolved };
}

export function careerEventChoices(event) {
  const common = { label:'Acknowledge', command:'acknowledge' };
  switch (event?.templateId) {
    case 'broken_promise': return [{ id:'recommit', label:'Recommit to their role', command:'morale', amount:8 }, { id:'open_exit', label:'Accept they may leave', command:'transfer_list', amount:-3 }];
    case 'early_return': return [{ id:'protect', label:'Keep the recovery plan', command:'morale', amount:2 }, { id:'accelerate', label:'Allow an early return', command:'early_return' }];
    case 'board_pressure': return [{ id:'rally', label:'Back the squad publicly', command:'team_morale', amount:5 }, { id:'take_blame', label:'Take responsibility', command:'job_security', amount:5 }];
    case 'budget_pressure': return [{ id:'protect_squad', label:'Protect the playing budget', command:'job_security', amount:-5 }, { id:'cut_costs', label:'Accept a cost-cutting plan', command:'finance', amount:1_000_000 }];
    case 'press_derby': return [{ id:'lower_temperature', label:'Defuse the occasion', command:'team_morale', amount:3 }, { id:'raise_stakes', label:'Challenge the squad', command:'job_security', amount:-2 }];
    case 'youngster_loan': return [{ id:'stay_path', label:'Ask them to fight for minutes', command:'morale', amount:4 }, { id:'loan_move', label:'Approve a loan move', command:'loan_out' }];
    case 'star_contract': return [{ id:'reassure', label:'Reassure them talks will follow', command:'morale', amount:5 }, { id:'open_market', label:'Open the door to offers', command:'transfer_list', amount:-2 }];
    case 'manager_approach': return [{ id:'accept_job', label:'Accept the approach', command:'manager_approach', outcome:'accept' }, { id:'decline_job', label:'Decline and move on', command:'manager_approach', outcome:'decline' }];
    case 'promise_review': return [{ id:'one_last_chance', label:'Give the promise one last chance', command:'morale', amount:3 }, { id:'open_exit', label:'Make them available', command:'transfer_list', amount:-2 }];
    case 'youngster_path_review': return [{ id:'loan_move', label:'Approve the loan now', command:'loan_out' }, { id:'keep_competing', label:'Keep them competing here', command:'morale', amount:-3 }];
    case 'contract_review': return [{ id:'hold_course', label:'Hold your position', command:'morale', amount:-3 }, { id:'open_market', label:'Invite offers', command:'transfer_list', amount:-2 }];
    case 'budget_review': return [{ id:'cut_costs', label:'Make the savings now', command:'finance', amount:500_000 }, { id:'hold_line', label:'Keep protecting the squad', command:'job_security', amount:-4 }];
    default: return [common];
  }
}
