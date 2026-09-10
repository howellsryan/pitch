import { describe, expect, it } from 'vitest';
import {
  REGULATION_HALF_PHASES,
  periodClock,
  periodStartMinute,
  regulationAddedTime,
  regulationClockForPhase,
} from './liveMatchClock.js';

describe('football-style live clock presentation', () => {
  it('uses deterministic realistic stoppage allowances without touching engine state', () => {
    const first = regulationAddedTime(9182, 1);
    const second = regulationAddedTime(9182, 2);
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThanOrEqual(3);
    expect(second).toBeGreaterThanOrEqual(2);
    expect(second).toBeLessThanOrEqual(6);
    expect(regulationAddedTime(9182, 1)).toBe(first);
    expect(regulationAddedTime(9182, 2)).toBe(second);
  });

  it('renders the final first-half engine phases as 45+N', () => {
    const added = regulationAddedTime(11, 1);
    const coreEnd = REGULATION_HALF_PHASES - added;
    expect(regulationClockForPhase(coreEnd, { seed:11 }).label).toBe('45');
    expect(regulationClockForPhase(coreEnd + 1, { seed:11 }).label).toBe('45+1');
    expect(regulationClockForPhase(REGULATION_HALF_PHASES, { seed:11 }).label).toBe(`45+${added}`);
  });

  it('starts the second half at exactly 45 rather than jumping to 46', () => {
    expect(regulationClockForPhase(REGULATION_HALF_PHASES, { seed:44, secondHalfStarted:true }).label).toBe('45');
    expect(regulationClockForPhase(REGULATION_HALF_PHASES + 1, { seed:44 }).label).toBe('45');
  });

  it('renders the end of regulation as 90+N', () => {
    const added = regulationAddedTime(71, 2);
    expect(regulationClockForPhase(120, { seed:71 }).label).toBe(`90+${added}`);
  });

  it('defines football period restart anchors for future extra-time presentation', () => {
    expect(periodStartMinute('second')).toBe(45);
    expect(periodStartMinute('extra_first')).toBe(90);
    expect(periodStartMinute('extra_second')).toBe(105);
    expect(periodClock('extra_first').label).toBe('90');
    expect(periodClock('extra_second').label).toBe('105');
  });
});
