/**
 * P8 story engine: pure template/evaluation layer.  Instances deliberately
 * keep IDs, state and compact tokens only; the UI owns the prose.
 */
export const CAREER_EVENTS_VERSION = 1;
export const MAX_ACTIVE_CAREER_EVENTS = 3;
export const MAX_RESOLVED_CAREER_EVENTS = 32;
export const EVENT_EXPIRY_WEEKS = 2;

export const EVENT_TEMPLATES = [
  { id:'broken_promise', version:1, category:'squad', priority:90, cooldown:8, expiry:2 },
  { id:'early_return', version:1, category:'medical', priority:70, cooldown:6, expiry:1 },
  { id:'board_pressure', version:1, category:'board', priority:80, cooldown:5, expiry:2 },
  { id:'budget_pressure', version:1, category:'finance', priority:75, cooldown:7, expiry:2 },
  { id:'press_derby', version:1, category:'press', priority:55, cooldown:6, expiry:1 },
];

const TEMPLATE_BY_ID = new Map(EVENT_TEMPLATES.map(template => [template.id, template]));
export const eventTemplateFor = id => TEMPLATE_BY_ID.get(id) ?? null;
export const eventWeekKey = save => `${String(save?.season ?? 'unknown')}:${Number(save?.currentGameweek ?? 0)}`;

export function createCareerEventsState() {
  return { version:CAREER_EVENTS_VERSION, active:[], resolved:[], cooldowns:{}, processedWeekKeys:[], rivalries:{}, fanContext:{ sentiment:50, pressure:0 } };
}

export function normalizeCareerEvents(value) {
  const state = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...createCareerEventsState(), ...state,
    version:CAREER_EVENTS_VERSION,
    active:Array.isArray(state.active) ? state.active.slice(-MAX_ACTIVE_CAREER_EVENTS) : [],
    resolved:Array.isArray(state.resolved) ? state.resolved.slice(-MAX_RESOLVED_CAREER_EVENTS) : [],
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
    if (!current[key]) current[key] = { clubIds:[userTeam.id, team.id].sort(), intensity:Math.max(35, Math.min(70, 45 + Math.round(Math.min(Number(userTeam.reputation ?? 70), Number(team.reputation ?? 70)) / 5))), source:'league_peer' };
  }
  return current;
}

function eligibleCandidates(snapshot) {
  const broken = (snapshot.players ?? []).filter(player => player.teamId === snapshot.save.userTeamId && player.playingTimeAgreement?.status === 'broken')
    .sort((a, b) => Number(a.individualMorale ?? 50) - Number(b.individualMorale ?? 50) || String(a.id).localeCompare(String(b.id)))[0];
  const rehab = (snapshot.players ?? []).filter(player => player.teamId === snapshot.save.userTeamId && player.rehabilitation?.status === 'rehabilitation' && Number(player.rehabilitation?.matchReadiness ?? 0) >= 55 && Number(player.rehabilitation?.matchReadiness ?? 0) < 90)
    .sort((a, b) => Number(b.rehabilitation?.matchReadiness ?? 0) - Number(a.rehabilitation?.matchReadiness ?? 0) || String(a.id).localeCompare(String(b.id)))[0];
  const form = snapshot.standing?.form ?? [];
  const pressure = snapshot.fanContext?.pressure ?? 0;
  const financeCash = Number(snapshot.team?.finance?.cash ?? snapshot.team?.budget ?? 0);
  return [
    broken ? { templateId:'broken_promise', participantIds:{ playerId:broken.id }, tokens:{ playerName:broken.name ?? 'A key player' } } : null,
    rehab ? { templateId:'early_return', participantIds:{ playerId:rehab.id }, tokens:{ playerName:rehab.name ?? 'A player', readiness:Math.round(rehab.rehabilitation.matchReadiness) } } : null,
    (pressure >= 52 || (form.slice(-4).filter(result => result === 'L').length >= 3)) ? { templateId:'board_pressure', participantIds:{}, tokens:{ pressure } } : null,
    financeCash < 3_000_000 ? { templateId:'budget_pressure', participantIds:{}, tokens:{ cash:financeCash } } : null,
    snapshot.nextOpponentIsRival && pressure >= 35 ? { templateId:'press_derby', participantIds:{ opponentId:snapshot.nextOpponentId ?? null }, tokens:{ opponentName:snapshot.nextOpponentName ?? 'your rivals' } } : null,
  ].filter(Boolean);
}

