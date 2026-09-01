import { currentEffectiveLevel, playerPositionGroup } from './playerModel.js';
import { chooseAIRole, getAITacticalProfile, roleSuitability } from './tactics.js';

/**
 * P4's deliberately small shared squad-needs service.
 *
 * It is pure and authoritative for both user-facing explanations and AI
 * recruitment. P5 may extend the horizon and scouting inputs, but must not
 * replace this contract with a second planner.
 */

export const SQUAD_PLANNING_VERSION = 1;

// A listed player is deliberately the clearest route to a bid.  Exceptional
// unlisted players still draw attention, but at a lower rate so listing a
// player remains meaningful to the user.
export const MANAGED_LISTED_TARGET_PERCENT = 35;
export const MANAGED_UNLISTED_TARGET_PERCENT = 15;

export const SQUAD_GROUP_TARGETS = Object.freeze({
  GK:2,
  DEF:7,
  MID:7,
  ATT:4,
});

const GROUP_POSITION_PRIORITY = Object.freeze({
  GK:['GK'],
  DEF:['CB','RB','LB'],
  MID:['CDM','CM','CAM','RM','LM'],
  ATT:['ST','CF','RW','LW'],
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

export function transferAvailableBudget(team, transferMarket = null, ignoreDealId = null) {
  const committed = (transferMarket?.reservedCommitments ?? [])
    .filter(item => item?.clubId === team?.id && item?.dealId !== ignoreDealId)
    .reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
  return Math.max(0, (Number(team?.budget) || 0) - committed);
}

function squadPlanningAverage(values, fallback = 50) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}

function choosePriorityPosition(group, available) {
  const positions = GROUP_POSITION_PRIORITY[group] ?? [group];
  const counts = new Map(positions.map(position => [position, 0]));
  for (const player of available) {
    if (counts.has(player.position)) counts.set(player.position, counts.get(player.position) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[1] - b[1] || positions.indexOf(a[0]) - positions.indexOf(b[0]))[0]?.[0] ?? positions[0];
}

function needReasons({ shortfall, aging, expiring, unavailable, tacticalGap }) {
  const reasons = [];
  if (shortfall > 0) reasons.push('coverage_shortfall');
  if (aging > 0) reasons.push('age_risk');
  if (expiring > 0) reasons.push('contract_risk');
  if (unavailable > 0) reasons.push('injury_cover');
  if (tacticalGap) reasons.push('tactical_role_gap');
  return reasons;
}

/**
 * Build ranked current-season needs. Long-range succession/scouting confidence
 * intentionally stays in P5.
 */
export function buildSquadNeeds(team, players, options = {}) {
  const squad = (players ?? []).filter(player => player?.teamId === team?.id && !player?.onLoan);
  const currentYear = Number.isFinite(options.currentYear) ? options.currentYear : squadPlanningSeasonStartYear(options.season);
  const tacticalProfile = options.tacticalProfile ?? getAITacticalProfile(team);
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
    const roleScores = groupPlayers.map(player => {
      const roleId = chooseAIRole(player, tacticalProfile);
      return roleId ? roleSuitability(player, roleId) : .8;
    });
    const tacticalGap = groupPlayers.length > 0 && squadPlanningAverage(roleScores, .8) < .91;
    const reasons = needReasons({ shortfall, aging, expiring, unavailable, tacticalGap });
    if (!reasons.length) continue;

    const groupAverage = squadPlanningAverage(groupPlayers.map(player => Number(currentEffectiveLevel(player)) || 50), squadAverage);
    const urgency = squadPlanningClamp(
      shortfall * 34 + aging * 9 + expiring * 12 + unavailable * 8 + (tacticalGap ? 10 : 0),
      1,
      100,
    );
    const position = choosePriorityPosition(group, groupPlayers);
    const representative = groupPlayers.sort((a, b) => (Number(currentEffectiveLevel(a)) || 0) - (Number(currentEffectiveLevel(b)) || 0))[0];
    const roleId = representative ? chooseAIRole({ ...representative, position }, tacticalProfile) : null;
    const allocation = squadPlanningClamp(.12 + urgency / 210, .15, .55);

    needs.push({
      id:`${team?.id ?? 'club'}:${group}:${position}`,
      clubId:team?.id ?? null,
      group,
      position,
      roleId,
      urgency,
      reasons,
      coverage:{ current:groupPlayers.length, healthy:healthy.length, target },
      targetAbilityBand:{
        min:Math.round(squadPlanningClamp(groupAverage - 4, 40, 94)),
        max:Math.round(squadPlanningClamp(Math.max(groupAverage + 8, squadAverage + 4), 48, 96)),
      },
      preferredAgeMax:aging || expiring ? 27 : 30,
      maxBudget:Math.round(availableBudget * allocation),
      tacticalProfileId:tacticalProfile?.id ?? null,
    });
  }

  return needs.sort((a, b) => b.urgency - a.urgency || a.group.localeCompare(b.group) || a.position.localeCompare(b.position));
}

export function assessSquadSafety({ buyerSquad = [], sellerSquad = [], player, exchangePlayer = null } = {}) {
  const buyerActive = buyerSquad.filter(row => !row?.onLoan || row?.loanedFrom);
  const sellerActive = sellerSquad.filter(row => !row?.onLoan || row?.loanedFrom);
  if (buyerActive.length + (exchangePlayer ? 0 : 1) > 30) return { ok:false, reason:'buyer_squad_full' };
  if (sellerActive.length - 1 + (exchangePlayer ? 1 : 0) < 16) return { ok:false, reason:'seller_squad_floor' };
  if (squadPlanningGroup(player) === 'GK') {
    const remainingKeepers = sellerActive.filter(row => row.id !== player?.id && squadPlanningGroup(row) === 'GK').length;
    const exchangeIsKeeper = exchangePlayer && squadPlanningGroup(exchangePlayer) === 'GK';
    if (remainingKeepers + (exchangeIsKeeper ? 1 : 0) < 1) return { ok:false, reason:'seller_no_goalkeeper' };
  }
  return { ok:true, reason:null };
}

function candidateExplanation({ positionFit, tacticalFit, ageFit, value, maxBudget, rating, band }) {
  const positives = [];
  if (positionFit >= 1) positives.push('fills_priority_position');
  if (tacticalFit >= 1) positives.push('strong_tactical_fit');
  if (ageFit >= 1) positives.push('fits_age_profile');
  if (rating >= band.min && rating <= band.max) positives.push('fits_ability_band');
  if (value <= maxBudget * .7) positives.push('good_value');
  return positives.slice(0, 3);
}

/** Rank candidates from a declared need, never from raw overall alone. */
export function rankRecruitmentCandidates({
  need,
  buyer,
  players = [],
  teamsById = new Map(),
  marketValueFor = player => Number(player?.value) || 0,
  canSign = () => true,
  likelihoodFor = () => 50,
  limit = 12,
} = {}) {
  if (!need || !buyer) return [];
  const profile = getAITacticalProfile(buyer);
  const maxBudget = Math.min(need.maxBudget, Number(buyer.budget) || need.maxBudget);
  const ranked = [];

  for (const player of players) {
    if (!player || player.teamId === buyer.id || player.teamId === 'free_agents' || player.onLoan || player.signedThisSeason) continue;
    const group = squadPlanningGroup(player);
    if (group !== need.group) continue;
    if (!canSign(buyer, player)) continue;
    const value = Math.max(0, Number(marketValueFor(player)) || 0);
    if (value > maxBudget || value <= 0) continue;
    const rating = Number(currentEffectiveLevel(player)) || 50;
    if (rating < need.targetAbilityBand.min - 3 || rating > need.targetAbilityBand.max + 3) continue;

    const positionFit = player.position === need.position ? 1.08 : .94;
    const roleId = need.roleId ?? chooseAIRole(player, profile);
    const tacticalFit = roleSuitability(player, roleId);
    const ageFit = Number(player.age ?? 25) <= need.preferredAgeMax ? 1.05 : .86;
    const affordability = squadPlanningClamp(1.15 - value / Math.max(1, maxBudget) * .42, .65, 1.12);
    const likelihood = squadPlanningClamp(Number(likelihoodFor(player, buyer, teamsById.get(player.teamId))) || 0, 0, 100);
    if (likelihood < 35) continue;
    const abilityFit = 1 - Math.min(1, Math.abs(rating - ((need.targetAbilityBand.min + need.targetAbilityBand.max) / 2)) / 24);
    const score = Math.round((positionFit * 24 + tacticalFit * 26 + ageFit * 12 + affordability * 20 + abilityFit * 14 + likelihood / 100 * 18) * 10) / 10;

    ranked.push({
      player,
      score,
      value,
      likelihood,
      roleId,
      reasons:candidateExplanation({ positionFit, tacticalFit, ageFit, value, maxBudget, rating, band:need.targetAbilityBand }),
    });
  }

  return ranked
    .sort((a, b) => b.score - a.score || b.likelihood - a.likelihood || a.value - b.value || String(a.player.id).localeCompare(String(b.player.id)))
    .slice(0, Math.max(0, limit));
}

/**
 * Find affordable standout players outside a club's immediate squad need.
 *
 * This is intentionally separate from rankRecruitmentCandidates: the normal
 * route must remain need-led, while clubs should also scout a small number of
 * high-current-ability and high-potential opportunities.  That is how an
 * unlisted star can attract interest without turning every ordinary squad
 * player into a transfer target.
 */
export function rankStandoutRecruitmentCandidates({
  buyer,
  buyerSquad = [],
  players = [],
  teamsById = new Map(),
  marketValueFor = player => Number(player?.value) || 0,
  canSign = () => true,
  likelihoodFor = () => 50,
  limit = 12,
} = {}) {
  if (!buyer) return [];
  const squadAverage = squadPlanningAverage(
    buyerSquad.filter(player => !player?.onLoan).map(player => Number(currentEffectiveLevel(player)) || 50),
    Number(buyer.reputation) || 60,
  );
  const availableBudget = Math.max(0, Number(buyer.budget) || 0);
  const ranked = [];

  for (const player of players) {
    if (!player || player.teamId === buyer.id || player.teamId === 'free_agents' || player.onLoan || player.signedThisSeason) continue;
    if (!canSign(buyer, player)) continue;
    const value = Math.max(0, Number(marketValueFor(player)) || 0);
    // Leave enough headroom for the offer premium and existing commitments.
    if (value <= 0 || value > availableBudget * .88) continue;
    const rating = Number(currentEffectiveLevel(player)) || 50;
    const potential = Math.max(rating, Number(player.potentialRating) || rating);
    const age = Number(player.age ?? 25);
    const currentStandout = rating >= Math.max(68, squadAverage + 2);
    const futureStandout = age <= 24
      && potential >= Math.max(76, squadAverage + 6)
      && potential - rating >= 6;
    if (!currentStandout && !futureStandout) continue;

    const likelihood = squadPlanningClamp(Number(likelihoodFor(player, buyer, teamsById.get(player.teamId))) || 0, 0, 100);
    if (likelihood < 30) continue;
    const affordability = 1 - value / Math.max(1, availableBudget);
    const currentEdge = Math.max(0, rating - squadAverage);
    const potentialEdge = Math.max(0, potential - Math.max(rating, squadAverage));
    const youthBonus = age <= 21 ? 8 : age <= 24 ? 4 : 0;
    const score = Math.round((
      currentEdge * 4
      + potentialEdge * 3
      + (currentStandout ? 18 : 0)
      + (futureStandout ? 20 : 0)
      + youthBonus
      + affordability * 16
      + likelihood / 100 * 12
    ) * 10) / 10;
    const reasons = [];
    if (currentStandout) reasons.push('standout_current_ability');
    if (futureStandout) reasons.push('elite_potential');
    if (affordability >= .35) reasons.push('affordable_opportunity');
    ranked.push({ player, score, value, likelihood, reasons });
  }

  return ranked
    .sort((a, b) => b.score - a.score || b.likelihood - a.likelihood || a.value - b.value || String(a.player.id).localeCompare(String(b.player.id)))
    .slice(0, Math.max(0, limit));
}

/**
 * Choose one AI recruitment target while giving the managed club an explicit,
 * bounded route into the market. Listed players are targeted much more often;
 * eligible unlisted players remain possible without flooding the user with bids.
 */
export function selectAIRecruitmentTarget({
  candidates = [],
  listedCandidates = [],
  unlistedCandidates = [],
  managedRoll = 99,
  targetIndex = 0,
} = {}) {
  const listed = listedCandidates.filter(item => item?.player?.transferListed === true);
  const unlisted = unlistedCandidates.filter(item => item?.player?.transferListed !== true);
  const roll = Math.max(0, Math.min(99, Math.floor(Number(managedRoll) || 0)));
  const choose = rows => rows.length ? rows[Math.abs(Math.floor(Number(targetIndex) || 0)) % rows.length] : null;

  if (listed.length && roll < MANAGED_LISTED_TARGET_PERCENT) return choose(listed);
  const unlistedStart = listed.length ? MANAGED_LISTED_TARGET_PERCENT : 0;
  if (unlisted.length && roll >= unlistedStart && roll < unlistedStart + MANAGED_UNLISTED_TARGET_PERCENT) {
    return choose(unlisted);
  }
  return choose(candidates);
}
