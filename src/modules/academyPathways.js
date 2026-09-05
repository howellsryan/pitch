import { currentEffectiveLevel } from './playerModel.js';
import { durableLevel, potentialEstimate } from './playerDevelopment.js';
import { coachingEffects } from './coaching.js';
import { trainingEfficiencyMultiplier } from './facilities.js';
import { evaluateCareerTacticalFit } from './careerTacticalFit.js';
import { isAcademyPlayer, isLoanPlayer, isSeniorEligiblePlayer, normalizePlayerStatus } from './playerStatus.js';

/*
 * modules/academyPathways.js — pure P9 academy/loan evidence and projections.
 *
 * Academy fixtures are deliberately aggregate evidence only: they never enter
 * the senior fixture table or P1 appearance counters. Loans are the opposite:
 * they consume the real P1 senior evidence accumulated at the registration club.
 */

export const ACADEMY_PATHWAYS_VERSION = 1;
export const ACADEMY_PLAYER_CAP = 24;
export const MAX_YOUTH_SCOUTING_ASSIGNMENTS = 4;
export const MAX_YOUTH_SCOUTING_HISTORY = 16;
export const MAX_YOUTH_SCOUTING_NOTIFICATIONS = 10;
export const MAX_LOAN_REPORTS = 8;
export const ACADEMY_FIXTURE_INTERVAL = 2;
export const LOAN_REPORT_INTERVAL = 4;

const ACADEMY_POSITION_GROUPS = Object.freeze({
  GK:['GK'], DEF:['CB','RB','LB'], MID:['CDM','CM','CAM','RM','LM'], ATT:['RW','LW','CF','ST'],
});
const ACADEMY_YOUTH_REGIONS = Object.freeze([
  'UK & Ireland', 'Western Europe', 'Southern Europe', 'Central Europe', 'Northern Europe',
  'South America', 'North America', 'Africa', 'Asia & Oceania',
]);

function academyPathwayClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function academyPathwayRound1(value) { return Math.round(value * 10) / 10; }
function academyPathwayRound2(value) { return Math.round(value * 100) / 100; }
function academyPathwayHash(value) {
  let h = 2166136261;
  for (const ch of String(value ?? '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function academyPathwayUnit(seed) {
  let t = (academyPathwayHash(seed) + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function academyPathwayWeekKey(season, gameweek) {
  const gw = Number(gameweek);
  return Number.isInteger(gw) && gw >= 0 ? `${String(season ?? 'unknown')}:${gw}` : null;
}
function academyPathwayStats(player) {
  return {
    appearances:Math.max(0, Number(player?.appearances ?? 0)),
    starts:Math.max(0, Number(player?.starts ?? 0)),
    minutes:Math.max(0, Number(player?.minutes ?? 0)),
    goals:Math.max(0, Number(player?.goals ?? 0)),
    assists:Math.max(0, Number(player?.assists ?? 0)),
    cleanSheets:Math.max(0, Number(player?.cleanSheets ?? 0)),
    ratingTotal:Math.max(0, Number(player?.ratingTotal ?? 0)),
    ratingApps:Math.max(0, Number(player?.ratingApps ?? 0)),
  };
}
function academyPathwayStatDelta(current, previous) {
  const delta = {};
  for (const key of Object.keys(current)) delta[key] = Math.max(0, Number(current[key] ?? 0) - Number(previous?.[key] ?? 0));
  return delta;
}
function academyPathwayGroup(position) {
  return Object.entries(ACADEMY_POSITION_GROUPS).find(([, positions]) => positions.includes(position))?.[0] ?? 'MID';
}

export function createAcademyPathwaysState() {
  return {
    version:ACADEMY_PATHWAYS_VERSION,
    youthScoutingAssignments:[],
    youthScoutingOrdinal:1,
    processedWeekKeys:[],
    notifications:[],
  };
}

export function normalizeAcademyPathwaysState(stateInput) {
  const source = stateInput && typeof stateInput === 'object' && !Array.isArray(stateInput) ? stateInput : {};
  const assignments = Array.isArray(source.youthScoutingAssignments)
    ? source.youthScoutingAssignments.filter(Boolean).slice(-MAX_YOUTH_SCOUTING_HISTORY)
    : [];
  return {
    version:ACADEMY_PATHWAYS_VERSION,
    youthScoutingAssignments:assignments,
    youthScoutingOrdinal:Math.max(1, Number(source.youthScoutingOrdinal) || 1),
    processedWeekKeys:Array.isArray(source.processedWeekKeys) ? source.processedWeekKeys.filter(key => typeof key === 'string').slice(-60) : [],
    notifications:Array.isArray(source.notifications) ? source.notifications.filter(Boolean).slice(-MAX_YOUTH_SCOUTING_NOTIFICATIONS) : [],
  };
}

export function academyPathwaysNeedsBackfill(save) {
  return !save?.academyPathways || Number(save.academyPathways.version ?? 0) < ACADEMY_PATHWAYS_VERSION;
}

export function youthScoutingRegions() { return [...ACADEMY_YOUTH_REGIONS]; }
export function youthScoutingPositionGroups() { return Object.keys(ACADEMY_POSITION_GROUPS); }

export function createYouthScoutingAssignment(stateInput, input = {}, context = {}) {
  const state = normalizeAcademyPathwaysState(stateInput);
  const active = state.youthScoutingAssignments.filter(item => item.status === 'active' && String(item.season) === String(context.season));
  const cap = Math.max(1, Number(context.assignmentCap ?? MAX_YOUTH_SCOUTING_ASSIGNMENTS));
  if (active.length >= cap) throw new Error('YOUTH_SCOUTING_ASSIGNMENT_CAP');
  const region = ACADEMY_YOUTH_REGIONS.includes(input.region) ? input.region : ACADEMY_YOUTH_REGIONS[0];
  const positionGroup = ACADEMY_POSITION_GROUPS[input.positionGroup] ? input.positionGroup : 'MID';
  const ordinal = state.youthScoutingOrdinal;
  const id = `academy-scout:${context.teamId ?? 'club'}:${String(context.season ?? 'season')}:${Number(context.gameweek ?? 0)}:${ordinal}`;
  const assignment = {
    id,
    season:context.season ?? null,
    teamId:context.teamId ?? null,
    region,
    nation:input.nation ? String(input.nation) : null,
    positionGroup,
    role:input.role ? String(input.role) : null,
    style:input.style ? String(input.style) : null,
    createdWeekKey:academyPathwayWeekKey(context.season, context.gameweek),
    lastAdvancedKey:null,
    weeks:0,
    targetWeeks:academyPathwayClamp(Math.round(Number(input.targetWeeks) || 4), 2, 8),
    status:'active',
    report:null,
  };
  return {
    ...state,
    youthScoutingAssignments:[...state.youthScoutingAssignments, assignment].slice(-MAX_YOUTH_SCOUTING_HISTORY),
    youthScoutingOrdinal:ordinal + 1,
  };
}

export function cancelYouthScoutingAssignment(stateInput, assignmentId) {
  const state = normalizeAcademyPathwaysState(stateInput);
  return {
    ...state,
    youthScoutingAssignments:state.youthScoutingAssignments.map(item => item.id === assignmentId && item.status === 'active'
      ? { ...item, status:'cancelled' }
      : item),
  };
}

export function advanceYouthScoutingState(stateInput, context = {}) {
  const state = normalizeAcademyPathwaysState(stateInput);
  const key = academyPathwayWeekKey(context.season, context.gameweek);
  if (!key || state.processedWeekKeys.includes(key)) return { state, completed:[], alreadyProcessed:true };
  const completed = [];
  const assignments = state.youthScoutingAssignments.map(item => {
    if (item.status !== 'active' || String(item.season) !== String(context.season) || item.lastAdvancedKey === key) return item;
    const weeks = Math.max(0, Number(item.weeks ?? 0)) + 1;
    const done = weeks >= Number(item.targetWeeks ?? 4);
    const quality = academyPathwayClamp(
      .35
      + Math.max(0, Number(context.reputation ?? 65) - 55) / 150
      + Math.max(0, Number(context.academyInvestment ?? 0)) / 500
      + Math.max(0, Number(context.scoutingLevel ?? 1) - 1) * .035,
      .35,
      .88,
    );
    const report = done ? {
      region:item.region,
      nation:item.nation,
      positionGroup:item.positionGroup,
      role:item.role,
      style:item.style,
      confidence:academyPathwayRound2(academyPathwayClamp(.52 + weeks * .07, .52, .92)),
      quality:academyPathwayRound2(quality),
      potentialBand:{
        min:Math.round(55 + quality * 18),
        max:Math.round(academyPathwayClamp(72 + quality * 25, 76, 96)),
      },
      completedWeekKey:key,
    } : null;
    const next = { ...item, weeks, lastAdvancedKey:key, status:done ? 'complete' : 'active', report };
    if (done) completed.push(next);
    return next;
  });
  const notification = completed.length ? {
    type:'youth_scouting', weekKey:key, count:completed.length,
    message:`${completed.length} academy scouting assignment${completed.length === 1 ? '' : 's'} completed`,
  } : null;
  return {
    state:{
      ...state,
      youthScoutingAssignments:assignments.slice(-MAX_YOUTH_SCOUTING_HISTORY),
      processedWeekKeys:[...state.processedWeekKeys, key].slice(-60),
      notifications:notification ? [...state.notifications, notification].slice(-MAX_YOUTH_SCOUTING_NOTIFICATIONS) : state.notifications,
    },
    completed,
    alreadyProcessed:false,
  };
}

export function academyEvidenceFor(player, season = null) {
  const evidence = player?.academyEvidence;
  if (!evidence || (season != null && String(evidence.season) !== String(season))) {
    return {
      season:season ?? null,
      appearances:0,
      starts:0,
      minutes:0,
      goals:0,
      assists:0,
      cleanSheets:0,
      ratingTotal:0,
      ratingApps:0,
      averageRating:null,
      lastRating:null,
      lastWeekKey:null,
      lastPlayedWeekKey:null,
    };
  }
  return { ...evidence };
}

/**
 * One deterministic aggregate academy fixture every second world week. This is
 * evidence, not a hidden youth competition: no senior fixture/result/stat row is
 * written and the authoritative senior match engine is never called here.
 */
export function advanceAcademyEvidence(playerInput, context = {}) {
  const player = normalizePlayerStatus(playerInput);
  if (!isAcademyPlayer(player)) return player;
  const key = academyPathwayWeekKey(context.season, context.gameweek);
  if (!key) return player;
  const evidence = academyEvidenceFor(player, context.season);
  if (evidence.lastWeekKey === key) return player;
  const fixtureWeek = Number(context.gameweek) % ACADEMY_FIXTURE_INTERVAL === 0;
  if (!fixtureWeek) return { ...player, academyEvidence:{ ...evidence, lastWeekKey:key } };

  const level = Number(durableLevel(player) ?? 50);
  const potential = Math.max(level, Number(player.potentialRating ?? level));
  const age = Number(player.age ?? 17);
  const coaching = academyPathwayClamp(Number(context.coachingMultiplier ?? 1), .85, 1.15);
  const facility = academyPathwayClamp(Number(context.trainingMultiplier ?? 1), .9, 1.12);
  const plan = player.developmentPlan?.id === 'recovery' ? .82 : 1;
  const selection = academyPathwayClamp(.72 + (19 - age) * .025 + (potential - level) / 120, .68, .96);
  const appeared = academyPathwayUnit(`${player.id}:${key}:academy-selection`) <= selection;
  if (!appeared) return { ...player, academyEvidence:{ ...evidence, lastWeekKey:key } };

  const started = academyPathwayUnit(`${player.id}:${key}:academy-start`) < .72;
  const minutes = started
    ? Math.round(58 + academyPathwayUnit(`${player.id}:${key}:academy-minutes`) * 32)
    : Math.round(18 + academyPathwayUnit(`${player.id}:${key}:academy-bench-minutes`) * 28);
  const variance = (academyPathwayUnit(`${player.id}:${key}:academy-rating`) - .5) * 1.5;
  const baseRating = 6.15 + (level - 55) / 35 + (potential - level) / 70;
  const rating = academyPathwayRound1(academyPathwayClamp(baseRating * coaching * facility * plan + variance, 4.5, 9.3));
  const positionGroup = academyPathwayGroup(player.position);
  const attackBias = positionGroup === 'ATT' ? .18 : positionGroup === 'MID' ? .09 : .035;
  const assistBias = positionGroup === 'MID' ? .16 : positionGroup === 'ATT' ? .10 : .045;
  const scored = academyPathwayUnit(`${player.id}:${key}:academy-goal`) < attackBias * academyPathwayClamp(rating / 7, .7, 1.35);
  const assisted = academyPathwayUnit(`${player.id}:${key}:academy-assist`) < assistBias * academyPathwayClamp(rating / 7, .7, 1.35);
  const cleanSheet = ['GK','DEF'].includes(positionGroup) && academyPathwayUnit(`${player.id}:${key}:academy-clean`) < .34;
  const nextEvidence = {
    ...evidence,
    appearances:evidence.appearances + 1,
    starts:evidence.starts + (started ? 1 : 0),
    minutes:evidence.minutes + minutes,
    goals:evidence.goals + (scored ? 1 : 0),
    assists:evidence.assists + (assisted ? 1 : 0),
    cleanSheets:evidence.cleanSheets + (cleanSheet ? 1 : 0),
    ratingTotal:academyPathwayRound2(evidence.ratingTotal + rating),
    ratingApps:evidence.ratingApps + 1,
    averageRating:academyPathwayRound2((evidence.ratingTotal + rating) / (evidence.ratingApps + 1)),
    lastRating:rating,
    lastWeekKey:key,
    lastPlayedWeekKey:key,
  };
  return { ...player, academyEvidence:nextEvidence };
}

export function academyReadiness(playerInput) {
  const player = normalizePlayerStatus(playerInput);
  const evidence = academyEvidenceFor(player);
  const level = Number(durableLevel(player) ?? 50);
  const potential = potentialEstimate(player, player.potentialKnowledge ?? .35);
  const age = Number(player.age ?? 17);
  const evidenceScore = Math.min(18, evidence.minutes / 90 * .8) + Math.max(-2, Number(evidence.averageRating ?? 6.4) - 6.2) * 4;
  const score = academyPathwayClamp(Math.round(level * .7 + age * .65 + evidenceScore), 30, 100);
  const status = score >= 72 && age >= 17 ? 'first-team ready'
    : score >= 62 ? 'loan pathway'
      : score >= 52 ? 'developing well'
        : 'academy development';
  return {
    score,
    status,
    evidenceAppearances:evidence.appearances,
    evidenceMinutes:evidence.minutes,
    averageRating:evidence.averageRating,
    potential,
  };
}

function academyPathwayDepth(player, team, players) {
  const group = academyPathwayGroup(player.position);
  return (players ?? [])
    .filter(candidate => isSeniorEligiblePlayer(candidate, team?.id) && academyPathwayGroup(candidate.position) === group)
    .sort((a,b) => Number(currentEffectiveLevel(b) ?? 0) - Number(currentEffectiveLevel(a) ?? 0));
}

export function loanDestinationProjection(playerInput, team, players = [], context = {}) {
  const player = normalizePlayerStatus(playerInput);
  if (!player || !team) return null;
  const level = Number(currentEffectiveLevel(player) ?? durableLevel(player) ?? 50);
  const depth = academyPathwayDepth(player, team, players);
  const ahead = depth.filter(candidate => Number(currentEffectiveLevel(candidate) ?? 0) > level + 1).length;
  const expectedMinutes = academyPathwayClamp(Math.round(2350 - ahead * 430 + (level - Number(team.reputation ?? 65)) * 22), 250, 3000);
  const expectedRole = expectedMinutes >= 2250 ? 'important' : expectedMinutes >= 1500 ? 'rotation' : expectedMinutes >= 800 ? 'squad' : 'prospect';
  const tactical = evaluateCareerTacticalFit({ player, team, squad:players });
  const tacticalFit = tactical.tacticalFit;
  const coaching = coachingEffects(team, player).development;
  const facilities = trainingEfficiencyMultiplier(team);
  const affordability = Number(team.budget ?? 0) >= Number(player.wage ?? 0) * 26 ? 1 : .72;
  const levelFit = academyPathwayClamp(1 - Math.abs(Number(team.reputation ?? 65) - level) / 45, .55, 1);
  const pathwayScore = academyPathwayRound1(academyPathwayClamp(
    (expectedMinutes / 3000) * 48
    + academyPathwayClamp(tacticalFit, .72, 1.10) / 1.10 * 12
    + academyPathwayClamp(coaching, .88, 1.12) / 1.12 * 16
    + academyPathwayClamp(facilities, .9, 1.12) / 1.12 * 12
    + affordability * 6
    + levelFit * 6,
    0,
    100,
  ));
  return {
    teamId:team.id,
    expectedMinutes,
    expectedRole,
    tacticalRole:tactical.roleId,
    tacticalFit:academyPathwayRound2(tacticalFit),
    tacticalProfileId:tactical.profileId,
    coaching:academyPathwayRound2(coaching),
    facilities:academyPathwayRound2(facilities),
    affordability:academyPathwayRound2(affordability),
    pathwayScore,
    recommendation:pathwayScore >= 78 ? 'Excellent pathway' : pathwayScore >= 64 ? 'Good pathway' : pathwayScore >= 50 ? 'Viable' : 'Poor fit',
    sourceWeekKey:context.weekKey ?? null,
  };
}

export function loanReportDue(playerInput, context = {}) {
  const player = normalizePlayerStatus(playerInput);
  if (!isLoanPlayer(player) || !player.activeLoanAgreement) return false;
  const currentKey = academyPathwayWeekKey(context.season, context.gameweek);
  if (!currentKey || player.activeLoanAgreement.lastReportWeekKey === currentKey) return false;
  const last = player.activeLoanAgreement.lastReportWeekKey;
  if (!last) {
    const startGw = Number(player.activeLoanAgreement.startGameweek);
    return !Number.isFinite(startGw) || Number(context.gameweek) - startGw >= LOAN_REPORT_INTERVAL;
  }
  const lastGw = Number(String(last).split(':').pop());
  return !Number.isFinite(lastGw) || Number(context.gameweek) - lastGw >= LOAN_REPORT_INTERVAL;
}

export function buildLoanDevelopmentReport(playerInput, context = {}) {
  const player = normalizePlayerStatus(playerInput);
  if (!isLoanPlayer(player) || !player.activeLoanAgreement) return null;
  const agreement = player.activeLoanAgreement;
  const current = academyPathwayStats(player);
  const sinceLast = academyPathwayStatDelta(current, agreement.lastReportStats ?? agreement.baselineStats);
  const sinceStart = academyPathwayStatDelta(current, agreement.baselineStats);
  const expectedMinutesPerFourWeeks = {
    crucial:300, important:250, rotation:175, squad:90, prospect:45,
  }[agreement.expectedRole] ?? 175;
  const delivery = academyPathwayClamp(sinceLast.minutes / Math.max(1, expectedMinutesPerFourWeeks), 0, 1.4);
  const rating = sinceLast.ratingApps > 0 ? academyPathwayRound2(sinceLast.ratingTotal / sinceLast.ratingApps) : null;
  return {
    id:`loan-report:${agreement.id}:${academyPathwayWeekKey(context.season, context.gameweek)}`,
    agreementId:agreement.id,
    playerId:player.id,
    parentTeamId:agreement.parentTeamId,
    loanTeamId:agreement.loanTeamId,
    weekKey:academyPathwayWeekKey(context.season, context.gameweek),
    appearances:sinceLast.appearances,
    starts:sinceLast.starts,
    minutes:sinceLast.minutes,
    goals:sinceLast.goals,
    assists:sinceLast.assists,
    cleanSheets:sinceLast.cleanSheets,
    averageRating:rating,
    seasonLoanAppearances:sinceStart.appearances,
    seasonLoanMinutes:sinceStart.minutes,
    expectedRole:agreement.expectedRole,
    roleDelivery:academyPathwayRound2(delivery),
    roleDeliveryLabel:delivery >= .95 ? 'On track' : delivery >= .6 ? 'Below target' : 'Limited opportunity',
    injured:Boolean(player.injured),
    injuryName:player.injuryName ?? null,
    currentLevel:academyPathwayRound1(Number(currentEffectiveLevel(player) ?? durableLevel(player) ?? 50)),
    developmentProgress:academyPathwayRound2(Number(player.developmentProgress ?? player.growthPoints ?? 0)),
  };
}

export function applyLoanDevelopmentReport(playerInput, report) {
  const player = normalizePlayerStatus(playerInput);
  if (!player?.activeLoanAgreement || !report || report.agreementId !== player.activeLoanAgreement.id) return player;
  const existing = Array.isArray(player.loanReports) ? player.loanReports : [];
  if (existing.some(item => item.id === report.id)) return player;
  return normalizePlayerStatus({
    ...player,
    activeLoanAgreement:{
      ...player.activeLoanAgreement,
      lastReportStats:academyPathwayStats(player),
      lastReportWeekKey:report.weekKey,
    },
    loanReports:[...existing, report].slice(-MAX_LOAN_REPORTS),
  });
}
