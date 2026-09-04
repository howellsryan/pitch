import { effectiveAttribute, effectiveDetailedAttribute } from './playerModel.js';
import { normalizeTeamInstructions, resolvePlayerRole } from './tactics.js';

/**
 * T2 shadow-only tactical projection.
 *
 * This module deliberately does not participate in authoritative match
 * resolution. It describes the future action-oriented model beside the current
 * P2 aggregate engine so roles/tactics/attributes can be calibrated before T3
 * changes any scoreline, statistic or RNG path.
 */

export const TACTICAL_PROJECTION_VERSION = 1;

export const TACTICAL_ACTION_DEFS = Object.freeze({
  circulation:Object.freeze({
    execution:Object.freeze({ passing:.60, dribbling:.25, physical:.15 }),
    counter:Object.freeze({ defending:.45, physical:.35, pace:.20 }),
    counterActions:Object.freeze(['high_press', 'interception_tackle']),
  }),
  direct_pass:Object.freeze({
    execution:Object.freeze({ passing:.60, pace:.25, physical:.15 }),
    counter:Object.freeze({ defending:.50, pace:.35, physical:.15 }),
    counterActions:Object.freeze(['interception_tackle', 'recovery_defence']),
  }),
  pass_into_space:Object.freeze({
    execution:Object.freeze({ passing:.55, pace:.35, physical:.10 }),
    counter:Object.freeze({ defending:.50, pace:.40, physical:.10 }),
    counterActions:Object.freeze(['recovery_defence', 'interception_tackle']),
  }),
  carry:Object.freeze({
    execution:Object.freeze({ dribbling:.60, pace:.25, physical:.15 }),
    counter:Object.freeze({ defending:.60, physical:.25, pace:.15 }),
    counterActions:Object.freeze(['interception_tackle', 'recovery_defence']),
  }),
  wide_delivery:Object.freeze({
    execution:Object.freeze({ passing:.55, dribbling:.25, pace:.20 }),
    counter:Object.freeze({ defending:.60, pace:.25, physical:.15 }),
    counterActions:Object.freeze(['recovery_defence', 'interception_tackle']),
  }),
  aerial_duel:Object.freeze({
    execution:Object.freeze({ physical:.65, shooting:.30, pace:.05 }),
    counter:Object.freeze({ defending:.55, physical:.45 }),
    counterActions:Object.freeze(['interception_tackle']),
    goalkeepingWeight:.08,
  }),
  shot:Object.freeze({
    execution:Object.freeze({ shooting:.85, physical:.15 }),
    counter:Object.freeze({ defending:.70, physical:.30 }),
    counterActions:Object.freeze(['interception_tackle']),
    goalkeepingWeight:.35,
  }),
  high_press:Object.freeze({
    execution:Object.freeze({ defending:.45, physical:.35, pace:.20 }),
    counter:Object.freeze({ passing:.50, dribbling:.35, physical:.15 }),
    counterActions:Object.freeze(['circulation', 'carry']),
  }),
  interception_tackle:Object.freeze({
    execution:Object.freeze({ defending:.65, pace:.15, physical:.20 }),
    counter:Object.freeze({ dribbling:.45, passing:.35, pace:.20 }),
    counterActions:Object.freeze(['carry', 'circulation']),
  }),
  recovery_defence:Object.freeze({
    execution:Object.freeze({ pace:.45, defending:.40, physical:.15 }),
    counter:Object.freeze({ pace:.50, dribbling:.25, physical:.25 }),
    counterActions:Object.freeze(['pass_into_space', 'carry']),
  }),
  attacking_set_piece:Object.freeze({
    execution:Object.freeze({ passing:.40, physical:.35, shooting:.25 }),
    counter:Object.freeze({ defending:.55, physical:.45 }),
    counterActions:Object.freeze(['interception_tackle']),
    goalkeepingWeight:.10,
  }),
});

export const TACTICAL_ACTION_IDS = Object.freeze(Object.keys(TACTICAL_ACTION_DEFS));

