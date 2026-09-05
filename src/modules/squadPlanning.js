import { currentEffectiveLevel, playerPositionGroup } from './playerModel.js';
import { aiRecruitmentObservation } from './scouting.js';
import { buildCareerTacticalContext, evaluateCareerTacticalFit } from './careerTacticalFit.js';
import { clubPhilosophyTraitValue } from './clubPhilosophy.js';
import { availableFunds } from './clubFinance.js';

/**
 * Shared P4/P5 squad-needs service.
 *
 * It is pure and authoritative for both user-facing explanations and AI
 * recruitment. P5 extends the horizon and scouting inputs here rather than
 * creating a second planner.
 */

export const SQUAD_PLANNING_VERSION = 2;
export const MANAGED_LISTED_TARGET_PERCENT = 35;
export const MANAGED_UNLISTED_TARGET_PERCENT = 15;

export const SQUAD_GROUP_TARGETS = Object.freeze({ GK:2, DEF:7, MID:7, ATT:4 });
export const SQUAD_XI_TARGETS = Object.freeze({ GK:1, DEF:4, MID:4, ATT:2 });

const GROUP_POSITION_PRIORITY = Object.freeze({
  GK:['GK'], DEF:['CB','RB','LB'], MID:['CDM','CM','CAM','RM','LM'], ATT:['ST','CF','RW','LW'],
});
const squadPlanningClamp = (value, min, max) => Math.max(min, Math.min(max, value));

function squadPlanningSeasonStartYear(season) {
  const parsed = Number.parseInt(String(season ?? '').split('/')[0], 10);
  return Number.isFinite(parsed) ? parsed : 2025;
}
export function squadPlanningGroup(playerOrPosition) {
  const position = typeof playerOrPosition === 'string' ? playerOrPosition : playerOrPosition?.position;
  return playerPositionGroup(position);
}
/** Thin alias kept for callers already using this name — delegates to clubFinance.js's shared selector, the one place spending power is computed. */
export function transferAvailableBudget(team, transferMarket = null, ignoreDealId = null) {
  return availableFunds(team, transferMarket, ignoreDealId);
}
function squadPlanningAverage(values, fallback = 50) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}
function choosePriorityPosition(group, available) {
  const positions = GROUP_POSITION_PRIORITY[group] ?? [group];
  const counts = new Map(positions.map(position => [position, 0]));
  for (const player of available) if (counts.has(player.position)) counts.set(player.position, counts.get(player.position) + 1);
  return [...counts.entries()].sort((a, b) => a[1] - b[1] || positions.indexOf(a[0]) - positions.indexOf(b[0]))[0]?.[0] ?? positions[0];
}
function needReasons({ shortfall, aging, expiring, unavailable, tacticalGap, loanDepartures, futureShortfall, academyReady }) {
  const reasons = [];
  if (shortfall > 0) reasons.push('coverage_shortfall');
  if (aging > 0) reasons.push('age_risk');
  if (expiring > 0) reasons.push('contract_risk');
  if (unavailable > 0) reasons.push('injury_cover');
  if (loanDepartures > 0) reasons.push('loan_return_risk');
  if (tacticalGap) reasons.push('tactical_role_gap');
  if (futureShortfall > shortfall) reasons.push('succession_gap');
  if (academyReady > 0) reasons.push('academy_pathway');
  return reasons;
}
function isSeniorPlanningRow(player) {
  if (!player) return false;
  if (player.inSquad === false || player.isYouth === true || player.playerStatus === 'academy') return false;
  return true;
}
function activeClubSquad(team, players) {
  return (players ?? []).filter(player => player?.teamId === team?.id && isSeniorPlanningRow(player) && (!player?.onLoan || Boolean(player?.loanedFrom)));
}
function loanReturnsFor(team, players) {
  return (players ?? []).filter(player => player?.onLoan && String(player?.loanOriginalTeamId ?? '') === String(team?.id));
}
function academyPlayersFor(team, options, players = []) {
  const canonical = (players ?? []).filter(player =>
    player?.playerStatus === 'academy'
    && String(player?.contractTeamId ?? player?.youthTeamId ?? player?.teamId ?? '') === String(team?.id),
  );
  const legacy = Array.isArray(options.academyPlayers)
    ? options.academyPlayers
    : Array.isArray(team?.youthPlayers) ? team.youthPlayers : [];
  const byId = new Map();
  for (const row of [...canonical, ...legacy].filter(Boolean)) byId.set(String(row.id ?? `${row.name}:${row.position}`), row);
  return [...byId.values()];
}
function futureProjection(group, groupPlayers, loanReturns, academyPlayers, currentYear, target) {
  const result = [];
  for (let horizon = 1; horizon <= 3; horizon++) {
    const retained = groupPlayers.filter(player => {
      if (player.loanedFrom) return false;
      if (Number(player.contractExpiry ?? currentYear + 4) <= currentYear + horizon - 1) return false;
      return Number(player.age ?? 25) + horizon < (group === 'GK' ? 39 : 35);
    });
    const returns = loanReturns.filter(player => squadPlanningGroup(player) === group && Number(player.age ?? 25) + horizon < 34);
    const readyAcademy = academyPlayers.filter(player => {
      if (squadPlanningGroup(player) !== group) return false;
      const age = Number(player.age ?? 18) + horizon;
      const rating = Number(currentEffectiveLevel(player) ?? player.potentialRating ?? 50);
      return age >= 17 && age <= 22 && rating >= 58 + horizon * 2;
    });
    const projectedCount = retained.length + returns.length + readyAcademy.length;
    result.push({ seasons:horizon, projectedCount, target, shortfall:Math.max(0, target - projectedCount), loanReturns:returns.length, academyReady:readyAcademy.length });
  }
  return result;
}

