import { currentEffectiveLevel } from './playerModel.js';
import { durableLevel, potentialEstimate } from './playerDevelopment.js';
import { buildScoutingTacticalAssessment } from './scoutingTacticalAssessment.js';
import { coachingEffects } from './coaching.js';
import { scoutingConfidenceMultiplier } from './facilities.js';

/*
 * modules/scouting.js — pure P5 scouting observations and uncertainty.
 *
 * Reports reference canonical player IDs and store observations only. They do
 * not copy or mutate authoritative attributes/potential. Better evidence narrows
 * ranges deterministically, while stale reports widen slightly over time.
 */

export const SCOUTING_VERSION = 1;
export const MAX_SCOUTING_ASSIGNMENTS = 5;
export const FULL_SCOUT_WEEKS = 1;
export const MAX_SCOUTING_ASSIGNMENT_ROWS = 20;
export const MAX_SCOUTING_REPORTS = 80;
export const MAX_SCOUTING_TICK_KEYS = 60;

function scoutingClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function scoutingRound2(value) { return Math.round(value * 100) / 100; }
function scoutingHash(value) {
  let h = 2166136261;
  for (const ch of String(value ?? '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function scoutingUnit(seed) {
  let t = (scoutingHash(seed) + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function confidenceLabel(confidence) {
  return confidence >= .82 ? 'High' : confidence >= .56 ? 'Medium' : 'Low';
}

function scoutingWeekKey(season, gameweek) {
  const gw = Number(gameweek);
  return Number.isInteger(gw) && gw >= 0 ? `${String(season ?? 'unknown')}:${gw}` : null;
}

function reportStage(weeks, mode) {
  if (mode === 'full') return weeks >= FULL_SCOUT_WEEKS ? 'complete' : 'assigned';
  if (weeks >= 4) return 'complete';
  if (weeks >= 2) return 'detailed';
  if (weeks >= 1) return 'observed';
  return 'assigned';
}

export function createScoutingState({ defaultKnowledge = .42 } = {}) {
  return {
    version:SCOUTING_VERSION,
    defaultKnowledge:scoutingClamp(Number(defaultKnowledge) || .42, .25, .8),
    assignments:[],
    reports:[],
    processedWeekKeys:[],
    notifications:[],
    assignmentSeq:0,
  };
}

function normalizeAssignmentRows(rows) {
  if (!Array.isArray(rows)) return [];
  const all = rows.filter(Boolean);
  const active = all.filter(item => item.status === 'active');
  const finishedRoom = Math.max(0, MAX_SCOUTING_ASSIGNMENT_ROWS - active.length);
  const finished = new Set(finishedRoom > 0
    ? all.filter(item => item.status !== 'active').slice(-finishedRoom)
    : []);
  return all.filter(item => item.status === 'active' || finished.has(item));
}

export function normalizeScoutingState(state, { defaultKnowledge = .42 } = {}) {
  const source = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const assignments = normalizeAssignmentRows(source.assignments);
  const reports = Array.isArray(source.reports) ? source.reports.filter(report => report?.playerId).slice(-MAX_SCOUTING_REPORTS) : [];
  const processedWeekKeys = Array.isArray(source.processedWeekKeys) ? source.processedWeekKeys.filter(key => typeof key === 'string').slice(-MAX_SCOUTING_TICK_KEYS) : [];
  const notifications = Array.isArray(source.notifications) ? source.notifications.filter(Boolean).slice(-12) : [];
  return {
    version:SCOUTING_VERSION,
    defaultKnowledge:scoutingClamp(Number(source.defaultKnowledge ?? defaultKnowledge) || .42, .25, .8),
    assignments,
    reports,
    processedWeekKeys,
    notifications,
    assignmentSeq:Math.max(
      Number(source.assignmentSeq) || 0,
      ...assignments.map(item => (Number(item.seq) || 0) + 1),
      0,
    ),
  };
}

export function scoutingNeedsBackfill(save) {
  return !save?.scouting || Number(save.scouting.version ?? 0) < SCOUTING_VERSION;
}

export function scoutingAssignmentIsCurrent(assignment, season) {
  if (!assignment) return false;
  if (season == null || assignment.season == null) return true;
  return String(assignment.season) === String(season);
}

export function createScoutingAssignment(stateInput, assignment, context = {}) {
  const state = normalizeScoutingState(stateInput);
  const live = state.assignments.filter(item => scoutingAssignmentIsCurrent(item, context.season));
  const inTheField = live.filter(item => item.status === 'active');
  const assignmentCap = Number(context.assignmentCap) || MAX_SCOUTING_ASSIGNMENTS;
  if (inTheField.length >= assignmentCap) throw new Error('SCOUTING_ASSIGNMENT_CAP');
  const type = ['player','position','league','shortlist'].includes(assignment?.type) ? assignment.type : 'player';
  if (type === 'player' && assignment?.playerId == null) throw new Error('SCOUTING_PLAYER_REQUIRED');
  const mode = assignment?.mode === 'full' && type === 'player' ? 'full' : 'survey';
  if (mode === 'full' && live.some(item =>
    item.mode === 'full' && item.status === 'active' && String(item.playerId) === String(assignment.playerId))) {
    throw new Error('SCOUTING_ALREADY_ASSIGNED');
  }
  const seq = Number(state.assignmentSeq) || 0;
  const id = `scout:${type}:${mode}:${assignment?.playerId ?? assignment?.position ?? assignment?.league ?? 'list'}:${context.season ?? 'season'}:${context.gameweek ?? 0}:${seq}`;
  const next = {
    id,
    type,
    mode,
    season:context.season ?? null,
    playerId:assignment?.playerId ?? null,
    position:assignment?.position ?? null,
    league:assignment?.league ?? null,
    playerIds:Array.isArray(assignment?.playerIds) ? assignment.playerIds.slice(0, 20) : [],
    label:assignment?.label ?? null,
    seq,
    createdWeekKey:scoutingWeekKey(context.season, context.gameweek),
    lastAdvancedKey:null,
    weeks:0,
    stage:'assigned',
    status:'active',
  };
  return { ...state, assignments:[...live, next], assignmentSeq:seq + 1 };
}

export function cancelScoutingAssignment(stateInput, assignmentId) {
  const state = normalizeScoutingState(stateInput);
  return { ...state, assignments:state.assignments.filter(item => item.id !== assignmentId) };
}

function assignmentCandidates(assignment, players, teamsById) {
  let rows = players.filter(player => player?.teamId && player.teamId !== 'free_agents');
  if (assignment.type === 'player') rows = rows.filter(player => String(player.id) === String(assignment.playerId));
  else if (assignment.type === 'position') rows = rows.filter(player => player.position === assignment.position);
  else if (assignment.type === 'league') rows = rows.filter(player => teamsById.get(player.teamId)?.league === assignment.league);
  else if (assignment.type === 'shortlist') {
    const ids = new Set(assignment.playerIds.map(String));
    rows = rows.filter(player => ids.has(String(player.id)));
  }
  return rows.sort((a,b) => scoutingHash(`${assignment.id}:${a.id}`) - scoutingHash(`${assignment.id}:${b.id}`)).slice(0, assignment.type === 'player' ? 1 : 4);
}

function observedRange(actual, confidence, seed, { minimum = 1, maximum = 99, baseWidth = 10 } = {}) {
  const width = Math.max(1, Math.round(baseWidth - confidence * (baseWidth - 2)));
  const bias = (scoutingUnit(`${seed}:bias`) - .5) * width * .9;
  const centre = scoutingClamp(Math.round(Number(actual) + bias), minimum, maximum);
  return {
    min:scoutingClamp(centre - width, minimum, maximum),
    max:scoutingClamp(centre + width, minimum, maximum),
  };
}

function observedFinancialRange(actual, confidence, seed) {
  const value = Math.max(0, Number(actual) || 0);
  if (value === 0) return { min:0, max:0 };
  const width = scoutingClamp(.24 - confidence * .16, .06, .22);
  const bias = (scoutingUnit(`${seed}:financial-bias`) - .5) * width * 1.1;
  const centre = Math.max(0, value * (1 + bias));
  return {
    min:Math.max(0, Math.round(centre * (1 - width))),
    max:Math.round(centre * (1 + width)),
  };
}

function statusInterest(player, userTeam, seller) {
  const buyerRep = Number(userTeam?.reputation ?? 60);
  const sellerRep = Number(seller?.reputation ?? 60);
  const playerLevel = Number(currentEffectiveLevel(player) ?? 60);
  const draw = buyerRep - Math.max(sellerRep - 4, playerLevel - 5);
  if (draw >= 8) return 'Strong';
  if (draw >= -4) return 'Open';
  return 'Difficult';
}

function buildExactScoutingReport(player, context = {}) {
  const gameweek = Number(context.gameweek ?? 0);
  const season = context.season ?? 'unknown';
  const userTeam = context.userTeam ?? null;
  const seller = context.teamsById?.get?.(player.teamId) ?? null;
  const current = Math.round(Number(durableLevel(player) ?? currentEffectiveLevel(player) ?? 50));
  const potential = Math.round(scoutingClamp(Number(player.potentialRating ?? current), current, 99));
  const tactical = buildScoutingTacticalAssessment({
    player,
    userTeam,
    userSquad:context.userSquad ?? [],
    tacticalProfile:context.tacticalProfile ?? null,
    currentRange:{ min:current, max:current },
    exact:true,
  });
  const value = Math.round(Math.max(0, Number(context.valueFor?.(player) ?? player.value ?? 0)));
  const wage = Math.round(Math.max(0, Number(player.wage ?? 0)));
  return {
    version:SCOUTING_VERSION,
    playerId:String(player.id),
    source:context.source ?? 'assignment',
    observedWeekKey:scoutingWeekKey(season, gameweek),
    observedGameweek:gameweek,
    observedSeason:season,
    exact:true,
    confidence:1,
    confidenceLabel:'Complete',
    stage:'complete',
    current:{ min:current, max:current, evidence:'Complete' },
    tactical:{ roleId:tactical.roleId, fit:tactical.fit, focus:tactical.focus, confidence:'Complete' },
    future:{ min:potential, max:potential, growthProfileConfidence:'Complete' },
    financial:{ feeMin:value, feeMax:value, wageMin:wage, wageMax:wage },
    status:{
      availability:player.signedThisSeason ? 'Moved recently' : player.transferListed ? 'Listed' : 'Under contract',
      happiness:Number(player.individualMorale ?? 50) >= 65 ? 'Positive' : Number(player.individualMorale ?? 50) <= 35 ? 'Unsettled' : 'Stable',
      joiningInterest:statusInterest(player, userTeam, seller),
    },
  };
}

/**
 * Numeric core for an inexact report. Recruitment lists reuse this exact fogged
 * arithmetic without paying for tactical/status prose and without sorting on
 * canonical hidden values.
 */
export function observedPlayerBands(player, context = {}) {
  if (!player) return null;
  const confidence = scoutingClamp(Number(context.confidence ?? .35), .2, .96);
  const gameweek = Number(context.gameweek ?? 0);
  const season = context.season ?? 'unknown';
  const userTeam = context.userTeam ?? null;
  const coachAssessment = coachingEffects(userTeam, player).assessment;
  const adjustedConfidence = scoutingClamp(
    confidence * coachAssessment * scoutingConfidenceMultiplier(userTeam),
    .2,
    .96,
  );
  const seed = `${player.id}:${season}:${gameweek}:${Math.round(adjustedConfidence * 100)}`;
  const current = Number(durableLevel(player) ?? currentEffectiveLevel(player) ?? 50);
  const currentRange = observedRange(current, adjustedConfidence, `${seed}:current`, { baseWidth:9 });
  const future = potentialEstimate(player, adjustedConfidence);
  const value = Math.max(0, Number(context.valueFor?.(player) ?? player.value ?? 0));
  const wage = Math.max(0, Number(player.wage ?? 0));
  const feeRange = observedFinancialRange(value, adjustedConfidence, `${seed}:fee`);
  const wageRange = observedFinancialRange(wage, adjustedConfidence, `${seed}:wage`);
  return {
    season,
    gameweek,
    confidence:adjustedConfidence,
    storedConfidence:scoutingRound2(adjustedConfidence),
    current:currentRange,
    future:{ min:future.min, max:future.max },
    financial:{
      feeMin:feeRange.min,
      feeMax:feeRange.max,
      wageMin:wageRange.min,
      wageMax:wageRange.max,
    },
  };
}

export function buildScoutingReport(player, context = {}) {
  if (!player) return null;
  if (context.exact) return buildExactScoutingReport(player, context);
  const bands = observedPlayerBands(player, context);
  const userTeam = context.userTeam ?? null;
  const seller = context.teamsById?.get?.(player.teamId) ?? null;
  const adjustedConfidence = bands.confidence;
  const tactical = buildScoutingTacticalAssessment({
    player,
    userTeam,
    userSquad:context.userSquad ?? [],
    tacticalProfile:context.tacticalProfile ?? null,
    currentRange:bands.current,
    exact:false,
  });
  return {
    version:SCOUTING_VERSION,
    playerId:String(player.id),
    source:context.source ?? 'assignment',
    observedWeekKey:scoutingWeekKey(bands.season, bands.gameweek),
    observedGameweek:bands.gameweek,
    observedSeason:bands.season,
    confidence:bands.storedConfidence,
    confidenceLabel:confidenceLabel(adjustedConfidence),
    stage:context.stage ?? reportStage(context.weeks ?? 1, context.mode),
    current:{ ...bands.current, evidence:confidenceLabel(adjustedConfidence) },
    tactical:{ roleId:tactical.roleId, fit:tactical.fit, focus:tactical.focus, confidence:confidenceLabel(adjustedConfidence) },
    future:{ ...bands.future, growthProfileConfidence:confidenceLabel(adjustedConfidence) },
    financial:{ ...bands.financial },
    status:{
      availability:player.signedThisSeason ? 'Moved recently' : player.transferListed ? 'Listed' : 'Under contract',
      happiness:Number(player.individualMorale ?? 50) >= 65 ? 'Positive' : Number(player.individualMorale ?? 50) <= 35 ? 'Unsettled' : 'Stable',
      joiningInterest:statusInterest(player, userTeam, seller),
    },
  };
}

export function latestScoutingReport(stateInput, playerId) {
  const state = normalizeScoutingState(stateInput);
  return [...state.reports].reverse().find(report => String(report.playerId) === String(playerId)) ?? null;
}

export function scoutingReportIsCurrent(report, season) {
  if (!report) return false;
  if (season == null || report.observedSeason == null) return true;
  return String(report.observedSeason) === String(season);
}

export function assignmentScoutingReports(stateInput, assignmentId, season = null) {
  const state = normalizeScoutingState(stateInput);
  const id = String(assignmentId);
  return state.reports.filter(report =>
    (String(report.source) === id || (report.sources ?? []).some(source => String(source) === id))
    && (season == null || scoutingReportIsCurrent(report, season)));
}

export function observedPlayerProfile(player, stateInput, context = {}) {
  const state = normalizeScoutingState(stateInput, { defaultKnowledge:context.defaultKnowledge ?? .42 });
  const stored = latestScoutingReport(state, player?.id);
  const report = scoutingReportIsCurrent(stored, context.season) ? stored : null;
  if (report?.exact) {
    const refreshedGameweek = Number(context.gameweek ?? report.observedGameweek ?? 0);
    const refreshed = buildExactScoutingReport(player, {
      ...context,
      source:report.source,
      season:context.season ?? report.observedSeason,
      gameweek:refreshedGameweek,
      valueFor:context.valueFor ?? (() => report.financial?.feeMin ?? player?.value ?? 0),
    });
    return {
      ...report,
      current:refreshed.current,
      tactical:refreshed.tactical,
      future:refreshed.future,
      financial:refreshed.financial,
      status:refreshed.status,
      refreshedWeekKey:refreshed.observedWeekKey,
      refreshedGameweek,
    };
  }
  if (report) {
    const currentGameweek = Number(context.gameweek ?? report.observedGameweek ?? 0);
    const ageWeeks = Math.max(0, currentGameweek - Number(report.observedGameweek ?? currentGameweek));
    if (ageWeeks <= 5) return report;
    const widen = Math.min(4, Math.floor(ageWeeks / 4));
    return {
      ...report,
      stale:true,
      current:{ ...report.current, min:Math.max(1, report.current.min - widen), max:Math.min(99, report.current.max + widen) },
      confidenceLabel:ageWeeks >= 12 ? 'Low' : report.confidenceLabel,
    };
  }
  return buildScoutingReport(player, {
    ...context,
    confidence:state.defaultKnowledge,
    source:'public',
    stage:'public',
    weeks:0,
  });
}

export function advanceScoutingState(stateInput, context = {}) {
  const state = normalizeScoutingState(stateInput, { defaultKnowledge:context.defaultKnowledge });
  const weekKey = scoutingWeekKey(context.season, context.gameweek);
  if (!weekKey || state.processedWeekKeys.includes(weekKey)) return { state, reportsAdded:[], alreadyProcessed:true };
  const players = context.players ?? [];
  const teamsById = context.teamsById ?? new Map();
  const reportByPlayer = new Map(state.reports.map(report => [String(report.playerId), report]));
  const reportsAdded = [];
  const assignments = state.assignments
    .filter(assignment => scoutingAssignmentIsCurrent(assignment, context.season))
    .map(assignment => (assignment.season == null && context.season != null
      ? { ...assignment, season:context.season }
      : assignment))
    .map(assignment => {
    if (assignment.status !== 'active' || assignment.lastAdvancedKey === weekKey) return assignment;
    const weeks = Math.max(0, Number(assignment.weeks ?? 0)) + 1;
    const mode = assignment.mode === 'full' ? 'full' : 'survey';
    const stage = reportStage(weeks, mode);
    const confidence = scoutingClamp(.34 + weeks * .13, .34, .9);
    for (const player of assignmentCandidates(assignment, players, teamsById)) {
      const report = buildScoutingReport(player, {
        source:assignment.id,
        season:context.season,
        gameweek:context.gameweek,
        userTeam:context.userTeam,
        userSquad:context.userSquad,
        tacticalProfile:context.tacticalProfile,
        teamsById,
        valueFor:context.valueFor,
        confidence,
        stage,
        weeks,
        mode,
        exact:mode === 'full' && stage === 'complete',
      });
      if (!report) continue;
      const key = String(player.id);
      const existing = reportByPlayer.get(key);
      const sources = [...new Set([
        ...(existing?.sources ?? []),
        ...(existing?.source ? [existing.source] : []),
        assignment.id,
      ])];
      if (existing?.exact && !report.exact && scoutingReportIsCurrent(existing, context.season)) {
        reportByPlayer.set(key, { ...existing, sources });
        continue;
      }
      const merged = { ...report, sources };
      reportByPlayer.set(key, merged);
      reportsAdded.push(merged);
    }
    return { ...assignment, mode, weeks, stage, lastAdvancedKey:weekKey, status:stage === 'complete' ? 'complete' : 'active' };
  });
  const current = [...reportByPlayer.values()]
    .filter(report => scoutingReportIsCurrent(report, context.season))
    .sort((a,b) => Number(a.observedGameweek ?? 0) - Number(b.observedGameweek ?? 0) || String(a.playerId).localeCompare(String(b.playerId)));
  const exactReports = current.filter(report => report.exact);
  const surveyReports = current.filter(report => !report.exact);
  const keptExact = exactReports.slice(-MAX_SCOUTING_REPORTS);
  const surveyRoom = MAX_SCOUTING_REPORTS - keptExact.length;
  const reports = [
    ...keptExact,
    ...(surveyRoom > 0 ? surveyReports.slice(-surveyRoom) : []),
  ].sort((a,b) => Number(a.observedGameweek ?? 0) - Number(b.observedGameweek ?? 0) || String(a.playerId).localeCompare(String(b.playerId)));
  const notification = reportsAdded.length ? { weekKey, type:'scouting', count:reportsAdded.length, message:`${reportsAdded.length} scouting report${reportsAdded.length === 1 ? '' : 's'} updated` } : null;
  return {
    state:{
      ...state,
      assignments,
      reports,
      processedWeekKeys:[...state.processedWeekKeys, weekKey].slice(-MAX_SCOUTING_TICK_KEYS),
      notifications:notification ? [...state.notifications, notification].slice(-12) : state.notifications,
    },
    reportsAdded,
    alreadyProcessed:false,
  };
}

export function aiRecruitmentObservation(player, buyer, context = {}) {
  if (!player || !buyer) return null;
  const seller = context.teamsById?.get?.(player.teamId);
  const sameLeague = seller?.league && seller.league === buyer.league;
  const listed = player.transferListed === true;
  const age = Number(player.age ?? 25);
  const visibility = (listed ? 42 : 0) + (sameLeague ? 26 : 0) + (age <= 23 ? 8 : 0) + Math.max(0, Number(buyer.reputation ?? 60) - 55) * .35;
  const roll = scoutingHash(`${context.weekKey ?? 'week'}:${buyer.id}:${player.id}:visibility`) % 100;
  if (roll >= scoutingClamp(visibility, 12, 88)) return null;
  const confidence = scoutingClamp(.38 + visibility / 250, .38, .78);
  const current = Number(currentEffectiveLevel(player) ?? 50);
  const currentRange = observedRange(current, confidence, `${buyer.id}:${player.id}:${context.weekKey}:ai-current`, { baseWidth:10 });
  const future = potentialEstimate(player, confidence);
  return {
    confidence:scoutingRound2(confidence),
    confidenceLabel:confidenceLabel(confidence),
    current:currentRange,
    future:{ min:future.min, max:future.max },
  };
}
