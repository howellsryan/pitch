import {
  effectiveAttribute,
  effectiveDetailedAttribute,
  positionSuitabilityFor,
} from './playerModel.js';
import { MATCH_ACTION_VOCABULARY_VERSION } from './matchActionVocabulary.js';
import {
  ROLE_ACTION_WEIGHTS,
  TACTICAL_ACTION_DEFS,
  tacticalActionUsage,
  tacticalContextEdge,
} from './tacticalProjection.js';
import { normalizeTeamInstructions, resolvePlayerRole, stableStringHash } from './tactics.js';

/**
 * T3/T4 pure action resolver.
 *
 * matchEngine.js remains the authoritative orchestrator. This module receives
 * one already-allocated RNG packet and returns a compact football action record
 * plus an optional legacy goal event. It owns no DB/UI state and never draws
 * randomness itself, which keeps whole-match and segmented simulation aligned.
 */

export const MATCH_ACTION_RESOLVER_VERSION = 2;
export const MATCH_ACTION_LEDGER_VERSION = 1;
export const MATCH_RNG_PACKET_VERSION = 1;

export const MATCH_RNG_PACKET_FIELDS = Object.freeze([
  'possession',
  'route',
  'actor',
  'target',
  'defender',
  'execution',
  'outcome',
  'chance',
  'shooter',
  'shot',
  'finish',
  'assist',
  'discipline',
  'injury',
]);

const AUTHORITATIVE_ROUTES = Object.freeze([
  'circulation',
  'direct_pass',
  'pass_into_space',
  'carry',
  'wide_delivery',
]);

const ROUTE_CHANCE_BASE = Object.freeze({
  circulation:.11,
  direct_pass:.18,
  pass_into_space:.28,
  carry:.20,
  wide_delivery:.23,
});

const ROUTE_XG_BASE = Object.freeze({
  circulation:.10,
  direct_pass:.14,
  pass_into_space:.24,
  carry:.17,
  wide_delivery:.14,
});

const MENTALITY_ROUTE_MULTIPLIERS = Object.freeze({
  defensive:Object.freeze({ circulation:1.24, direct_pass:.86, pass_into_space:.72, carry:.82, wide_delivery:.86 }),
  possession:Object.freeze({ circulation:1.30, direct_pass:.74, pass_into_space:.78, carry:1.04, wide_delivery:.88 }),
  attacking:Object.freeze({ circulation:.78, direct_pass:1.16, pass_into_space:1.30, carry:1.16, wide_delivery:1.14 }),
  balanced:Object.freeze({}),
});

const RISK_ROUTE_MULTIPLIERS = Object.freeze({
  chase:Object.freeze({ circulation:.72, direct_pass:1.20, pass_into_space:1.34, carry:1.16, wide_delivery:1.12 }),
  protect:Object.freeze({ circulation:1.30, direct_pass:.82, pass_into_space:.72, carry:.86, wide_delivery:.86 }),
  normal:Object.freeze({}),
});

const PASS_ROUTES = new Set(['circulation', 'direct_pass', 'pass_into_space', 'wide_delivery']);
const ACTION_TACTIC_CACHE = new WeakMap();
const ACTION_CONTEXT_EDGE_CACHE = new WeakMap();

function actionClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function actionRound(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function actionPlayerSlot(player) {
  return player?.matchPosition ?? player?.position;
}

function actionIsOutfield(player) {
  return actionPlayerSlot(player) !== 'GK';
}

function actionRoleIdFor(player, rolesById = {}) {
  const assigned = rolesById?.[player?.id];
  if (assigned != null && ROLE_ACTION_WEIGHTS[assigned]) return assigned;
  return resolvePlayerRole(player, player?.tacticalRole)?.id ?? null;
}

function actionRoleWeight(player, rolesById, actionId) {
  const roleId = actionRoleIdFor(player, rolesById);
  return Number(ROLE_ACTION_WEIGHTS[roleId]?.[actionId] ?? 0);
}

function actionWeightedPick(items, roll, weightFor) {
  if (!items?.length) return null;
  const weights = items.map(item => Math.max(0, Number(weightFor(item) ?? 0)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return items[Math.min(items.length - 1, Math.floor(actionClamp(roll, 0, .999999) * items.length))];
  let cursor = actionClamp(roll, 0, .999999) * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return items[index];
  }
  return items[items.length - 1];
}

function actionDetailed(player, attribute) {
  const value = Number(effectiveDetailedAttribute(player, attribute));
  return Number.isFinite(value) ? value : 50;
}

function actionFamiliarityMultiplier(player) {
  const suitability = Number(positionSuitabilityFor(player, actionPlayerSlot(player)));
  return actionClamp(.84 + actionClamp(Number.isFinite(suitability) ? suitability : 1, 0, 1) * .16, .84, 1);
}

function actionWeightedDetailed(player, weights = {}) {
  if (!player) return 50;
  let sum = 0;
  let total = 0;
  for (const [attribute, weight] of Object.entries(weights)) {
    const numericWeight = Number(weight);
    if (!(numericWeight > 0)) continue;
    sum += actionDetailed(player, attribute) * numericWeight;
    total += numericWeight;
  }
  const base = total > 0 ? sum / total : 50;
  return actionClamp(base * actionFamiliarityMultiplier(player), 1, 99);
}

function actionSplitPassExecution(route, actor, target) {
  if (route === 'pass_into_space') {
    return actionClamp(
      (actionDetailed(actor, 'passing') * .55
        + actionDetailed(target, 'pace') * .35
        + actionDetailed(target, 'physical') * .10)
      * Math.min(actionFamiliarityMultiplier(actor), actionFamiliarityMultiplier(target)),
      1,
      99,
    );
  }
  if (route === 'direct_pass') {
    return actionClamp(
      (actionDetailed(actor, 'passing') * .60
        + actionDetailed(target, 'pace') * .25
        + actionDetailed(target, 'physical') * .15)
      * Math.min(actionFamiliarityMultiplier(actor), actionFamiliarityMultiplier(target)),
      1,
      99,
    );
  }
  return actionWeightedDetailed(actor, TACTICAL_ACTION_DEFS[route]?.execution);
}

function actionRouteParticipantWeight(player, rolesById, route) {
  const direct = actionRoleWeight(player, rolesById, route);
  if (direct > 0) return direct;
  if (route === 'circulation') return actionIsOutfield(player) ? .08 : 0;
  return 0;
}

function actionRouteAvailability(players, rolesById, route) {
  const outfield = (players ?? []).filter(actionIsOutfield);
  if (!outfield.length) return .1;
  const total = outfield.reduce((sum, player) => sum + actionRouteParticipantWeight(player, rolesById, route), 0);
  return actionClamp(total / outfield.length, .10, 1.15);
}

function actionRouteIntentMultiplier(route, mentality, riskMode) {
  const mentalityMultiplier = Number(MENTALITY_ROUTE_MULTIPLIERS[mentality]?.[route] ?? 1);
  const riskMultiplier = Number(RISK_ROUTE_MULTIPLIERS[riskMode]?.[route] ?? 1);
  return mentalityMultiplier * riskMultiplier;
}

function actionTacticContext(input = {}) {
  if (input && typeof input === 'object') {
    const cached = ACTION_TACTIC_CACHE.get(input);
    if (cached) return cached;
    const normalized = normalizeTeamInstructions(input);
    const context = { normalized, usage:tacticalActionUsage(normalized) };
    ACTION_TACTIC_CACHE.set(input, context);
    ACTION_TACTIC_CACHE.set(normalized, context);
    return context;
  }
  const normalized = normalizeTeamInstructions(input);
  return { normalized, usage:tacticalActionUsage(normalized) };
}

function actionCachedContextEdge(route, selfInstructions, opponentInstructions) {
  if (selfInstructions && opponentInstructions
    && typeof selfInstructions === 'object' && typeof opponentInstructions === 'object') {
    let byOpponent = ACTION_CONTEXT_EDGE_CACHE.get(selfInstructions);
    if (!byOpponent) {
      byOpponent = new WeakMap();
      ACTION_CONTEXT_EDGE_CACHE.set(selfInstructions, byOpponent);
    }
    let byRoute = byOpponent.get(opponentInstructions);
    if (!byRoute) {
      byRoute = new Map();
      byOpponent.set(opponentInstructions, byRoute);
    }
    if (!byRoute.has(route)) byRoute.set(route, tacticalContextEdge(route, selfInstructions, opponentInstructions));
    return byRoute.get(route);
  }
  return tacticalContextEdge(route, selfInstructions, opponentInstructions);
}

export function fixedPhaseRngPacket(nextRandom) {
  const packet = { version:MATCH_RNG_PACKET_VERSION };
  for (const field of MATCH_RNG_PACKET_FIELDS) packet[field] = Number(nextRandom());
  return packet;
}

export function packetDerivedSeed(packetValue, salt = '') {
  const quantized = Math.floor(actionClamp(Number(packetValue) || 0, 0, .999999999) * 1_000_000_000);
  return stableStringHash(`${MATCH_RNG_PACKET_VERSION}:${quantized}:${salt}`) || 1;
}

export function actionContestProbability(edge) {
  const sigmoid = 1 / (1 + Math.exp(-Number(edge) / 10));
  return actionClamp(.18 + sigmoid * .67, .18, .85);
}

function actionChooseRoute(players, rolesById, usage, packet, mentality, riskMode) {
  const routes = AUTHORITATIVE_ROUTES.map(route => ({
    route,
    weight:usage[route]
      * (.55 + actionRouteAvailability(players, rolesById, route))
      * actionRouteIntentMultiplier(route, mentality, riskMode),
  })).filter(entry => entry.weight > 0);
  return actionWeightedPick(routes, packet.route, entry => entry.weight)?.route ?? 'circulation';
}

function actionChooseActor(players, rolesById, route, roll) {
  const candidates = (players ?? []).filter(player => actionRouteParticipantWeight(player, rolesById, route) > 0);
  const fallback = candidates.length ? candidates : (players ?? []).filter(actionIsOutfield);
  return actionWeightedPick(fallback, roll, player => actionRouteParticipantWeight(player, rolesById, route) || 1);
}

function actionChooseTarget(players, rolesById, route, actorId, roll) {
  const candidates = (players ?? []).filter(player => player.id !== actorId && actionIsOutfield(player));
  if (!candidates.length) return null;
  const targetAction = route === 'direct_pass' ? 'aerial_duel' : route;
  return actionWeightedPick(candidates, roll, player => {
    const actionWeight = actionRoleWeight(player, rolesById, targetAction);
    const shotWeight = actionRoleWeight(player, rolesById, 'shot');
    return actionWeight * .72 + shotWeight * .28 + .02;
  });
}

function actionCounterInvolvement(player, rolesById, actionDef) {
  const actions = actionDef?.counterActions ?? [];
  return Math.max(0, ...actions.map(actionId => actionRoleWeight(player, rolesById, actionId)));
}

function actionChooseDefender(players, rolesById, actionDef, roll) {
  const outfield = (players ?? []).filter(actionIsOutfield);
  return actionWeightedPick(outfield, roll, player => actionCounterInvolvement(player, rolesById, actionDef) + .03);
}

function actionRouteExecution(route, actor, target) {
  if (route === 'direct_pass' || route === 'pass_into_space') return actionSplitPassExecution(route, actor, target);
  return actionWeightedDetailed(actor, TACTICAL_ACTION_DEFS[route]?.execution);
}

function actionRouteCounter(route, defender) {
  return actionWeightedDetailed(defender, TACTICAL_ACTION_DEFS[route]?.counter);
}

export function tacticalChanceAdjustments(instructions, mentality = 'balanced', riskMode = 'normal') {
  const normalized = actionTacticContext(instructions).normalized;
  let frequency = 1;
  let xg = 0;
  if (normalized.shotSelection === 'work_into_box') { frequency *= .82; xg += .045; }
  if (normalized.shotSelection === 'shoot_on_sight') { frequency *= 1.14; xg -= .025; }
  if (normalized.deliveryTiming === 'early') { frequency *= 1.08; xg -= .018; }
  if (mentality === 'attacking') frequency *= 1.10;
  if (mentality === 'defensive') frequency *= .86;
  if (mentality === 'possession') frequency *= .94;
  if (riskMode === 'chase') frequency *= 1.10;
  if (riskMode === 'protect') frequency *= .88;
  return { frequency, xg };
}

function actionChanceQuality(route, edge, instructions, packet, mentality, riskMode) {
  const adjustment = tacticalChanceAdjustments(instructions, mentality, riskMode);
  const jitter = (actionClamp(packet.chance, 0, 1) - .5) * .06;
  const xg = actionClamp((ROUTE_XG_BASE[route] ?? .12) + edge * .0022 + adjustment.xg + jitter, .035, .48);
  return actionRound(xg, 3);
}

function actionChanceBucket(xg) {
  if (xg >= .28) return 'high_quality_chance';
  if (xg >= .14) return 'medium_quality_chance';
  return 'low_quality_chance';
}

function actionChooseShooter(players, rolesById, roll) {
  const outfield = (players ?? []).filter(actionIsOutfield);
  return actionWeightedPick(outfield, roll, player => actionRoleWeight(player, rolesById, 'shot') + .03);
}

function actionGoalkeeper(players) {
  return (players ?? []).find(player => actionPlayerSlot(player) === 'GK') ?? null;
}

export function resolveShotOutcome({ shooter, defender, defenders = [], xg, packet }) {
  const shotDef = TACTICAL_ACTION_DEFS.shot;
  const shooting = actionWeightedDetailed(shooter, shotDef.execution);
  const pressure = actionWeightedDetailed(defender, shotDef.counter);
  const keeper = actionGoalkeeper(defenders);
  const keeping = Number(effectiveAttribute(keeper, 'goalkeeping') ?? keeper?.goalkeeping ?? 50);

  const blockChance = actionClamp(.08 + (pressure - 70) * .0035 - xg * .08, .035, .27);
  const onTargetChance = actionClamp(.28 + xg * .72 + (shooting - 70) * .006 - (pressure - 70) * .0025, .18, .80);
  const shotRoll = actionClamp(packet.shot, 0, .999999);

  if (shotRoll < blockChance) {
    return { finish:'blocked', onTarget:false, goal:false, shooting:actionRound(shooting), pressure:actionRound(pressure), goalkeeping:actionRound(keeping) };
  }
  const adjustedShotRoll = (shotRoll - blockChance) / Math.max(.000001, 1 - blockChance);
  if (adjustedShotRoll >= onTargetChance) {
    return { finish:'missed', onTarget:false, goal:false, shooting:actionRound(shooting), pressure:actionRound(pressure), goalkeeping:actionRound(keeping) };
  }

  const shootingModifier = actionClamp(1 + (shooting - 75) * .012, .72, 1.32);
  const keeperModifier = actionClamp(1 - (keeping - 75) * .010, .62, 1.38);
  // xG represents the chance before the shot is resolved. Once the attempt is
  // on target, Shooting and goalkeeping should move the conversion probability
  // monotonically. The 2.65 calibration keeps equal-team scoring inside T3's
  // football-like envelope while preserving the same shot volume and xG model.
  const goalGivenTarget = actionClamp(xg * 2.65 * shootingModifier * keeperModifier, .06, .74);
  const goal = actionClamp(packet.finish, 0, .999999) < goalGivenTarget;
  return {
    finish:goal ? 'goal' : 'saved',
    onTarget:true,
    goal,
    shooting:actionRound(shooting),
    pressure:actionRound(pressure),
    goalkeeping:actionRound(keeping),
    goalChance:actionRound(goalGivenTarget),
  };
}

function actionFailureOutcome(route, packet) {
  if (packet.outcome < .16) return 'foul_won';
  if (route === 'wide_delivery' && packet.outcome < .42) return 'corner_won';
  if (route === 'pass_into_space' || route === 'direct_pass') return 'intercepted';
  return 'turnover';
}

function actionSuccessOutcome(route) {
  return route === 'circulation' ? 'retain' : 'progress';
}

export function resolveAuthoritativePhase({
  phase,
  minute,
  teamId,
  opponentTeamId,
  attackers = [],
  defenders = [],
  rolesById = {},
  opponentRolesById = {},
  instructions = {},
  opponentInstructions = {},
  mentality = 'balanced',
  riskMode = 'normal',
  packet,
  isHome = false,
} = {}) {
  if (!packet || packet.version !== MATCH_RNG_PACKET_VERSION) throw new Error('Action resolution requires a versioned fixed RNG packet');

  const selfTactics = actionTacticContext(instructions);
  const opponentTactics = actionTacticContext(opponentInstructions);
  const normalized = selfTactics.normalized;
  const opponentNormalized = opponentTactics.normalized;
  const route = actionChooseRoute(attackers, rolesById, selfTactics.usage, packet, mentality, riskMode);
  const actionDef = TACTICAL_ACTION_DEFS[route];
  const actor = actionChooseActor(attackers, rolesById, route, packet.actor);
  const target = actionChooseTarget(attackers, rolesById, route, actor?.id, packet.target);
  const defender = actionChooseDefender(defenders, opponentRolesById, actionDef, packet.defender);
  const execution = actionRouteExecution(route, actor, target);
  const counter = actionRouteCounter(route, defender);
  const context = actionCachedContextEdge(route, normalized, opponentNormalized) + (isHome ? 2.0 : 0);
  const edge = execution - counter + context;
  const successChance = actionContestProbability(edge);
  const success = packet.execution < successChance;

  let outcome = success ? actionSuccessOutcome(route) : actionFailureOutcome(route, packet);
  let xg = null;
  let chance = null;
  let shooter = null;
  let assistId = null;
  let shot = null;

  if (success) {
    const chanceAdjustments = tacticalChanceAdjustments(normalized, mentality, riskMode);
    const chanceProbability = actionClamp((ROUTE_CHANCE_BASE[route] ?? .14) * chanceAdjustments.frequency * (1 + edge * .015), .025, .48);
    if (packet.chance < chanceProbability) {
      xg = actionChanceQuality(route, edge, normalized, packet, mentality, riskMode);
      chance = actionChanceBucket(xg);
      outcome = 'chance_created';
      shooter = actionChooseShooter(attackers, rolesById, packet.shooter) ?? actor;
      const pressureDefender = actionChooseDefender(defenders, opponentRolesById, TACTICAL_ACTION_DEFS.shot, packet.defender);
      shot = resolveShotOutcome({ shooter, defender:pressureDefender, defenders, xg, packet });
      if (PASS_ROUTES.has(route) && actor?.id !== shooter?.id && packet.assist < .86) assistId = actor?.id ?? null;
    }
  }

  const cornerWon = outcome === 'corner_won' || (shot?.finish === 'blocked' && packet.outcome < .45);
  const record = {
    version:MATCH_ACTION_LEDGER_VERSION,
    vocabularyVersion:MATCH_ACTION_VOCABULARY_VERSION,
    phase,
    minute,
    teamId,
    opponentTeamId,
    route,
    actorId:actor?.id ?? null,
    targetId:target?.id ?? null,
    defenderId:defender?.id ?? null,
    execution:actionRound(execution),
    counter:actionRound(counter),
    contextEdge:actionRound(context),
    successChance:actionRound(successChance),
    mentality,
    riskMode,
    outcome,
    ...(chance ? { chance } : {}),
    ...(xg != null ? { xg } : {}),
    ...(shooter ? { shotId:shooter.id } : {}),
    ...(assistId ? { assistId } : {}),
    ...(shot ? { finish:shot.finish, onTarget:shot.onTarget } : {}),
    ...(cornerWon ? { cornerWon:true } : {}),
  };

  const goalEvent = shot?.goal && shooter ? {
    type:'goal',
    minute,
    teamId,
    playerId:shooter.id,
    playerName:shooter.name,
    assistId,
    assistName:assistId ? attackers.find(player => player.id === assistId)?.name ?? null : null,
    route,
    xg,
  } : null;

  return { record, goalEvent, shot };
}

export function deriveStatsFromActionLedger({ ledger = [], homeTeamId, awayTeamId, events = [] } = {}) {
  const phases = ledger.length;
  const homePhases = ledger.filter(record => record.teamId === homeTeamId).length;
  const homePoss = phases ? Math.round((homePhases / phases) * 100) : 50;

  function actionSideStats(teamId) {
    const actions = ledger.filter(record => record.teamId === teamId);
    const shots = actions.filter(record => record.shotId != null);
    return {
      shots:shots.length,
      shotsOnTarget:shots.filter(record => record.onTarget).length,
      xG:actionRound(shots.reduce((sum, record) => sum + Number(record.xg ?? 0), 0), 2),
      corners:actions.filter(record => record.cornerWon).length,
      foulsWon:actions.filter(record => record.outcome === 'foul_won').length,
    };
  }

  const home = actionSideStats(homeTeamId);
  const away = actionSideStats(awayTeamId);
  const yellowHome = events.filter(event => event.type === 'yellow' && event.teamId === homeTeamId).length;
  const yellowAway = events.filter(event => event.type === 'yellow' && event.teamId === awayTeamId).length;
  const subsHome = events.filter(event => event.type === 'sub' && event.teamId === homeTeamId).length;
  const subsAway = events.filter(event => event.type === 'sub' && event.teamId === awayTeamId).length;

  return {
    possession:{ home:homePoss, away:100-homePoss },
    shots:{ home:home.shots, away:away.shots },
    shotsOnTarget:{ home:home.shotsOnTarget, away:away.shotsOnTarget },
    xG:{ home:home.xG, away:away.xG },
    yellowCards:{ home:yellowHome, away:yellowAway },
    substitutions:{ home:subsHome, away:subsAway },
    corners:{ home:home.corners, away:away.corners },
    fouls:{ home:away.foulsWon + yellowHome, away:home.foulsWon + yellowAway },
  };
}
