const REQUIRED_SCENARIOS = Object.freeze([
  'quality_gap_5',
  'quality_gap_10',
  'quality_gap_20',
  'home_away_reversal',
  'formation_4231',
  'formation_442',
  'formation_532',
  'space_vs_high_line',
  'space_vs_low_line',
  'carry_vs_compact',
  'wide_vs_narrow',
  'wide_vs_wide',
  'work_into_box',
  'shoot_on_sight',
  'counterpress_vs_patient',
  'pace_specialist_into_space',
  'passing_specialist_direct',
  'dribbling_specialist_carry',
  'shooting_specialist_finishing',
  'defending_specialist_vs_space',
  'physical_specialist_press',
  'fatigued_aggressive_press',
  'penetration_roles',
  'wide_roles',
  'possession_roles',
]);

function scenarioMap(report) {
  return new Map((report?.scenarios ?? []).map(scenario => [scenario.id, scenario]));
}

function num(value) {
  return Number(value) || 0;
}

function routeDelta(scenario, route, metric) {
  return num(scenario?.delta?.routes?.[route]?.[metric]);
}

function addFailure(failures, condition, message) {
  if (!condition) failures.push(message);
}

/**
 * Reviewed T7 structural guardrails.
 *
 * These deliberately protect relationships rather than pinning the exact
 * September 2026 calibration snapshot. Player quality must stay more powerful
 * than tactic selection, tactical choices must retain costs/context, specialist
 * attributes must matter in their causal domains and fatigue must remain real.
 */