export function buildSquadNeeds(team, players, options = {}) {
  const squad = activeClubSquad(team, players);
  const loanReturns = loanReturnsFor(team, players);
  const academyPlayers = academyPlayersFor(team, options, players);
  const currentYear = Number.isFinite(options.currentYear) ? options.currentYear : squadPlanningSeasonStartYear(options.season);
  const tacticalContext = buildCareerTacticalContext({ team, squad, tacticalProfile:options.tacticalProfile ?? null });
  const tacticalProfile = tacticalContext.profile;
  const squadAverage = squadPlanningAverage(squad.map(player => Number(currentEffectiveLevel(player)) || 50), Number(team?.reputation) || 60);
  const availableBudget = transferAvailableBudget(team, options.transferMarket);
  const needs = [];
  for (const [group, target] of Object.entries(SQUAD_GROUP_TARGETS)) {
    const groupPlayers = squad.filter(player => squadPlanningGroup(player) === group);
    const healthy = groupPlayers.filter(player => !player.injured && Number(player.suspensionGWsLeft ?? 0) <= 0);
    const shortfall = Math.max(0, target - groupPlayers.length);
    const aging = groupPlayers.filter(player => Number(player.age ?? 25) >= (group === 'GK' ? 35 : 31)).length;
    const expiring = groupPlayers.filter(player => Number(player.contractExpiry ?? currentYear + 2) <= currentYear + 1).length;
    const unavailable = Math.max(0, groupPlayers.length - healthy.length);
    const loanDepartures = groupPlayers.filter(player => Boolean(player.loanedFrom)).length;
    const tacticalScores = groupPlayers.map(player => evaluateCareerTacticalFit({
      player, team, squad, tacticalProfile,
    }).tacticalFit);
    const tacticalGap = groupPlayers.length > 0 && squadPlanningAverage(tacticalScores, .8) < .91;
    const future = futureProjection(group, groupPlayers, loanReturns, academyPlayers, currentYear, target);
    const futureShortfall = Math.max(...future.map(row => row.shortfall), 0);
    const academyReady = Math.max(...future.map(row => row.academyReady), 0);
    const reasons = needReasons({ shortfall, aging, expiring, unavailable, tacticalGap, loanDepartures, futureShortfall, academyReady });
    if (!reasons.length) continue;
    const sortedGroup = [...groupPlayers].sort((a,b) => Number(currentEffectiveLevel(b) ?? 0) - Number(currentEffectiveLevel(a) ?? 0));
    const xiTarget = SQUAD_XI_TARGETS[group] ?? 1;
    const xi = sortedGroup.slice(0, xiTarget);
    const rotation = sortedGroup.slice(xiTarget, Math.min(target, xiTarget + Math.max(1, Math.ceil((target - xiTarget) / 2))));
    const depth = sortedGroup.slice(xiTarget + rotation.length);
    const groupAverage = squadPlanningAverage(groupPlayers.map(player => Number(currentEffectiveLevel(player)) || 50), squadAverage);
    const urgency = squadPlanningClamp(shortfall * 34 + aging * 9 + expiring * 12 + unavailable * 8 + loanDepartures * 9 + futureShortfall * 8 + (tacticalGap ? 10 : 0) - academyReady * 4, 1, 100);
    const position = choosePriorityPosition(group, groupPlayers);
    const representative = [...groupPlayers].sort((a, b) => (Number(currentEffectiveLevel(a)) || 0) - (Number(currentEffectiveLevel(b)) || 0))[0];
    const representativeFit = representative ? evaluateCareerTacticalFit({
      player:{ ...representative, position }, team, squad, tacticalProfile,
    }) : null;
    const roleId = representativeFit?.roleId ?? null;
    // Bounded P7 club-philosophy nudge: a star-recruitment, financially bold
    // club commits a little more of its budget share to a given need; a
    // financially cautious one commits a little less. Absent philosophy
    // (pre-P7 team row, or a hand-built test team) this is exactly 1 — no
    // behaviour change for a club that hasn't been through the P7 backfill.
    const recruitmentBias = team?.philosophy
      ? 1 + (clubPhilosophyTraitValue(team.philosophy, 'starRecruitment') - clubPhilosophyTraitValue(team.philosophy, 'financialCaution')) / 400
      : 1;
    const allocation = squadPlanningClamp((.12 + urgency / 210) * recruitmentBias, .15, .55);
    const baseAgeMax = aging || expiring || futureShortfall ? 27 : 30;
    const youthPathway = team?.philosophy ? clubPhilosophyTraitValue(team.philosophy, 'youthPathway') : 50;
    const preferredAgeMax = squadPlanningClamp(baseAgeMax + (youthPathway >= 65 ? -2 : youthPathway <= 35 ? 2 : 0), 22, 33);
    needs.push({
      id:`${team?.id ?? 'club'}:${group}:${position}`, version:SQUAD_PLANNING_VERSION, clubId:team?.id ?? null, group, position, roleId, urgency, reasons,
      coverage:{ current:groupPlayers.length, healthy:healthy.length, target, xi:xi.length, rotation:rotation.length, depth:depth.length }, future,
      targetAbilityBand:{ min:Math.round(squadPlanningClamp(groupAverage - 4, 40, 94)), max:Math.round(squadPlanningClamp(Math.max(groupAverage + 8, squadAverage + 4), 48, 96)) },
      preferredAgeMax, maxBudget:Math.round(availableBudget * allocation), tacticalProfileId:tacticalProfile?.id ?? null, tacticalProfile,
    });
  }
  return needs.sort((a, b) => b.urgency - a.urgency || a.group.localeCompare(b.group) || a.position.localeCompare(b.position));
}

