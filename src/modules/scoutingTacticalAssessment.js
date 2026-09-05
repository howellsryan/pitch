import { evaluateCareerTacticalFit } from './careerTacticalFit.js';
import { getAITacticalProfile } from './tactics.js';

/**
 * T5.4 scouting adapter.
 *
 * Exact reports may evaluate the canonical player. Partial/public reports are
 * deliberately evaluated through a neutral masked proxy derived only from the
 * report's observed current range, so hidden detailed attributes cannot leak
 * into manager-facing tactical-fit labels.
 */
export const SCOUTING_TACTICAL_ASSESSMENT_VERSION = 1;

function scoutingTacticalClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoutingTacticalMidpoint(range, fallback = 50) {
  const min = Number(range?.min);
  const max = Number(range?.max);
  if (Number.isFinite(min) && Number.isFinite(max)) return scoutingTacticalClamp((min + max) / 2, 1, 99);
  if (Number.isFinite(min)) return scoutingTacticalClamp(min, 1, 99);
  if (Number.isFinite(max)) return scoutingTacticalClamp(max, 1, 99);
  return scoutingTacticalClamp(Number(fallback) || 50, 1, 99);
}

function maskedScoutingPlayer(player, currentRange) {
  const current = scoutingTacticalMidpoint(currentRange, 50);
  const position = player?.position ?? 'CM';
  return {
    id:player?.id ?? 'scouted-player',
    name:player?.name ?? 'Scouted player',
    teamId:player?.teamId ?? null,
    position,
    age:Number(player?.age ?? 25),
    attack:current,
    midfield:current,
    defence:current,
    goalkeeping:position === 'GK' ? current : 10,
    fitness:100,
    form:50,
    individualMorale:50,
    sharpness:50,
    injured:false,
    traits:[],
    positionSuitability:{ [position]:1 },
    attributeProfile:{
      version:1,
      pace:current,
      shooting:current,
      passing:current,
      dribbling:current,
      defending:current,
      physical:current,
    },
  };
}

function scoutingFitLabel(value) {
  return value >= 1.02 ? 'Strong' : value >= .91 ? 'Good' : 'Stretch';
}

function scoutingActionFocus(actions = []) {
  const action = actions[0]?.actionId;
  if (!action) return 'General role fit';
  if (action === 'shot') return 'Finishing involvement';
  if (['circulation','direct_pass','pass_into_space'].includes(action)) return 'Progression and passing';
  if (action === 'carry') return 'Ball carrying';
  if (['wide_delivery','aerial_duel'].includes(action)) return 'Wide and aerial play';
  if (['high_press','interception_tackle'].includes(action)) return 'Pressing and ball winning';
  if (action === 'recovery_defence') return 'Recovery defending';
  if (action === 'attacking_set_piece') return 'Set-piece involvement';
  return 'General role fit';
}

export function buildScoutingTacticalAssessment({
  player,
  userTeam = null,
  userSquad = [],
  tacticalProfile = null,
  currentRange = null,
  exact = false,
} = {}) {
  const profile = tacticalProfile ?? getAITacticalProfile(userTeam ?? {});
  const subject = exact ? player : maskedScoutingPlayer(player, currentRange);
  const tactical = evaluateCareerTacticalFit({
    player:subject,
    team:userTeam ?? {},
    squad:userSquad,
    tacticalProfile:profile,
  });
  return {
    version:SCOUTING_TACTICAL_ASSESSMENT_VERSION,
    roleId:tactical.roleId,
    fit:scoutingFitLabel(tactical.tacticalFit),
    focus:scoutingActionFocus(tactical.actions),
  };
}