export function evaluateT7CalibrationGuardrails(report) {
  const failures = [];
  const scenarios = scenarioMap(report);

  addFailure(failures, report?.standardGateUnchanged === true, 'The standard T0/T3 balance gate must remain unchanged.');
  for (const id of REQUIRED_SCENARIOS) {
    addFailure(failures, scenarios.has(id), `Missing required T7 calibration scenario: ${id}.`);
  }
  if (failures.length) return { pass:false, failures };

  for (const scenario of scenarios.values()) {
    addFailure(failures, scenario.seedMismatches === 0, `${scenario.id}: paired seeds diverged.`);
  }

  const q5 = scenarios.get('quality_gap_5');
  const q10 = scenarios.get('quality_gap_10');
  const q20 = scenarios.get('quality_gap_20');
  addFailure(failures, num(q5.delta.pointsPerMatch) >= .35, 'A +5 quality edge no longer creates a meaningful aggregate points advantage.');
  addFailure(failures, num(q10.delta.pointsPerMatch) >= .55, 'A +10 quality edge no longer creates a clear aggregate points advantage.');
  addFailure(failures, num(q20.delta.pointsPerMatch) >= 1, 'A +20 quality edge can be erased too easily by neutral tactical context.');
  addFailure(failures, num(q10.delta.pointsPerMatch) >= num(q5.delta.pointsPerMatch), 'Quality advantage is not monotonic from +5 to +10.');
  addFailure(failures, num(q20.delta.pointsPerMatch) >= num(q10.delta.pointsPerMatch), 'Quality advantage is not monotonic from +10 to +20.');
  addFailure(failures, num(q20.pairedOutcomes?.worse) <= Math.max(5, q20.matches * .1), 'A +20 quality side is losing too many same-seed comparisons to its neutral control.');

  const tacticScenarios = [...scenarios.values()].filter(scenario => scenario.category === 'tactic');
  const tacticPointDeltas = tacticScenarios.map(scenario => num(scenario.delta.pointsPerMatch));
  const maxTacticSwing = Math.max(...tacticPointDeltas.map(Math.abs));
  addFailure(failures, maxTacticSwing <= num(q5.delta.pointsPerMatch) * .75, 'A single reviewed tactic swing is too close to or larger than the +5 player-quality advantage.');
  addFailure(failures, tacticPointDeltas.some(value => value > .02), 'No reviewed tactical choice produces a contextual upside anymore.');
  addFailure(failures, tacticPointDeltas.some(value => value < -.02), 'Reviewed tactical variants have become universally non-negative.');

  const venue = scenarios.get('home_away_reversal');
  addFailure(failures, num(venue.delta.xGPerMatch) <= -.03, 'Moving the same side from home to away no longer reduces its attacking expectation.');
  addFailure(failures, Math.abs(num(venue.delta.pointsPerMatch)) <= .35, 'Venue context has become too dominant relative to tactical/player effects.');

  const formations = ['formation_4231','formation_442','formation_532'].map(id => scenarios.get(id));
  addFailure(failures, formations.every(scenario => Math.abs(num(scenario.delta.pointsPerMatch)) <= .35), 'A reviewed formation has become an excessive generic result multiplier.');

  const spaceHigh = scenarios.get('space_vs_high_line');
  const spaceLow = scenarios.get('space_vs_low_line');
  addFailure(failures, num(spaceHigh.delta.xGPerMatch) >= num(spaceLow.delta.xGPerMatch) + .04, 'Pass Into Space is no longer more productive against a high line than a low line.');
  addFailure(failures, routeDelta(spaceHigh, 'pass_into_space', 'attemptsPerMatch') >= 3, 'Pass Into Space no longer materially changes route usage.');

  const carry = scenarios.get('carry_vs_compact');
  addFailure(failures, routeDelta(carry, 'carry', 'attemptsPerMatch') >= 3, 'Run At Defence no longer materially increases carry attempts.');

  const wideNarrow = scenarios.get('wide_vs_narrow');
  const wideWide = scenarios.get('wide_vs_wide');
  addFailure(failures, routeDelta(wideNarrow, 'wide_delivery', 'attemptsPerMatch') >= 4, 'Wide attack no longer materially increases wide deliveries.');
  addFailure(failures, num(wideNarrow.delta.pointsPerMatch) >= num(wideWide.delta.pointsPerMatch) + .05, 'Wide attack is no longer relatively better against narrow defending than wide defending.');

  const workBox = scenarios.get('work_into_box');
  addFailure(failures, num(workBox.delta.shotsPerMatch) <= -.5, 'Work Into Box has lost its lower shot-volume trade-off.');
  addFailure(failures, num(workBox.delta.possessionPercent) >= 1.5, 'Work Into Box no longer produces the expected extra circulation/possession commitment.');

  const shootSight = scenarios.get('shoot_on_sight');
  addFailure(failures, num(shootSight.delta.shotsPerMatch) >= .4, 'Shoot On Sight no longer increases shot volume.');
  addFailure(failures, num(shootSight.delta.xGPerMatch) <= .1, 'Shoot On Sight has become a free large xG boost instead of a shot-selection trade-off.');

  const counterPress = scenarios.get('counterpress_vs_patient');
  addFailure(failures, num(counterPress.delta.possessionPercent) >= 4, 'Counter-press/high engagement no longer creates the expected territory swing against patient build-up.');
  addFailure(failures, num(counterPress.delta.shotsPerMatch) >= .4, 'Counter-press/high engagement no longer creates additional attacking pressure against patient build-up.');

  const pace = scenarios.get('pace_specialist_into_space');
  addFailure(failures, num(pace.delta.xGPerMatch) >= .05 && num(pace.delta.shotsPerMatch) >= .2, 'Pace specialists no longer create a meaningful attacking edge in the space-behind scenario.');

  const passing = scenarios.get('passing_specialist_direct');
  addFailure(failures, routeDelta(passing, 'pass_into_space', 'successRate') >= 2, 'Passing specialists no longer improve pass-into-space execution.');
  addFailure(failures, num(passing.delta.xGPerMatch) >= .08, 'Passing specialists no longer translate progression quality into attacking output.');

  const dribbling = scenarios.get('dribbling_specialist_carry');
  addFailure(failures, routeDelta(dribbling, 'carry', 'successRate') >= 2, 'Dribbling specialists no longer improve carry execution.');
  addFailure(failures, num(dribbling.delta.xGPerMatch) >= .05, 'Dribbling specialists no longer create attacking value when instructed to carry.');

  const shooting = scenarios.get('shooting_specialist_finishing');
  addFailure(failures, num(shooting.delta.goalsForPerMatch) >= .08, 'Shooting specialists no longer improve finishing output.');
  addFailure(failures, Math.abs(num(shooting.delta.shotsPerMatch)) <= .25, 'Shooting specialists are incorrectly creating large extra shot volume before finishing is resolved.');

  const defending = scenarios.get('defending_specialist_vs_space');
  addFailure(failures, num(defending.delta.goalsAgainstPerMatch) <= -.08, 'Defending specialists no longer reduce conceded output against space attacks.');

  const physical = scenarios.get('physical_specialist_press');
  addFailure(failures, num(physical.delta.pointsPerMatch) >= .05, 'Physical specialists no longer provide a meaningful edge in the aggressive-press context.');

  const fatigue = scenarios.get('fatigued_aggressive_press');
  addFailure(failures, num(fatigue.delta.pointsPerMatch) <= -.05, 'Low starting fitness no longer costs an aggressive pressing side results.');
  addFailure(failures, num(fatigue.delta.xGPerMatch) <= -.05, 'Low starting fitness no longer reduces aggressive-press attacking output.');
  addFailure(failures, num(fatigue.delta.goalsAgainstPerMatch) >= .05, 'Low starting fitness no longer exposes the defensive cost of an aggressive press.');

  const penetrationRoles = scenarios.get('penetration_roles');
  const wideRoles = scenarios.get('wide_roles');
  const possessionRoles = scenarios.get('possession_roles');
  addFailure(failures, routeDelta(penetrationRoles, 'pass_into_space', 'attemptsPerMatch') >= .75, 'Penetration roles no longer increase pass-into-space participation.');
  addFailure(failures, routeDelta(wideRoles, 'wide_delivery', 'attemptsPerMatch') >= .4, 'Wide roles no longer increase wide-delivery participation.');
  addFailure(failures, routeDelta(possessionRoles, 'circulation', 'attemptsPerMatch') >= .5, 'Possession roles no longer increase circulation participation.');

  return { pass:failures.length === 0, failures };
}

export function assertT7CalibrationGuardrails(report) {
  const result = evaluateT7CalibrationGuardrails(report);
  if (!result.pass) {
    throw new Error(`T7 deep calibration guardrail failure:\n- ${result.failures.join('\n- ')}`);
  }
  return result;
}