export function assessSquadSafety({ buyerSquad = [], sellerSquad = [], player, exchangePlayer = null } = {}) {
  const buyerActive = buyerSquad.filter(row => isSeniorPlanningRow(row) && (!row?.onLoan || row?.loanedFrom));
  const sellerActive = sellerSquad.filter(row => isSeniorPlanningRow(row) && (!row?.onLoan || row?.loanedFrom));
  if (buyerActive.length + (exchangePlayer ? 0 : 1) > 30) return { ok:false, reason:'buyer_squad_full' };
  if (sellerActive.length - 1 + (exchangePlayer ? 1 : 0) < 16) return { ok:false, reason:'seller_squad_floor' };
  if (squadPlanningGroup(player) === 'GK') {
    const remainingKeepers = sellerActive.filter(row => row.id !== player?.id && squadPlanningGroup(row) === 'GK').length;
    const exchangeIsKeeper = exchangePlayer && squadPlanningGroup(exchangePlayer) === 'GK';
    if (remainingKeepers + (exchangeIsKeeper ? 1 : 0) < 1) return { ok:false, reason:'seller_no_goalkeeper' };
  }
  return { ok:true, reason:null };
}
function candidateExplanation({ positionFit, tacticalFit, ageFit, value, maxBudget, rating, band, observation }) {
  const positives = [];
  if (positionFit >= 1) positives.push('fills_priority_position');
  if (tacticalFit >= 1) positives.push('strong_tactical_fit');
  if (ageFit >= 1) positives.push('fits_age_profile');
  if (rating >= band.min && rating <= band.max) positives.push('fits_ability_band');
  if (value <= maxBudget * .7) positives.push('good_value');
  if (observation && Number(observation.confidence ?? 0) < .55) positives.push('scouting_uncertainty');
  return positives.slice(0, 3);
}
function observedCurrentLevel(player, observation) {
  if (!observation?.current) return Number(currentEffectiveLevel(player)) || 50;
  return (Number(observation.current.min ?? 50) + Number(observation.current.max ?? 50)) / 2;
}
function observedPotentialLevel(player, observation, current) {
  if (observation?.future) return (Number(observation.future.min ?? current) + Number(observation.future.max ?? current)) / 2;
  return Math.max(current, Number(player.potentialRating) || current);
}
function recruitmentObservation(player, buyer, teamsById, observationFor) {
  if (observationFor) return observationFor(player, buyer);
  if (!teamsById?.size) return null;
  return aiRecruitmentObservation(player, buyer, {
    teamsById,
    weekKey:buyer.coachingPaidWeekKey ?? `initial:${buyer.id}`,
  });
}

