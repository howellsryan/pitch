import { describe, expect, it } from 'vitest';
import { evaluateT7CalibrationGuardrails } from '../../tools/lib/matchBalanceT7Guardrails.mjs';

const ROUTES = ['circulation','direct_pass','pass_into_space','carry','wide_delivery'];
const DEFINITIONS = [
  ['quality_gap_5','quality'],['quality_gap_10','quality'],['quality_gap_20','quality'],
  ['home_away_reversal','venue'],
  ['formation_4231','formation'],['formation_442','formation'],['formation_532','formation'],
  ['space_vs_high_line','tactic'],['space_vs_low_line','tactic'],['carry_vs_compact','tactic'],
  ['wide_vs_narrow','tactic'],['wide_vs_wide','tactic'],['work_into_box','tactic'],['shoot_on_sight','tactic'],['counterpress_vs_patient','tactic'],
  ['pace_specialist_into_space','specialist'],['passing_specialist_direct','specialist'],['dribbling_specialist_carry','specialist'],
  ['shooting_specialist_finishing','specialist'],['defending_specialist_vs_space','specialist'],['physical_specialist_press','specialist'],
  ['fatigued_aggressive_press','fitness'],
  ['penetration_roles','role'],['wide_roles','role'],['possession_roles','role'],
];

function routes() {
  return Object.fromEntries(ROUTES.map(route => [route, { attemptsPerMatch:0, successRate:0, chancesPerMatch:0, xGPerMatch:0 }]));
}

function scenario(id, category) {
  return {
    id,
    category,
    matches:100,
    seedMismatches:0,
    pairedOutcomes:{ improved:10, same:90, worse:0 },
    delta:{
      pointsPerMatch:0,
      goalsForPerMatch:0,
      goalsAgainstPerMatch:0,
      possessionPercent:0,
      shotsPerMatch:0,
      shotsOnTargetPerMatch:0,
      xGPerMatch:0,
      yellowCardsPerMatch:0,
      turnoversLostPerMatch:0,
      routes:routes(),
    },
  };
}

function knownGoodReport() {
  const scenarios = DEFINITIONS.map(([id, category]) => scenario(id, category));
  const byId = new Map(scenarios.map(item => [item.id, item]));
  const set = (id, values) => Object.assign(byId.get(id).delta, values);
  const route = (id, name, values) => Object.assign(byId.get(id).delta.routes[name], values);

  set('quality_gap_5', { pointsPerMatch:.7 });
  set('quality_gap_10', { pointsPerMatch:.9 });
  set('quality_gap_20', { pointsPerMatch:1.6 });
  set('home_away_reversal', { pointsPerMatch:-.05, xGPerMatch:-.08 });
  set('formation_4231', { pointsPerMatch:.1 });
  set('formation_442', { pointsPerMatch:-.1 });
  set('formation_532', { pointsPerMatch:-.08 });

  set('space_vs_high_line', { pointsPerMatch:.2, xGPerMatch:.25 });
  route('space_vs_high_line', 'pass_into_space', { attemptsPerMatch:7 });
  set('space_vs_low_line', { pointsPerMatch:.1, xGPerMatch:.14 });
  route('space_vs_low_line', 'pass_into_space', { attemptsPerMatch:8 });
  set('carry_vs_compact', { pointsPerMatch:.03 });
  route('carry_vs_compact', 'carry', { attemptsPerMatch:6 });
  set('wide_vs_narrow', { pointsPerMatch:.02 });
  route('wide_vs_narrow', 'wide_delivery', { attemptsPerMatch:8 });
  set('wide_vs_wide', { pointsPerMatch:-.16 });
  route('wide_vs_wide', 'wide_delivery', { attemptsPerMatch:8 });
  set('work_into_box', { pointsPerMatch:.2, shotsPerMatch:-1, possessionPercent:3 });
  set('shoot_on_sight', { pointsPerMatch:-.05, shotsPerMatch:.8, xGPerMatch:-.04 });
  set('counterpress_vs_patient', { pointsPerMatch:.15, possessionPercent:8, shotsPerMatch:1 });

  set('pace_specialist_into_space', { pointsPerMatch:.12, shotsPerMatch:.6, xGPerMatch:.15 });
  set('passing_specialist_direct', { pointsPerMatch:.15, xGPerMatch:.2 });
  route('passing_specialist_direct', 'pass_into_space', { successRate:6 });
  set('dribbling_specialist_carry', { pointsPerMatch:.15, xGPerMatch:.15 });
  route('dribbling_specialist_carry', 'carry', { successRate:7 });
  set('shooting_specialist_finishing', { pointsPerMatch:.2, goalsForPerMatch:.2, shotsPerMatch:0 });
  set('defending_specialist_vs_space', { pointsPerMatch:.2, goalsAgainstPerMatch:-.2 });
  set('physical_specialist_press', { pointsPerMatch:.15 });

  set('fatigued_aggressive_press', { pointsPerMatch:-.15, goalsAgainstPerMatch:.15, xGPerMatch:-.12 });
  route('penetration_roles', 'pass_into_space', { attemptsPerMatch:1.5 });
  route('wide_roles', 'wide_delivery', { attemptsPerMatch:.9 });
  route('possession_roles', 'circulation', { attemptsPerMatch:1.5 });

  return { standardGateUnchanged:true, scenarios };
}

describe('T7 reviewed deep calibration guardrails', () => {
  it('accepts the intended structural relationships without pinning exact snapshot values', () => {
    const result = evaluateT7CalibrationGuardrails(knownGoodReport());
    expect(result).toEqual({ pass:true, failures:[] });
  });

  it('rejects tactics that grow too close to the player-quality signal', () => {
    const report = knownGoodReport();
    report.scenarios.find(item => item.id === 'counterpress_vs_patient').delta.pointsPerMatch = .6;
    const result = evaluateT7CalibrationGuardrails(report);
    expect(result.pass).toBe(false);
    expect(result.failures.join('\n')).toMatch(/tactic swing/i);
  });

  it('rejects a specialist or fitness regression in the causal domain', () => {
    const specialist = knownGoodReport();
    specialist.scenarios.find(item => item.id === 'dribbling_specialist_carry').delta.routes.carry.successRate = 0;
    expect(evaluateT7CalibrationGuardrails(specialist).failures.join('\n')).toMatch(/Dribbling specialists/);

    const fatigue = knownGoodReport();
    fatigue.scenarios.find(item => item.id === 'fatigued_aggressive_press').delta.pointsPerMatch = .1;
    expect(evaluateT7CalibrationGuardrails(fatigue).failures.join('\n')).toMatch(/fitness/i);
  });
});
