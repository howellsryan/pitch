import {
  currentEffectiveLevel,
  positionSuitabilityFor,
} from './playerModel.js';
import {
  AI_TACTICAL_ARCHETYPES,
  TACTICS_PLAN_VERSION,
  chooseAIRole,
  getAITacticalProfile,
  normalizeTeamInstructions,
  stableStringHash,
} from './tactics.js';
import { buildTacticalPlanFeedback } from './tacticalPlanFeedback.js';

/**
 * T5 pure AI tactical identity selector.
 *
 * Club identity remains anchored by the existing stable hash. Squad fit may
 * override that identity only when the improvement is material. Match-specific
 * reputation/home-away adaptations are layered on after identity selection and
 * never mutate the input team or player records.
 */

export const AI_TACTICAL_IDENTITY_VERSION = 1;
export const AI_IDENTITY_SWITCH_MARGIN = 4;

const ARCHETYPE_BY_ID = new Map(AI_TACTICAL_ARCHETYPES.map(archetype => [archetype.id, archetype]));

const FORMATION_SLOTS = Object.freeze({
  '4-3-3':Object.freeze(['GK','CB','CB','RB','LB','CDM','CM','CM','RW','LW','ST']),
  '4-2-3-1':Object.freeze(['GK','CB','CB','RB','LB','CDM','CDM','CAM','RW','LW','ST']),
  '4-4-2':Object.freeze(['GK','CB','CB','RB','LB','CM','CM','RM','LM','ST','ST']),
  '4-1-4-1':Object.freeze(['GK','CB','CB','RB','LB','CDM','CM','CM','RM','LM','ST']),
});

function aiFitClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function aiFitRound(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function squadPool(players = []) {
  return players.filter(player => player && player.inSquad !== false);
}

function slotEligible(player, slot) {
  if (slot === 'GK') return player?.position === 'GK';
  return player?.position !== 'GK';
}

function slotCandidateScore(player, slot) {
  const suitability = aiFitClamp(Number(positionSuitabilityFor(player, slot)) || 0, 0, 1);
  const level = aiFitClamp(Number(currentEffectiveLevel(player, { position:slot })) || 0, 0, 99) / 99;
  // Position coverage is deliberately more important than raw quality here.
  // Tactical identity should not solve a missing role by forcing an elite
  // player into an implausible slot.
  return suitability * .72 + level * .28;
}

export function selectArchetypeEleven(players = [], formation = '4-3-3') {
  const slots = FORMATION_SLOTS[formation] ?? FORMATION_SLOTS['4-3-3'];
  const pool = squadPool(players);
  const remaining = [...pool];
  const eleven = [];
  let coverageTotal = 0;

  for (const slot of slots) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const player = remaining[index];
      if (!slotEligible(player, slot)) continue;
      const score = slotCandidateScore(player, slot);
      if (score > bestScore || (score === bestScore && String(player.id).localeCompare(String(remaining[bestIndex]?.id ?? '')) < 0)) {
        bestIndex = index;
        bestScore = score;
      }
    }
    if (bestIndex < 0) continue;
    const [player] = remaining.splice(bestIndex, 1);
    const suitability = aiFitClamp(Number(positionSuitabilityFor(player, slot)) || 0, 0, 1);
    coverageTotal += suitability;
    eleven.push({ ...player, matchPosition:slot });
  }

  return {
    eleven,
    coverageScore:aiFitRound((coverageTotal / slots.length) * 100),
    missingSlots:Math.max(0, slots.length - eleven.length),
  };
}

export function evaluateAIArchetypeFeasibility(players = [], archetypeInput) {
  const archetype = typeof archetypeInput === 'string'
    ? ARCHETYPE_BY_ID.get(archetypeInput)
    : archetypeInput;
  if (!archetype) return null;

  const selected = selectArchetypeEleven(players, archetype.formation);
  const rolesById = {};
  const profile = {
    ...archetype,
    instructions:normalizeTeamInstructions(archetype.instructions),
    source:'ai',
    version:TACTICS_PLAN_VERSION,
  };
  for (const player of selected.eleven) rolesById[player.id] = chooseAIRole(player, profile);

  const feedback = buildTacticalPlanFeedback({
    players:selected.eleven,
    rolesById,
    instructions:profile.instructions,
  });
  const conflictPenalty = feedback.conflicts.length * 2.5;
  const missingPenalty = selected.missingSlots * 7;
  const score = aiFitClamp(
    feedback.fitScore * .70 + selected.coverageScore * .30 - conflictPenalty - missingPenalty,
    0,
    100,
  );

  return {
    archetypeId:archetype.id,
    label:archetype.label,
    formation:archetype.formation,
    score:aiFitRound(score),
    actionFit:feedback.fitScore,
    coverageScore:selected.coverageScore,
    missingSlots:selected.missingSlots,
    conflicts:feedback.conflicts.length,
    elevenIds:selected.eleven.map(player => player.id),
  };
}

