/*
 * modules/training.js — pure P5 weekly development-plan contract.
 *
 * Plans shape evidence-based P3 development at the existing weekly boundary.
 * A missing plan means the safe automatic Balanced default; rehabilitation can
 * override intensity without requiring weekly manager administration.
 */

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

export function automaticPlanRecommendation(player) {
  if (!player) return 'balanced';
  if (player.injured || (player.rehabilitation && player.rehabilitation.status !== 'match_fit')) return 'recovery';
  if (Number(player.sharpness ?? 50) < 38) return 'sharpness';
  if (player.positionConversion?.targetPosition) return 'position_conversion';
  if (player.position === 'GK') return 'role';
  if (['ST','CF','RW','LW'].includes(player.position)) return 'finishing';
  if (['CB','RB','LB'].includes(player.position)) return 'defending';
  if (['CM','CDM','CAM','RM','LM'].includes(player.position)) return 'creation';
  return 'balanced';
}
