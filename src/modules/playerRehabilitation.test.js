import { describe, expect, it } from 'vitest';
import {
  createRehabilitationState,
  ensureRehabilitation,
  markMedicallyAvailable,
  rehabilitationReinjuryMultiplier,
  rehabilitationSelectionWarning,
  setEarlyReturn,
  settleRehabilitation,
} from './playerRehabilitation.js';

function injured(overrides = {}) {
  return {
    id:'injured', position:'CM', age:25, injured:true,
    injuryName:'Hamstring Strain', injuryType:'muscle', injuryGWsLeft:1, injuryGWsTotal:3,
    fitness:45, minutes:400,
    ...overrides,
  };
}

describe('P3 rehabilitation state path', () => {
  it('enters rehabilitation late in medical absence without making the player available', () => {
    const subject = ensureRehabilitation(injured());
    expect(subject.rehabilitation.status).toBe('rehabilitation');
    expect(subject.rehabilitation.medicallyAvailable).toBe(false);
    expect(rehabilitationSelectionWarning(subject)).toContain('unavailable');
  });

  it('moves recovery into medically available/high-risk instead of instant 100% fit', () => {
    const withRehab = ensureRehabilitation(injured());
    const recovered = markMedicallyAvailable({ ...withRehab, injured:false, injuryGWsLeft:0 });
    expect(recovered.rehabilitation.status).toBe('available_high_risk');
    expect(recovered.rehabilitation.matchReadiness).toBeLessThan(100);
    expect(recovered.rehabilitation.medicallyAvailable).toBe(true);
    expect(rehabilitationReinjuryMultiplier(recovered)).toBeGreaterThan(1);
  });

  it('supports an explicit early-return choice only when medically available', () => {
    const unavailable = ensureRehabilitation(injured());
    expect(setEarlyReturn(unavailable, true)).toBe(unavailable);

    const available = markMedicallyAvailable({ ...unavailable, injured:false });
    const early = setEarlyReturn(available, true);
    expect(early.rehabilitation.earlyReturn).toBe(true);
    expect(rehabilitationReinjuryMultiplier(early)).toBeGreaterThan(rehabilitationReinjuryMultiplier(available));
    expect(rehabilitationSelectionWarning(early)).toContain('Early return');
  });

  it('advances once per world week and eventually reaches match fit', () => {
    let subject = markMedicallyAvailable({ ...injured(), injured:false, rehabilitation:createRehabilitationState(injured(), 'rehabilitation') });
    for (let gw = 1; gw <= 8; gw++) {
      subject = settleRehabilitation(subject, gw, '2025/26');
    }
    expect(subject.rehabilitation.status).toBe('match_fit');
    expect(subject.rehabilitation.matchReadiness).toBe(100);
    const sameWeek = settleRehabilitation(subject, 8, '2025/26');
    expect(sameWeek).toBe(subject);
  });

  it('does not advance the same rehabilitation week twice after reload', () => {
    const available = markMedicallyAvailable({ ...injured(), injured:false });
    const once = settleRehabilitation(available, 4, '2025/26');
    const twice = settleRehabilitation(once, 4, '2025/26');
    expect(twice).toBe(once);
    expect(twice.rehabilitation.matchReadiness).toBe(once.rehabilitation.matchReadiness);
  });
});