export function selectSquadAwareAIIdentity({ team, players = [] } = {}) {
  const baseProfile = getAITacticalProfile(team, null, true);
  const baseArchetypeId = baseProfile.id;
  const pool = squadPool(players);

  if (pool.length < 11 || !pool.some(player => player.position === 'GK')) {
    return {
      version:AI_TACTICAL_IDENTITY_VERSION,
      archetypeId:baseArchetypeId,
      baseArchetypeId,
      switched:false,
      reason:'insufficient_squad_data',
      margin:0,
      evaluations:[],
    };
  }

  const evaluations = AI_TACTICAL_ARCHETYPES
    .map(archetype => evaluateAIArchetypeFeasibility(pool, archetype))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.archetypeId.localeCompare(right.archetypeId));
  const baseEvaluation = evaluations.find(item => item.archetypeId === baseArchetypeId) ?? evaluations[0];
  const best = evaluations[0] ?? baseEvaluation;
  const margin = aiFitRound((best?.score ?? 0) - (baseEvaluation?.score ?? 0));
  const switched = Boolean(best && baseEvaluation && best.archetypeId !== baseArchetypeId && margin >= AI_IDENTITY_SWITCH_MARGIN);

  return {
    version:AI_TACTICAL_IDENTITY_VERSION,
    archetypeId:switched ? best.archetypeId : baseArchetypeId,
    baseArchetypeId,
    switched,
    reason:switched ? 'material_squad_fit' : 'club_identity_retained',
    margin,
    evaluations,
  };
}

function contextualProfile(archetype, team, opponent, isHome) {
  const seed = stableStringHash(`${team?.id ?? team?.name ?? 'team'}:${team?.league ?? ''}`);
  const teamRep = Number(team?.reputation ?? team?.strength ?? 70);
  const oppRep = Number(opponent?.reputation ?? opponent?.strength ?? teamRep);
  const adapted = { ...normalizeTeamInstructions(archetype.instructions) };
  let formation = archetype.formation;
  let mentality = archetype.mentality;

  // Preserve the existing P2/T4 match-context adaptation boundary for T5.1.
  // T5.2 can make these rules more explicitly squad-aware once identity
  // selection itself is proven and calibrated.
  if (!isHome && oppRep - teamRep >= 8) {
    adapted.defensiveLine = 'low';
    adapted.lineOfEngagement = 'low';
    adapted.defensiveApproach = 'compact';
    adapted.defensiveTransition = 'regroup';
    adapted.onWin = 'counter';
    mentality = 'defensive';
    formation = seed % 2 ? '5-4-1' : '4-1-4-1';
  } else if (isHome && teamRep - oppRep >= 8) {
    adapted.defensiveLine = 'high';
    adapted.lineOfEngagement = 'high';
    adapted.defensiveApproach = 'front_foot';
    adapted.pressing = archetype.id === 'compact_counter' ? 'standard' : 'aggressive';
    mentality = archetype.id === 'controller' ? 'possession' : 'attacking';
  }

  return {
    id:archetype.id,
    label:archetype.label,
    formation,
    mentality,
    instructions:normalizeTeamInstructions(adapted),
    source:'ai',
    version:TACTICS_PLAN_VERSION,
  };
}

export function buildSquadAwareAITacticalProfile({
  team,
  opponent = null,
  isHome = true,
  players = [],
} = {}) {
  const selection = selectSquadAwareAIIdentity({ team, players });
  const archetype = ARCHETYPE_BY_ID.get(selection.archetypeId)
    ?? ARCHETYPE_BY_ID.get(selection.baseArchetypeId)
    ?? AI_TACTICAL_ARCHETYPES[0];
  return {
    profile:contextualProfile(archetype, team, opponent, isHome),
    selection,
  };
}