function isCoolingDown(state, candidate, week) {
  const template = eventTemplateFor(candidate.templateId);
  const key = `${candidate.templateId}:${candidate.participantIds.playerId ?? candidate.participantIds.opponentId ?? 'club'}`;
  const last = Number(state.cooldowns[key] ?? -999);
  return Number(week) - last < Number(template?.cooldown ?? 0);
}

export function selectCareerEvents(snapshot, stateInput) {
  const state = normalizeCareerEvents(stateInput);
  const week = Number(snapshot?.save?.currentGameweek ?? 0);
  const activeKeys = new Set(state.active.map(event => `${event.templateId}:${event.participantIds?.playerId ?? event.participantIds?.opponentId ?? 'club'}`));
  return eligibleCandidates(snapshot)
    .filter(candidate => !isCoolingDown(state, candidate, week))
    .filter(candidate => !activeKeys.has(`${candidate.templateId}:${candidate.participantIds.playerId ?? candidate.participantIds.opponentId ?? 'club'}`))
    .sort((a, b) => Number(eventTemplateFor(b.templateId)?.priority ?? 0) - Number(eventTemplateFor(a.templateId)?.priority ?? 0) || a.templateId.localeCompare(b.templateId))
    .slice(0, Math.max(0, MAX_ACTIVE_CAREER_EVENTS - state.active.length));
}

export function createEventInstance(candidate, save) {
  const template = eventTemplateFor(candidate.templateId);
  const week = Number(save.currentGameweek ?? 0);
  const suffix = candidate.participantIds.playerId ?? candidate.participantIds.opponentId ?? 'club';
  return {
    id:`event_${template.id}_${String(save.season).replace(/[^a-z0-9]/gi, '')}_${week}_${suffix}`,
    templateId:template.id, templateVersion:template.version, category:template.category,
    createdGameweek:week, expiryGameweek:week + template.expiry, status:'pending',
    participantIds:candidate.participantIds, tokens:candidate.tokens, selectedChoice:null,
    effectApplicationKey:null, followUpState:null, resolutionCode:null,
  };
}

export function expireCareerEvents(stateInput, save) {
  const state = normalizeCareerEvents(stateInput);
  const week = Number(save?.currentGameweek ?? 0);
  const expired = state.active.filter(event => week > Number(event.expiryGameweek ?? week));
  if (!expired.length) return { state, expired:[] };
  const resolved = [...state.resolved, ...expired.map(event => ({ ...event, status:'expired', resolutionCode:'expired', resolvedGameweek:week }))].slice(-MAX_RESOLVED_CAREER_EVENTS);
  return { state:{ ...state, active:state.active.filter(event => !expired.includes(event)), resolved }, expired };
}

export function careerEventChoices(event) {
  const common = { label:'Acknowledge', command:'acknowledge' };
  switch (event?.templateId) {
    case 'broken_promise': return [{ id:'recommit', label:'Recommit to their role', command:'morale', amount:8 }, { id:'open_exit', label:'Accept they may leave', command:'transfer_list', amount:-3 }];
    case 'early_return': return [{ id:'protect', label:'Keep the recovery plan', command:'morale', amount:2 }, { id:'accelerate', label:'Allow an early return', command:'early_return' }];
    case 'board_pressure': return [{ id:'rally', label:'Back the squad publicly', command:'team_morale', amount:5 }, { id:'take_blame', label:'Take responsibility', command:'job_security', amount:5 }];
    case 'budget_pressure': return [{ id:'protect_squad', label:'Protect the playing budget', command:'job_security', amount:-5 }, { id:'cut_costs', label:'Accept a cost-cutting plan', command:'finance', amount:1_000_000 }];
    case 'press_derby': return [{ id:'lower_temperature', label:'Defuse the occasion', command:'team_morale', amount:3 }, { id:'raise_stakes', label:'Challenge the squad', command:'job_security', amount:-2 }];
    default: return [common];
  }
}
