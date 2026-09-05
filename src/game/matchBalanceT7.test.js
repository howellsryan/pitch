import { describe, expect, it } from 'vitest';
import {
  T7_CALIBRATION_SCENARIOS,
  buildT7CalibrationSquad,
  createT7CalibrationReport,
} from '../../tools/lib/matchBalanceT7.mjs';

function expectFiniteTree(value, path = 'report') {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} should be finite`).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectFiniteTree(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) expectFiniteTree(item, `${path}.${key}`);
}

describe('T7 deep match calibration harness', () => {
  it('is deterministic, paired and serialisable on a representative compact matrix', () => {
    const config = {
      matchesPerScenario:3,
      scenarioIds:[
        'quality_gap_10',
        'home_away_reversal',
        'pace_specialist_into_space',
        'fatigued_aggressive_press',
        'penetration_roles',
      ],
    };
    const first = createT7CalibrationReport(config);
    const second = createT7CalibrationReport(config);

    expect(second).toEqual(first);
    expect(first.samples.scenarioCount).toBe(config.scenarioIds.length);
    expect(first.samples.totalSimulations).toBe(config.scenarioIds.length * config.matchesPerScenario * 2);
    expect(first.scenarios.every(scenario => scenario.seedMismatches === 0)).toBe(true);
    expect(first.scenarios.every(scenario => (
      scenario.pairedOutcomes.improved + scenario.pairedOutcomes.same + scenario.pairedOutcomes.worse
    ) === config.matchesPerScenario)).toBe(true);
    expect(() => JSON.stringify(first)).not.toThrow();
    expectFiniteTree(first);
  });

  it('covers the planned T7 scenario dimensions without changing the standard gate', () => {
    const categories = new Set(T7_CALIBRATION_SCENARIOS.map(scenario => scenario.category));
    expect(categories).toEqual(new Set(['quality','venue','formation','tactic','specialist','fitness','role']));
    expect(T7_CALIBRATION_SCENARIOS.length).toBeGreaterThanOrEqual(20);

    const report = createT7CalibrationReport({ matchesPerScenario:1, scenarioIds:['quality_gap_5'] });
    expect(report.standardGateUnchanged).toBe(true);
    expect(report.performanceCeilings).toMatchObject({
      freshCareerLoadSeconds:20,
      fullWorldWeekSeconds:25,
      storageMiB:50,
    });
  });

  it('builds detailed specialists without smuggling a headline-rating increase into the comparison', () => {
    const neutral = buildT7CalibrationSquad({ prefix:'neutral', rating:77, specialist:null });
    const pace = buildT7CalibrationSquad({ prefix:'pace', rating:77, specialist:'pace' });
    const neutralWinger = neutral.find(player => player.position === 'RW');
    const paceWinger = pace.find(player => player.position === 'RW');

    for (const field of ['attack','midfield','defence','goalkeeping']) {
      expect(paceWinger[field]).toBe(neutralWinger[field]);
    }
    expect(paceWinger.attributeProfile.pace).toBeGreaterThan(neutralWinger.attributeProfile.pace);
    for (const attribute of ['shooting','passing','dribbling','defending','physical']) {
      expect(paceWinger.attributeProfile[attribute]).toBe(neutralWinger.attributeProfile[attribute]);
    }
  });

  it('changes role participation independently of player headline and detailed quality', () => {
    const neutral = buildT7CalibrationSquad({ prefix:'neutral', rating:77 });
    const penetration = buildT7CalibrationSquad({ prefix:'roles', rating:77, rolePreset:'penetration' });
    const neutralStriker = neutral.find(player => player.position === 'ST');
    const roleStriker = penetration.find(player => player.position === 'ST');

    expect(roleStriker.tacticalRole).toBe('poacher');
    expect(roleStriker.attack).toBe(neutralStriker.attack);
    expect(roleStriker.attributeProfile).toEqual(neutralStriker.attributeProfile);
  });
});