export function rankRecruitmentCandidates({ need, buyer, players = [], teamsById = new Map(), marketValueFor = player => Number(player?.value) || 0, canSign = () => true, likelihoodFor = () => 50, observationFor = null, limit = 12 } = {}) {
  if (!need || !buyer) return [];
  const tacticalProfile = need.tacticalProfile ?? buildCareerTacticalContext({ team:buyer, squad:players }).profile;
  const maxBudget = Math.min(need.maxBudget, Number(buyer.budget) || need.maxBudget);
  const ranked = [];
  const requiresObservation = Boolean(observationFor || teamsById?.size);
  for (const player of players) {
    if (!player || !isSeniorPlanningRow(player) || player.teamId === buyer.id || player.teamId === 'free_agents' || player.onLoan || player.signedThisSeason) continue;
    if (squadPlanningGroup(player) !== need.group || !canSign(buyer, player)) continue;
    const observation = recruitmentObservation(player, buyer, teamsById, observationFor);
    if (requiresObservation && !observation) continue;
    const value = Math.max(0, Number(marketValueFor(player)) || 0);
    if (value > maxBudget || value <= 0) continue;
    const rating = observedCurrentLevel(player, observation);
    const abilityFloor = need.targetAbilityBand.min - 3;
    const abilityCeiling = need.targetAbilityBand.max + 3;
    if (rating < abilityFloor || rating > abilityCeiling) continue;
    const positionFit = player.position === need.position ? 1.08 : .94;
    const tactical = evaluateCareerTacticalFit({ player, team:buyer, tacticalProfile, roleId:need.roleId });
    const roleId = tactical.roleId;
    const tacticalFit = tactical.tacticalFit;
    const ageFit = Number(player.age ?? 25) <= need.preferredAgeMax ? 1.05 : .86;
    const affordability = squadPlanningClamp(1.15 - value / Math.max(1, maxBudget) * .42, .65, 1.12);
    const likelihood = squadPlanningClamp(Number(likelihoodFor(player, buyer, teamsById.get(player.teamId))) || 0, 0, 100);
    if (likelihood < 35) continue;
    const abilityMidpoint = (need.targetAbilityBand.min + need.targetAbilityBand.max) / 2;
    const bandFit = 1 - Math.min(1, Math.abs(rating - abilityMidpoint) / 24);
    // Band closeness answers "is this the level we targeted?" while quality
    // answers "how much first-team ability are we actually buying?". Keeping
    // both prevents a tactically perfect player at the accepted floor from
    // displacing a materially stronger, better-value solution to the same need.
    const abilityQuality = squadPlanningClamp(
      (rating - abilityFloor) / Math.max(1, need.targetAbilityBand.max - abilityFloor),
      0,
      1,
    );
    const confidence = observation ? squadPlanningClamp(Number(observation.confidence ?? .5), .2, 1) : 1;
    const score = Math.round((positionFit * 32 + tacticalFit * 14 + ageFit * 12 + affordability * 20 + bandFit * 10 + abilityQuality * 12 + likelihood / 100 * 18 - (1 - confidence) * 12) * 10) / 10;
    ranked.push({
      player, score, value, likelihood, roleId, tacticalFit, tacticalProfileId:tactical.profileId, observation,
      reasons:candidateExplanation({ positionFit, tacticalFit, ageFit, value, maxBudget, rating, band:need.targetAbilityBand, observation }),
    });
  }
  return ranked.sort((a, b) => b.score - a.score || b.likelihood - a.likelihood || a.value - b.value || String(a.player.id).localeCompare(String(b.player.id))).slice(0, Math.max(0, limit));
}

