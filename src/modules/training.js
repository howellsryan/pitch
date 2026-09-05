/*
 * modules/training.js — pure P5 weekly development-plan contract.
 *
 * Plans shape evidence-based P3 development at the existing weekly boundary.
 * A missing plan means the safe automatic Balanced default; rehabilitation can
 * override intensity without requiring weekly manager administration.
 */

import { chooseAIRole } from './tactics.js';
import { ROLE_ACTION_WEIGHTS, TACTICAL_ACTION_DEFS, tacticalActionUsage } from './tacticalProjection.js';

export const TRAINING_PLAN_VERSION = 1;

export const DEVELOPMENT_PLAN_DEFS = Object.freeze({
  balanced:{ id:'balanced', label:'Balanced', description:'Safe automatic development across the player profile.', intensity:1, progressMultiplier:1 },
  finishing:{ id:'finishing', label:'Finishing', description:'Bias future growth towards attacking output.', intensity:1.08, progressMultiplier:1.02, focusAttribute:'attack' },
  creation:{ id:'creation', label:'Creation', description:'Bias future growth towards midfield and chance creation.', intensity:1.06, progressMultiplier:1.02, focusAttribute:'midfield' },
  defending:{ id:'defending', label:'Defending', description:'Bias future growth towards defensive quality.', intensity:1.06, progressMultiplier:1.02, focusAttribute:'defence' },
  physical:{ id:'physical', label:'Physical', description:'Higher workload for broad development, with a small readiness trade-off.', intensity:1.12, progressMultiplier:1.05 },
  role:{ id:'role', label:'Role training', description:'Develop around the player’s current positional responsibilities.', intensity:1.05, progressMultiplier:1.03, roleFocused:true },
  position_conversion:{ id:'position_conversion', label:'Position conversion', description:'Prioritise an active position-conversion pathway.', intensity:1.04, progressMultiplier:.96, conversionFocused:true },
  sharpness:{ id:'sharpness', label:'Sharpness', description:'Prioritise match readiness over long-term growth.', intensity:.92, progressMultiplier:.88, sharpnessBonus:4 },
  recovery:{ id:'recovery', label:'Recovery', description:'Reduce development load while rebuilding fitness and rehabilitation readiness.', intensity:.72, progressMultiplier:.72, recoveryMultiplier:1.08 },
});

const DEVELOPMENT_PLAN_IDS = Object.keys(DEVELOPMENT_PLAN_DEFS);
const TACTICAL_TRAINING_PLAN_BY_ATTRIBUTE = Object.freeze({
  shooting:'finishing',
  passing:'creation',
  dribbling:'creation',
  defending:'defending',
  pace:'physical',
  physical:'physical',
});

function trainingClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export function normalizeDevelopmentPlan(plan, player = null) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
  const id = DEVELOPMENT_PLAN_IDS.includes(plan.id) ? plan.id : null;
  if (!id) return null;
  const targetPosition = id === 'position_conversion'
    ? (plan.targetPosition ?? player?.positionConversion?.targetPosition ?? null)
    : null;
  return {
    version:TRAINING_PLAN_VERSION,
    id,
    source:plan.source === 'automatic' ? 'automatic' : 'manager',
    assignedTeamId:plan.assignedTeamId ?? player?.teamId ?? null,
    targetPosition,
    assignedWeekKey:typeof plan.assignedWeekKey === 'string' ? plan.assignedWeekKey : null,
    reviewRequired:Boolean(plan.reviewRequired),
  };
}

export function createDevelopmentPlan(id, player, options = {}) {
  if (!DEVELOPMENT_PLAN_IDS.includes(id)) return null;
  return normalizeDevelopmentPlan({
    id,
    source:options.source ?? 'manager',
    assignedTeamId:options.teamId ?? player?.teamId ?? null,
    targetPosition:options.targetPosition ?? player?.positionConversion?.targetPosition ?? null,
    assignedWeekKey:options.weekKey ?? null,
    reviewRequired:false,
  }, player);
}

export function developmentPlanDefinition(planOrId) {
  const id = typeof planOrId === 'string' ? planOrId : planOrId?.id;
  return DEVELOPMENT_PLAN_DEFS[id] ?? DEVELOPMENT_PLAN_DEFS.balanced;
}

