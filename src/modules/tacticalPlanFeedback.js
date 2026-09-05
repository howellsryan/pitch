import { projectLineupTacticalProfile } from './tacticalProjection.js';
import { normalizeTeamInstructions } from './tactics.js';

export const TACTICAL_PLAN_FEEDBACK_VERSION = 1;

const ACTION_LABELS = Object.freeze({
  circulation:'ball circulation',
  direct_pass:'vertical passing',
  pass_into_space:'runs and passes into space',
  carry:'ball carrying',
  wide_delivery:'wide delivery',
  aerial_duel:'aerial threat',
  shot:'finishing',
  high_press:'pressing',
  interception_tackle:'ball winning',
  recovery_defence:'recovery defending',
  attacking_set_piece:'attacking set pieces',
});

function rounded(value) {
  return Math.round(Number(value) || 0);
}

function planGrade(score) {
  if (score >= 78) return 'Excellent fit';
  if (score >= 72) return 'Strong fit';
  if (score >= 66) return 'Good fit';
  if (score >= 60) return 'Mixed fit';
  return 'Needs adaptation';
}

function action(profile, actionId) {
  return profile.actions?.[actionId] ?? { usage:1, execution:50, counter:50 };
}

function addUnique(list, text) {
  if (text && !list.includes(text)) list.push(text);
}

function structuralConflicts(i) {
  const conflicts = [];
  if (i.defensiveLine === 'high' && i.lineOfEngagement === 'low') {
    addUnique(conflicts, 'High defensive line + low engagement can leave too much space between the units.');
  }
  if (i.defensiveLine === 'low' && i.lineOfEngagement === 'high') {
    addUnique(conflicts, 'High engagement + low defensive line can stretch the team vertically when the first press is beaten.');
  }
  if (i.pressing === 'aggressive' && i.defensiveTransition === 'regroup') {
    addUnique(conflicts, 'Aggressive pressing conflicts with Regroup after losing the ball.');
  }
  if (i.pressing === 'passive' && i.defensiveTransition === 'counter_press') {
    addUnique(conflicts, 'Passive pressing conflicts with Counter-press after losing the ball.');
  }
  if (i.shotSelection === 'work_into_box' && i.deliveryTiming === 'early') {
    addUnique(conflicts, 'Work Into Box and Early Delivery pull chance creation in opposite directions.');
  }
  return conflicts;
}

function planActionIds(i) {
  const ids = new Set(['circulation','interception_tackle','recovery_defence']);
  if (i.buildUp === 'direct') ids.add('direct_pass');
  if (i.buildUp === 'patient') ids.add('circulation');
  if (i.useOfSpace === 'pass_into_space') ids.add('pass_into_space');
  if (i.ballCarrying === 'run_at_defence') ids.add('carry');
  if (i.attackingWidth === 'wide' || i.deliveryTiming === 'early') ids.add('wide_delivery');
  if (i.shotSelection !== 'work_into_box') ids.add('shot');
  if (i.pressing === 'aggressive' || i.lineOfEngagement === 'high' || i.defensiveTransition === 'counter_press') ids.add('high_press');
  if (i.defensiveLine === 'high') ids.add('recovery_defence');
  if (i.setPieces === 'attack') ids.add('attacking_set_piece');
  return [...ids];
}

function weightedFit(profile, instructions) {
  const ids = planActionIds(instructions);
  let weighted = 0;
  let total = 0;
  for (const actionId of ids) {
    const value = action(profile, actionId);
    const usage = Math.max(.4, Number(value.usage ?? 1));
    weighted += Number(value.execution ?? 50) * usage;
    total += usage;
  }
  return total > 0 ? weighted / total : 50;
}

export function buildTacticalPlanFeedback({ players = [], rolesById = {}, instructions = {} } = {}) {
  const normalized = normalizeTeamInstructions(instructions?.instructions ?? instructions);
  const profile = projectLineupTacticalProfile({ players, rolesById, instructions:normalized });
  const strengths = [];
  const risks = [];
  const conflicts = structuralConflicts(normalized);

  function evaluate(actionId, enabled, strengthText, riskText, strongAt = 76, weakBelow = 65) {
    if (!enabled) return;
    const rating = Number(action(profile, actionId).execution ?? 50);
    if (rating >= strongAt) addUnique(strengths, `${strengthText} (${rounded(rating)})`);
    if (rating < weakBelow) addUnique(risks, `${riskText} (${rounded(rating)})`);
  }

  evaluate(
    'pass_into_space', normalized.useOfSpace === 'pass_into_space',
    'The XI has the passing and runner pace to attack space',
    'Pass Into Space asks more of the XI than its current passing/running quality supports',
  );
  evaluate(
    'carry', normalized.ballCarrying === 'run_at_defence',
    'Strong carriers can repeatedly isolate and beat defenders',
    'Run at Defence risks turnovers because the XI lacks enough carrying quality',
  );
  evaluate(
    'shot', normalized.shotSelection === 'shoot_on_sight',
    'Shooting quality can support the extra shot volume',
    'Shoot on Sight may waste possessions because finishing quality is limited',
    78, 68,
  );
  evaluate(
    'circulation', normalized.buildUp === 'patient' || normalized.useOfSpace === 'to_feet',
    'Passing and close control suit patient circulation',
    'Patient circulation may struggle because the XI is vulnerable in possession',
  );
  evaluate(
    'direct_pass', normalized.buildUp === 'direct' || normalized.onWin === 'counter',
    'Vertical passing gives the plan a credible direct outlet',
    'Direct progression is ambitious for the XI’s current passing/receiving quality',
  );
  evaluate(
    'wide_delivery', normalized.attackingWidth === 'wide' || normalized.deliveryTiming === 'early',
    'Wide players give the plan a reliable delivery route',
    'Wide/early delivery is a weak route for this XI',
  );
  evaluate(
    'high_press', normalized.pressing === 'aggressive' || normalized.lineOfEngagement === 'high' || normalized.defensiveTransition === 'counter_press',
    'The XI has the pace, defending and physicality to press high',
    'The press asks more pace/defending/physicality than the XI currently offers',
  );
  evaluate(
    'recovery_defence', normalized.defensiveLine === 'high',
    'Recovery pace and defending protect the high line',
    'A high line exposes limited recovery pace/defending',
    77, 68,
  );
  evaluate(
    'attacking_set_piece', normalized.setPieces === 'attack',
    'Set-piece delivery and physical threat suit extra commitment',
    'Attacking set pieces commit players without enough delivery/aerial quality',
  );

  const score = rounded(weightedFit(profile, normalized));
  if (!strengths.length) {
    const strongest = Object.entries(profile.actions ?? {})
      .sort((left, right) => Number(right[1].execution ?? 0) - Number(left[1].execution ?? 0))[0];
    if (strongest) addUnique(strengths, `Best current route: ${ACTION_LABELS[strongest[0]] ?? strongest[0]} (${rounded(strongest[1].execution)})`);
  }

  return {
    version:TACTICAL_PLAN_FEEDBACK_VERSION,
    fitScore:score,
    grade:planGrade(score),
    strengths:strengths.slice(0, 3),
    risks:risks.slice(0, 3),
    conflicts:conflicts.slice(0, 3),
    profile,
  };
}
