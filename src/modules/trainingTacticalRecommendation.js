import { chooseAIRole } from './tactics.js';
import { ROLE_ACTION_WEIGHTS, TACTICAL_ACTION_DEFS, tacticalActionUsage } from './tacticalProjection.js';
import { automaticPlanRecommendation } from './training.js';

/**
 * T5.4 advisory adapter. Core training/development remains dependency-light;
 * this module layers tactical action demand over the existing automatic plan
 * recommendation without mutating the player or applying a plan.
 */
export const TRAINING_TACTICAL_RECOMMENDATION_VERSION = 1;

const TACTICAL_TRAINING_PLAN_BY_ATTRIBUTE = Object.freeze({
  shooting:'finishing',
  passing:'creation',
  dribbling:'creation',
  defending:'defending',
  pace:'physical',
  physical:'physical',
});

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

function wellbeingOrPathwayRecommendation(player) {
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
  return null;
}

export function automaticPlanRecommendationDetail(player, context = {}) {
  const priority = wellbeingOrPathwayRecommendation(player);
  if (priority) return priority;

  const tacticalProfile = context?.tacticalProfile ?? null;
  if (!tacticalProfile) {
    const id = automaticPlanRecommendation(player);
    return { id, reason:trainingReason(id, context?.roleId ?? null), roleId:context?.roleId ?? null, source:'legacy' };
  }
  if (player.position === 'GK') {
    const roleId = context?.roleId ?? 'goalkeeper';
    return { id:'role', reason:trainingReason('role', roleId), roleId, source:'tactical' };
  }

  const demand = tacticalTrainingDemand(player, tacticalProfile, context?.roleId ?? null);
  const ranked = Object.entries(demand.planDemand).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [leaderId, leaderScore] = ranked[0] ?? [];
  const runnerScore = Number(ranked[1]?.[1] ?? 0);
  const total = ranked.reduce((sum, [, value]) => sum + value, 0);
  const topAction = demand.actionDemand[0]?.actionId ?? null;

  if (!(leaderScore > 0) || !(total > 0)) {
    const id = automaticPlanRecommendation(player);
    return { id, reason:trainingReason(id, demand.roleId, topAction), roleId:demand.roleId, source:'legacy' };
  }

  // Physical is a broad higher-workload plan, so it needs a materially stronger
  // action-demand case than the technical focus plans before being recommended.
  let id = leaderId;
  if (leaderId === 'physical' && (leaderScore < runnerScore * 1.18 || leaderScore / total < .36)) {
    id = ranked.find(([candidate]) => candidate !== 'physical')?.[0] ?? automaticPlanRecommendation(player);
  }

  return {
    id,
    reason:trainingReason(id, demand.roleId, topAction),
    roleId:demand.roleId,
    focusAction:topAction,
    source:'tactical',
  };
}