const BASE_ACTION_USAGE = Object.freeze({
  circulation:1.20,
  direct_pass:.85,
  pass_into_space:.75,
  carry:.78,
  wide_delivery:.65,
  aerial_duel:.45,
  shot:1,
  high_press:.58,
  interception_tackle:.78,
  recovery_defence:.68,
  attacking_set_piece:.34,
});

/**
 * Role weights are participation/frequency weights only. They never multiply a
 * player's execution rating, so detailed attributes are not double-counted as
 * both role quality and action quality.
 */
export const ROLE_ACTION_WEIGHTS = Object.freeze({
  goalkeeper:Object.freeze({ circulation:.12, recovery_defence:.20 }),
  sweeper_keeper:Object.freeze({ circulation:.42, direct_pass:.28, recovery_defence:.70 }),
  ball_playing_cb:Object.freeze({ circulation:.75, direct_pass:.65, pass_into_space:.20, interception_tackle:.55, recovery_defence:.48, aerial_duel:.35, attacking_set_piece:.45 }),
  stopper:Object.freeze({ high_press:.58, interception_tackle:.92, recovery_defence:.35, aerial_duel:.52, attacking_set_piece:.62 }),
  cover:Object.freeze({ interception_tackle:.64, recovery_defence:1, circulation:.28, aerial_duel:.48, attacking_set_piece:.55 }),
  full_back:Object.freeze({ circulation:.35, wide_delivery:.46, carry:.28, interception_tackle:.62, recovery_defence:.72, attacking_set_piece:.12 }),
  overlap:Object.freeze({ pass_into_space:.45, carry:.62, wide_delivery:.92, direct_pass:.25, recovery_defence:.42, attacking_set_piece:.18 }),
  inverted_full_back:Object.freeze({ circulation:.72, direct_pass:.48, carry:.32, interception_tackle:.55, recovery_defence:.50 }),
  anchor:Object.freeze({ circulation:.42, interception_tackle:.92, recovery_defence:.82, aerial_duel:.20, attacking_set_piece:.18 }),
  ball_winner:Object.freeze({ circulation:.30, high_press:.92, interception_tackle:1, recovery_defence:.62, attacking_set_piece:.15 }),
  deep_playmaker:Object.freeze({ circulation:1, direct_pass:.92, pass_into_space:.78, carry:.18, interception_tackle:.32, attacking_set_piece:.38 }),
  box_to_box:Object.freeze({ circulation:.68, pass_into_space:.38, carry:.62, high_press:.78, interception_tackle:.62, recovery_defence:.52, shot:.24, attacking_set_piece:.30 }),
  advanced_playmaker:Object.freeze({ circulation:.92, direct_pass:.50, pass_into_space:1, carry:.62, shot:.36, attacking_set_piece:.48 }),
  wide_creator:Object.freeze({ circulation:.48, direct_pass:.42, pass_into_space:.58, carry:.65, wide_delivery:1, shot:.18, attacking_set_piece:.42 }),
  inside_forward:Object.freeze({ pass_into_space:.82, carry:.88, direct_pass:.28, shot:.92, high_press:.28, attacking_set_piece:.34 }),
  winger:Object.freeze({ pass_into_space:.76, carry:1, wide_delivery:.96, direct_pass:.30, shot:.42, high_press:.26, attacking_set_piece:.30 }),
  poacher:Object.freeze({ pass_into_space:1, direct_pass:.18, aerial_duel:.28, shot:1, attacking_set_piece:.42 }),
  target_forward:Object.freeze({ direct_pass:.55, aerial_duel:1, circulation:.24, shot:.82, attacking_set_piece:.92 }),
  false_nine:Object.freeze({ circulation:.86, direct_pass:.48, pass_into_space:.68, carry:.52, shot:.62, attacking_set_piece:.28 }),
  complete_forward:Object.freeze({ circulation:.42, direct_pass:.42, pass_into_space:.78, carry:.58, aerial_duel:.55, shot:.92, attacking_set_piece:.55 }),
});

function projectionClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function projectionRound2(value) {
  return Math.round(value * 100) / 100;
}

function roleActionWeight(roleId, actionId) {
  return Number(ROLE_ACTION_WEIGHTS[roleId]?.[actionId] ?? 0);
}

function resolvedRoleId(player, rolesById) {
  const requested = rolesById?.[player?.id] ?? player?.tacticalRole;
  return resolvePlayerRole(player, requested)?.id ?? null;
}

function weightedDetailedRating(player, weights) {
  let total = 0;
  let weightTotal = 0;
  for (const [attribute, weight] of Object.entries(weights ?? {})) {
    const value = Number(effectiveDetailedAttribute(player, attribute));
    if (!Number.isFinite(value)) continue;
    total += value * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? total / weightTotal : 50;
}

function actionParticipants(players, rolesById, actionId, weights) {
  return (players ?? [])
    .map(player => {
      const roleId = resolvedRoleId(player, rolesById);
      const involvement = roleActionWeight(roleId, actionId);
      if (!(involvement > 0)) return null;
      return {
        playerId:player.id,
        roleId,
        involvement,
        rating:weightedDetailedRating(player, weights),
      };
    })
    .filter(Boolean);
}

function aggregateParticipants(participants) {
  const denominator = participants.reduce((sum, entry) => sum + entry.involvement, 0);
  if (!(denominator > 0)) return { rating:50, contributors:[] };
  const rating = participants.reduce((sum, entry) => sum + entry.rating * entry.involvement, 0) / denominator;
  const contributors = [...participants]
    .sort((left, right) => right.involvement - left.involvement || right.rating - left.rating || String(left.playerId).localeCompare(String(right.playerId)))
    .slice(0, 4)
    .map(entry => ({
      playerId:entry.playerId,
      roleId:entry.roleId,
      involvement:projectionRound2(entry.involvement),
      rating:projectionRound2(entry.rating),
    }));
  return { rating:projectionRound2(rating), contributors };
}

function goalkeeperRating(players) {
  const keepers = (players ?? []).filter(player => player?.position === 'GK');
  if (!keepers.length) return 50;
  return Math.max(...keepers.map(player => Number(effectiveAttribute(player, 'goalkeeping') ?? player?.goalkeeping ?? 50)));
}

function counterParticipants(players, rolesById, actionDef) {
  return (players ?? [])
    .map(player => {
      const roleId = resolvedRoleId(player, rolesById);
      const involvement = Math.max(0, ...actionDef.counterActions.map(actionId => roleActionWeight(roleId, actionId)));
      if (!(involvement > 0)) return null;
      return {
        playerId:player.id,
        roleId,
        involvement,
        rating:weightedDetailedRating(player, actionDef.counter),
      };
    })
    .filter(Boolean);
}

function actionCounterRating(players, rolesById, actionDef) {
  const base = aggregateParticipants(counterParticipants(players, rolesById, actionDef));
  const goalkeeperWeight = Number(actionDef.goalkeepingWeight ?? 0);
  if (!(goalkeeperWeight > 0)) return base;
  const goalkeeper = goalkeeperRating(players);
  return {
    rating:projectionRound2((base.rating + goalkeeper * goalkeeperWeight) / (1 + goalkeeperWeight)),
    contributors:base.contributors,
    goalkeeper:projectionRound2(goalkeeper),
  };
}

function adjustUsage(usage, actionId, delta) {
  usage[actionId] = projectionClamp((usage[actionId] ?? 1) + delta, .15, 2.5);
}

export function tacticalActionUsage(instructionInput = {}) {
  const instructions = normalizeTeamInstructions(instructionInput?.instructions ?? instructionInput);
  const usage = { ...BASE_ACTION_USAGE };

  if (instructions.buildUp === 'patient') {
    adjustUsage(usage, 'circulation', .45);
    adjustUsage(usage, 'direct_pass', -.20);
  } else if (instructions.buildUp === 'direct') {
    adjustUsage(usage, 'circulation', -.25);
    adjustUsage(usage, 'direct_pass', .50);
    adjustUsage(usage, 'pass_into_space', .28);
    adjustUsage(usage, 'aerial_duel', .22);
  }

  if (instructions.tempo === 'slow') {
    adjustUsage(usage, 'circulation', .24);
    adjustUsage(usage, 'pass_into_space', -.15);
    adjustUsage(usage, 'carry', -.10);
    adjustUsage(usage, 'high_press', -.15);
  } else if (instructions.tempo === 'fast') {
    adjustUsage(usage, 'direct_pass', .12);
    adjustUsage(usage, 'pass_into_space', .25);
    adjustUsage(usage, 'carry', .20);
    adjustUsage(usage, 'high_press', .20);
  }

  if (instructions.defensiveLine === 'high') {
    adjustUsage(usage, 'high_press', .15);
    adjustUsage(usage, 'recovery_defence', .25);
  } else if (instructions.defensiveLine === 'low') {
    adjustUsage(usage, 'high_press', -.15);
    adjustUsage(usage, 'recovery_defence', -.10);
  }

  if (instructions.pressing === 'aggressive') {
    adjustUsage(usage, 'high_press', .55);
    adjustUsage(usage, 'interception_tackle', .25);
  } else if (instructions.pressing === 'passive') {
    adjustUsage(usage, 'high_press', -.30);
    adjustUsage(usage, 'interception_tackle', -.10);
  }

  if (instructions.width === 'wide') {
    adjustUsage(usage, 'wide_delivery', .55);
    adjustUsage(usage, 'carry', .20);
    adjustUsage(usage, 'aerial_duel', .15);
  } else if (instructions.width === 'narrow') {
    adjustUsage(usage, 'circulation', .15);
    adjustUsage(usage, 'carry', .20);
    adjustUsage(usage, 'wide_delivery', -.30);
  }

  if (instructions.transition === 'counter') {
    adjustUsage(usage, 'circulation', -.20);
    adjustUsage(usage, 'direct_pass', .30);
    adjustUsage(usage, 'pass_into_space', .50);
    adjustUsage(usage, 'carry', .25);
  } else if (instructions.transition === 'hold_shape') {
    adjustUsage(usage, 'circulation', .15);
    adjustUsage(usage, 'direct_pass', -.10);
  }

  if (instructions.chanceCreation === 'work_ball') {
    adjustUsage(usage, 'circulation', .25);
    adjustUsage(usage, 'carry', .15);
    adjustUsage(usage, 'shot', -.12);
  } else if (instructions.chanceCreation === 'early_delivery') {
    adjustUsage(usage, 'wide_delivery', .50);
    adjustUsage(usage, 'aerial_duel', .35);
  }

  if (instructions.defensiveApproach === 'compact') {
    adjustUsage(usage, 'interception_tackle', .20);
  } else if (instructions.defensiveApproach === 'front_foot') {
    adjustUsage(usage, 'high_press', .25);
    adjustUsage(usage, 'interception_tackle', .15);
    adjustUsage(usage, 'recovery_defence', .10);
  }

  if (instructions.setPieces === 'attack') adjustUsage(usage, 'attacking_set_piece', .50);
  else if (instructions.setPieces === 'secure') adjustUsage(usage, 'attacking_set_piece', -.20);

  return Object.fromEntries(TACTICAL_ACTION_IDS.map(actionId => [actionId, projectionRound2(usage[actionId])]));
}

export function projectLineupTacticalProfile({ players = [], rolesById = {}, instructions = {} } = {}) {
  const normalizedInstructions = normalizeTeamInstructions(instructions?.instructions ?? instructions);
  const usage = tacticalActionUsage(normalizedInstructions);
  const actions = {};
  for (const actionId of TACTICAL_ACTION_IDS) {
    const def = TACTICAL_ACTION_DEFS[actionId];
    const execution = aggregateParticipants(actionParticipants(players, rolesById, actionId, def.execution));
    const counter = actionCounterRating(players, rolesById, def);
    actions[actionId] = {
      usage:usage[actionId],
      execution:execution.rating,
      counter:counter.rating,
      contributors:execution.contributors,
      counterContributors:counter.contributors,
      ...(counter.goalkeeper != null ? { goalkeeper:counter.goalkeeper } : {}),
    };
  }
  return { version:TACTICAL_PROJECTION_VERSION, instructions:normalizedInstructions, actions };
}

export function tacticalContextEdge(actionId, selfInput = {}, opponentInput = {}) {
  const self = normalizeTeamInstructions(selfInput?.instructions ?? selfInput);
  const opponent = normalizeTeamInstructions(opponentInput?.instructions ?? opponentInput);
  let edge = 0;

  if (actionId === 'pass_into_space') {
    if (opponent.defensiveLine === 'high') edge += 6;
    if (opponent.defensiveLine === 'low') edge -= 5;
  }
  if (actionId === 'direct_pass') {
    if (opponent.defensiveLine === 'high') edge += 3;
    if (opponent.pressing === 'aggressive') edge += 2;
  }
  if (actionId === 'carry' && opponent.defensiveApproach === 'compact') edge -= 4;
  if (actionId === 'wide_delivery') {
    if (opponent.width === 'narrow') edge += 5;
    if (opponent.width === 'wide') edge -= 2;
  }
  if (actionId === 'circulation' && opponent.pressing === 'aggressive') edge -= 3;
  if (actionId === 'high_press') {
    if (opponent.buildUp === 'patient') edge += 3;
    if (opponent.buildUp === 'direct') edge -= 2;
  }
  if (actionId === 'recovery_defence' && self.defensiveLine === 'high') edge -= 2;
  if (actionId === 'attacking_set_piece' && opponent.setPieces === 'secure') edge -= 3;

  return edge;
}

function sideMatchupProjection(selfProfile, opponentProfile) {
  const actions = {};
  for (const actionId of TACTICAL_ACTION_IDS) {
    const selfAction = selfProfile.actions[actionId];
    const opponentCounter = opponentProfile.actions[actionId]?.counter ?? 50;
    const context = tacticalContextEdge(actionId, selfProfile.instructions, opponentProfile.instructions);
    const edge = projectionRound2(selfAction.execution - opponentCounter + context);
    actions[actionId] = {
      usage:selfAction.usage,
      execution:selfAction.execution,
      opponentCounter:projectionRound2(opponentCounter),
      contextEdge:context,
      edge,
      weightedEdge:projectionRound2(edge * selfAction.usage),
      contributors:selfAction.contributors,
    };
  }
  const ordered = Object.entries(actions).sort((left, right) => right[1].weightedEdge - left[1].weightedEdge);
  return {
    actions,
    strengths:ordered.filter(([, value]) => value.weightedEdge >= 4).slice(0, 4).map(([actionId, value]) => ({ actionId, ...value })),
    vulnerabilities:[...ordered].reverse().filter(([, value]) => value.weightedEdge <= -4).slice(0, 4).map(([actionId, value]) => ({ actionId, ...value })),
  };
}

export function projectTacticalMatchup(homeInput = {}, awayInput = {}) {
  const home = projectLineupTacticalProfile(homeInput);
  const away = projectLineupTacticalProfile(awayInput);
  return {
    version:TACTICAL_PROJECTION_VERSION,
    home:{ profile:home, ...sideMatchupProjection(home, away) },
    away:{ profile:away, ...sideMatchupProjection(away, home) },
  };
}

/**
 * Diagnostics/test wrapper. The authoritative result is kept by reference and
 * never cloned or decorated, preventing shadow data from becoming live state.
 */
export function attachTacticalShadow(authoritativeResult, homeInput = {}, awayInput = {}) {
  return { authoritativeResult, shadow:projectTacticalMatchup(homeInput, awayInput) };
}