/**
 * The weekly effective plan. Injured/rehabilitating players automatically use
 * Recovery. A transferred player whose club-specific plan needs review falls
 * back to Balanced until the receiving club explicitly chooses again.
 */
export function effectiveDevelopmentPlan(player) {
  if (!player) return { id:'balanced', source:'automatic', definition:DEVELOPMENT_PLAN_DEFS.balanced, overridden:false };
  const rehabilitation = player.rehabilitation;
  const recovering = Boolean(player.injured)
    || (rehabilitation && rehabilitation.status !== 'match_fit');
  if (recovering) {
    return { id:'recovery', source:'automatic', definition:DEVELOPMENT_PLAN_DEFS.recovery, overridden:true };
  }
  const explicit = normalizeDevelopmentPlan(player.developmentPlan, player);
  if (!explicit || explicit.reviewRequired || (explicit.assignedTeamId && explicit.assignedTeamId !== player.teamId)) {
    return { id:'balanced', source:'automatic', definition:DEVELOPMENT_PLAN_DEFS.balanced, overridden:Boolean(explicit) };
  }
  return { ...explicit, definition:developmentPlanDefinition(explicit), overridden:false };
}

export function developmentPlanProgressMultiplier(player, coachingMultiplier = 1) {
  const plan = effectiveDevelopmentPlan(player);
  const coach = trainingClamp(Number(coachingMultiplier) || 1, .91, 1.09);
  return trainingClamp(plan.definition.progressMultiplier * coach, .65, 1.14);
}

export function developmentPlanAttributePreference(player) {
  const plan = effectiveDevelopmentPlan(player);
  if (plan.definition.focusAttribute) return plan.definition.focusAttribute;
  if (plan.definition.roleFocused) {
    if (['ST','CF','RW','LW'].includes(player?.position)) return 'attack';
    if (['CB','RB','LB'].includes(player?.position)) return 'defence';
    if (player?.position === 'GK') return 'goalkeeping';
    return 'midfield';
  }
  return null;
}

export function developmentPlanRecoveryMultiplier(player) {
  return trainingClamp(effectiveDevelopmentPlan(player).definition.recoveryMultiplier ?? 1, 1, 1.1);
}

export function developmentPlanSharpnessBonus(player) {
  return trainingClamp(Number(effectiveDevelopmentPlan(player).definition.sharpnessBonus) || 0, 0, 5);
}

export function markDevelopmentPlanForTransferReview(player, nextTeamId) {
  if (!player) return player;
  const plan = normalizeDevelopmentPlan(player.developmentPlan, player);
  if (!plan) return player;
  return {
    ...player,
    developmentPlan:{
      ...plan,
      assignedTeamId:nextTeamId ?? player.teamId ?? null,
      reviewRequired:true,
    },
  };
}

function legacyAutomaticPlanRecommendation(player) {
  if (!player) return 'balanced';
  if (player.position === 'GK') return 'role';
  if (['ST','CF','RW','LW'].includes(player.position)) return 'finishing';
  if (['CB','RB','LB'].includes(player.position)) return 'defending';
  if (['CM','CDM','CAM','RM','LM'].includes(player.position)) return 'creation';
  return 'balanced';
}

function tacticalTrainingDemand(player, tacticalProfile, roleId) {
  const resolvedRoleId = roleId ?? chooseAIRole(player, tacticalProfile);
  const participation = ROLE_ACTION_WEIGHTS[resolvedRoleId] ?? {};
  const usage = tacticalActionUsage(tacticalProfile?.instructions ?? tacticalProfile ?? {});
  const planDemand = { finishing:0, creation:0, defending:0, physical:0 };
  const actionDemand = [];

  for (const [actionId, rawParticipation] of Object.entries(participation)) {
    const action = TACTICAL_ACTION_DEFS[actionId];
    if (!action) continue;
    const demand = Math.max(0, Number(rawParticipation) || 0) * Math.max(0, Number(usage[actionId]) || 0);
    if (!(demand > 0)) continue;
    let mapped = 0;
    for (const [attribute, rawWeight] of Object.entries(action.execution ?? {})) {
      const planId = TACTICAL_TRAINING_PLAN_BY_ATTRIBUTE[attribute];
      const weight = Math.max(0, Number(rawWeight) || 0);
      if (!planId || !(weight > 0)) continue;
      planDemand[planId] += demand * weight;
      mapped += weight;
    }
    if (mapped > 0) actionDemand.push({ actionId, demand });
  }

  return {
    roleId:resolvedRoleId ?? null,
    planDemand,
    actionDemand:actionDemand.sort((a, b) => b.demand - a.demand || a.actionId.localeCompare(b.actionId)),
  };
}

