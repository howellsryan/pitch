import { effectiveDetailedAttribute } from './playerModel.js';
import { chooseAIRole, roleSuitability } from './tactics.js';
import {
  ROLE_ACTION_WEIGHTS,
  TACTICAL_ACTION_DEFS,
  tacticalActionUsage,
} from './tacticalProjection.js';
import { buildSquadAwareAITacticalProfile } from './aiTacticalIdentity.js';

/**
 * Pure T5.3 career adapter. Match authority stays in matchEngine/action resolver;
 * this module only reuses the same tactical identity, role participation and
 * detailed action weights when career systems compare player/club fit.
 */
export const CAREER_TACTICAL_FIT_VERSION = 1;

const CAREER_TACTICAL_FIT_MIN = .72;
const CAREER_TACTICAL_FIT_MAX = 1.10;

function careerTacticalClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function careerTacticalRound2(value) {
  return Math.round(value * 100) / 100;
}

function careerTacticalSquad(team, players = []) {
  const teamId = String(team?.id ?? '');
  return (players ?? []).filter(player => {
    if (!player || player.inSquad === false || player.playerStatus === 'academy' || player.isYouth === true) return false;
    if (teamId && String(player.teamId ?? '') !== teamId) return false;
    if (player.onLoan && !player.loanedFrom) return false;
    return true;
  });
}

function careerTacticalDetailedRating(player, weights = {}) {
  let total = 0;
  let weightTotal = 0;
  for (const [attribute, rawWeight] of Object.entries(weights)) {
    const weight = Number(rawWeight);
    const value = Number(effectiveDetailedAttribute(player, attribute));
    if (!(weight > 0) || !Number.isFinite(value)) continue;
    total += value * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? total / weightTotal : 50;
}

export function buildCareerTacticalContext({ team, squad = [], tacticalProfile = null } = {}) {
  const currentSquad = careerTacticalSquad(team, squad);
  if (tacticalProfile) {
    return {
      version:CAREER_TACTICAL_FIT_VERSION,
      profile:tacticalProfile,
      profileId:tacticalProfile.id ?? null,
      squadSize:currentSquad.length,
      selection:null,
    };
  }
  const resolved = buildSquadAwareAITacticalProfile({ team, players:currentSquad });
  return {
    version:CAREER_TACTICAL_FIT_VERSION,
    profile:resolved.profile,
    profileId:resolved.profile?.id ?? null,
    squadSize:currentSquad.length,
    selection:resolved.selection,
  };
}

export function evaluateCareerTacticalFit({
  player,
  team,
  squad = [],
  tacticalProfile = null,
  roleId = null,
} = {}) {
  const context = buildCareerTacticalContext({ team, squad, tacticalProfile });
  if (!player || !context.profile) {
    return {
      version:CAREER_TACTICAL_FIT_VERSION,
      profileId:context.profileId,
      roleId:null,
      roleFit:.8,
      actionFit:.9,
      actionQuality:50,
      tacticalFit:.84,
      actions:[],
    };
  }

  const resolvedRoleId = roleId ?? chooseAIRole(player, context.profile);
  const structuralFit = resolvedRoleId ? Number(roleSuitability(player, resolvedRoleId)) : .8;
  const usage = tacticalActionUsage(context.profile.instructions ?? context.profile);
  const participation = ROLE_ACTION_WEIGHTS[resolvedRoleId] ?? {};
  const actions = [];
  let weightedQuality = 0;
  let totalWeight = 0;

  for (const [actionId, rawParticipation] of Object.entries(participation)) {
    const actionDef = TACTICAL_ACTION_DEFS[actionId];
    if (!actionDef) continue;
    const actionWeight = Number(rawParticipation) * Number(usage[actionId] ?? 0);
    if (!(actionWeight > 0)) continue;
    const quality = careerTacticalDetailedRating(player, actionDef.execution);
    weightedQuality += quality * actionWeight;
    totalWeight += actionWeight;
    actions.push({
      actionId,
      weight:careerTacticalRound2(actionWeight),
      quality:careerTacticalRound2(quality),
    });
  }

  const actionQuality = totalWeight > 0 ? weightedQuality / totalWeight : 50;
  // 50-level action execution is approximately neutral. Elite action quality is
  // useful but deliberately cannot swamp structural role fit or career-system
  // priorities such as position need, minutes, budget and ability.
  const actionFit = careerTacticalClamp(.76 + (actionQuality / 99) * .34, .78, CAREER_TACTICAL_FIT_MAX);
  const tacticalFit = careerTacticalClamp(
    structuralFit * .62 + actionFit * .38,
    CAREER_TACTICAL_FIT_MIN,
    CAREER_TACTICAL_FIT_MAX,
  );

  return {
    version:CAREER_TACTICAL_FIT_VERSION,
    profileId:context.profileId,
    roleId:resolvedRoleId ?? null,
    roleFit:careerTacticalRound2(structuralFit),
    actionFit:careerTacticalRound2(actionFit),
    actionQuality:careerTacticalRound2(actionQuality),
    tacticalFit:careerTacticalRound2(tacticalFit),
    actions:[...actions]
      .sort((left, right) => right.weight - left.weight || left.actionId.localeCompare(right.actionId))
      .slice(0, 5),
  };
}