export function rankStandoutRecruitmentCandidates({ buyer, buyerSquad = [], players = [], teamsById = new Map(), marketValueFor = player => Number(player?.value) || 0, canSign = () => true, likelihoodFor = () => 50, observationFor = null, limit = 12 } = {}) {
  if (!buyer) return [];
  const squadAverage = squadPlanningAverage(buyerSquad.filter(player => isSeniorPlanningRow(player) && (!player?.onLoan || player?.loanedFrom)).map(player => Number(currentEffectiveLevel(player)) || 50), Number(buyer.reputation) || 60);
  const tacticalProfile = buildCareerTacticalContext({ team:buyer, squad:buyerSquad }).profile;
  const availableBudget = Math.max(0, Number(buyer.budget) || 0);
  const ranked = [];
  const requiresObservation = Boolean(observationFor || teamsById?.size);
  for (const player of players) {
    if (!player || !isSeniorPlanningRow(player) || player.teamId === buyer.id || player.teamId === 'free_agents' || player.onLoan || player.signedThisSeason || !canSign(buyer, player)) continue;
    const observation = recruitmentObservation(player, buyer, teamsById, observationFor);
    if (requiresObservation && !observation) continue;
    const value = Math.max(0, Number(marketValueFor(player)) || 0);
    if (value <= 0 || value > availableBudget * .88) continue;
    const rating = observedCurrentLevel(player, observation);
    const potential = observedPotentialLevel(player, observation, rating);
    const age = Number(player.age ?? 25);
    const currentStandout = rating >= Math.max(68, squadAverage + 2);
    const futureStandout = age <= 24 && potential >= Math.max(76, squadAverage + 6) && potential - rating >= 6;
    if (!currentStandout && !futureStandout) continue;
    const likelihood = squadPlanningClamp(Number(likelihoodFor(player, buyer, teamsById.get(player.teamId))) || 0, 0, 100);
    if (likelihood < 30) continue;
    const affordability = 1 - value / Math.max(1, availableBudget);
    const currentEdge = Math.max(0, rating - squadAverage);
    const potentialEdge = Math.max(0, potential - Math.max(rating, squadAverage));
    const youthBonus = age <= 21 ? 8 : age <= 24 ? 4 : 0;
    const confidence = observation ? squadPlanningClamp(Number(observation.confidence ?? .5), .2, 1) : 1;
    const tactical = evaluateCareerTacticalFit({ player, team:buyer, squad:buyerSquad, tacticalProfile });
    const tacticalNudge = (tactical.tacticalFit - .9) * 12;
    const score = Math.round((currentEdge * 4 + potentialEdge * 3 + (currentStandout ? 18 : 0) + (futureStandout ? 20 : 0) + youthBonus + affordability * 16 + likelihood / 100 * 12 + tacticalNudge - (1 - confidence) * 14) * 10) / 10;
    const reasons = [];
    if (currentStandout) reasons.push('standout_current_ability');
    if (futureStandout) reasons.push('elite_potential');
    if (affordability >= .35) reasons.push('affordable_opportunity');
    if (tactical.tacticalFit >= 1.02) reasons.push('strong_tactical_fit');
    if (observation && confidence < .55) reasons.push('scouting_uncertainty');
    ranked.push({ player, score, value, likelihood, tacticalFit:tactical.tacticalFit, tacticalProfileId:tactical.profileId, observation, reasons });
  }
  return ranked.sort((a, b) => b.score - a.score || b.likelihood - a.likelihood || a.value - b.value || String(a.player.id).localeCompare(String(b.player.id))).slice(0, Math.max(0, limit));
}

export function selectAIRecruitmentTarget({ candidates = [], listedCandidates = [], unlistedCandidates = [], managedRoll = 99, targetIndex = 0 } = {}) {
  const listed = listedCandidates.filter(item => item?.player?.transferListed === true);
  const unlisted = unlistedCandidates.filter(item => item?.player?.transferListed !== true);
  const roll = Math.max(0, Math.min(99, Math.floor(Number(managedRoll) || 0)));
  const choose = rows => rows.length ? rows[Math.abs(Math.floor(Number(targetIndex) || 0)) % rows.length] : null;
  if (listed.length && roll < MANAGED_LISTED_TARGET_PERCENT) return choose(listed);
  const unlistedStart = listed.length ? MANAGED_LISTED_TARGET_PERCENT : 0;
  if (unlisted.length && roll >= unlistedStart && roll < unlistedStart + MANAGED_UNLISTED_TARGET_PERCENT) return choose(unlisted);
  return choose(candidates);
}