function trainingReason(planId, roleId, topAction = null) {
  const roleText = roleId ? `Your ${roleId.replaceAll('_', ' ')} role` : 'This role';
  if (planId === 'finishing') return `${roleText} is being asked to contribute heavily to shot execution.`;
  if (planId === 'creation') return `${roleText} is being asked to progress, carry or create with the ball.`;
  if (planId === 'defending') return `${roleText} is being asked to win, intercept or recover the ball.`;
  if (planId === 'physical') return `${roleText} has an unusually strong pace/physical action demand in this plan.`;
  if (topAction) return `${roleText} is most involved in ${topAction.replaceAll('_', ' ')} actions.`;
  return 'This keeps development aligned with the player’s current positional responsibilities.';
}

/**
 * Explainable T5.4 recommendation. With no tactical profile this intentionally
 * falls back to the exact pre-T5.4 positional recommendation. Supplying a
 * profile makes the advice action-aware, but it never writes a development plan.
 */
export function automaticPlanRecommendationDetail(player, context = {}) {
  if (!player) return { id:'balanced', reason:'Balanced development is the safe default.', roleId:null, source:'legacy' };
  if (player.injured || (player.rehabilitation && player.rehabilitation.status !== 'match_fit')) {
    return { id:'recovery', reason:'Recovery takes priority while medical or match readiness is rebuilding.', roleId:null, source:'wellbeing' };
  }
  if (Number(player.sharpness ?? 50) < 38) {
    return { id:'sharpness', reason:'Match sharpness is low enough to take priority over tactical development.', roleId:null, source:'wellbeing' };
  }
  if (player.positionConversion?.targetPosition) {
    return { id:'position_conversion', reason:`Continue the active conversion to ${player.positionConversion.targetPosition}.`, roleId:null, source:'pathway' };
  }

  const tacticalProfile = context?.tacticalProfile ?? null;
  if (!tacticalProfile) {
    const id = legacyAutomaticPlanRecommendation(player);
    return { id, reason:trainingReason(id, context?.roleId ?? null), roleId:context?.roleId ?? null, source:'legacy' };
  }
  if (player.position === 'GK') {
    return { id:'role', reason:trainingReason('role', context?.roleId ?? 'goalkeeper'), roleId:context?.roleId ?? 'goalkeeper', source:'tactical' };
  }

  const demand = tacticalTrainingDemand(player, tacticalProfile, context?.roleId ?? null);
  const ranked = Object.entries(demand.planDemand).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [leaderId, leaderScore] = ranked[0] ?? [];
  const runnerScore = Number(ranked[1]?.[1] ?? 0);
  const total = ranked.reduce((sum, [, value]) => sum + value, 0);
  const topAction = demand.actionDemand[0]?.actionId ?? null;

  if (!(leaderScore > 0) || !(total > 0)) {
    const id = legacyAutomaticPlanRecommendation(player);
    return { id, reason:trainingReason(id, demand.roleId, topAction), roleId:demand.roleId, source:'legacy' };
  }

  // Physical work is deliberately held to a stronger threshold because the
  // existing Physical plan raises broad workload rather than targeting one
  // technical headline. It should only be recommended when that action demand
  // is materially dominant, not merely because pace appears in several actions.
  let id = leaderId;
  if (leaderId === 'physical' && (leaderScore < runnerScore * 1.18 || leaderScore / total < .36)) {
    id = ranked.find(([candidate]) => candidate !== 'physical')?.[0] ?? legacyAutomaticPlanRecommendation(player);
  }

  return {
    id:DEVELOPMENT_PLAN_IDS.includes(id) ? id : legacyAutomaticPlanRecommendation(player),
    reason:trainingReason(id, demand.roleId, topAction),
    roleId:demand.roleId,
    focusAction:topAction,
    source:'tactical',
  };
}

export function automaticPlanRecommendation(player, context = {}) {
  return automaticPlanRecommendationDetail(player, context).id;
}
