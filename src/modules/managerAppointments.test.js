import { describe, expect, it } from 'vitest';
import {
  applyHireOutcome,
  assembleCandidates,
  completeHandover,
  extendOffer,
  isEligibleCandidate,
  isVacancyOpen,
  resolveOffer,
  scoreCandidateFit,
} from './managerAppointments.js';
import { createCaretakerManager, createManager } from './managers.js';

const vacancy = { id:'vac_a', clubId:'a', status:'caretaker' };
const team = { id:'a', league:'Premier League', reputation:75 };

describe('isEligibleCandidate', () => {
  it('accepts an unemployed manager', () => {
    expect(isEligibleCandidate(createManager({ id:'m', status:'unemployed' }), vacancy)).toBe(true);
  });

  it('accepts the vacancy own caretaker', () => {
    const caretaker = createCaretakerManager(team, { weekKey:'2025/26:10' });
    expect(isEligibleCandidate(caretaker, vacancy)).toBe(true);
  });

  it('rejects a manager employed elsewhere', () => {
    const employed = createManager({ id:'m', currentClubId:'other', status:'employed' });
    expect(isEligibleCandidate(employed, vacancy)).toBe(false);
  });

  it('rejects a caretaker of a different club', () => {
    const otherTeam = { id:'other', league:'La Liga', reputation:60 };
    const caretaker = createCaretakerManager(otherTeam, { weekKey:'2025/26:10' });
    expect(isEligibleCandidate(caretaker, vacancy)).toBe(false);
  });

  it('rejects null', () => {
    expect(isEligibleCandidate(null, vacancy)).toBe(false);
  });
});

describe('scoreCandidateFit', () => {
  it('is deterministic and bounded [0, 100]', () => {
    const manager = createManager({ id:'m', reputation:{ overall:70, youth:60, tactical:55, financial:50 }, record:{ matches:20, wins:12, draws:4, losses:4 } });
    const a = scoreCandidateFit(manager, team);
    const b = scoreCandidateFit(manager, team);
    expect(a).toEqual(b);
    expect(a.overall).toBeGreaterThanOrEqual(0);
    expect(a.overall).toBeLessThanOrEqual(100);
  });

  it('scores a closer reputation match higher than a mismatched one, all else equal', () => {
    const close = createManager({ id:'m1', reputation:{ overall:73, youth:50, tactical:50, financial:50 }, record:{ matches:10, wins:4, draws:3, losses:3 } });
    const mismatched = createManager({ id:'m2', reputation:{ overall:25, youth:50, tactical:50, financial:50 }, record:{ matches:10, wins:4, draws:3, losses:3 } });
    expect(scoreCandidateFit(close, team).overall).toBeGreaterThan(scoreCandidateFit(mismatched, team).overall);
  });

  it('defaults an untested manager to a neutral track record rather than zero', () => {
    const untested = createManager({ id:'m', reputation:{ overall:75, youth:50, tactical:50, financial:50 } });
    expect(scoreCandidateFit(untested, team).reasons.trackRecord).toBe(40);
  });

  it('a team without a philosophy field scores a neutral clubFit rather than penalising the candidate', () => {
    const manager = createManager({ id:'m', reputation:{ overall:70, youth:60, tactical:55, financial:50 } });
    expect(scoreCandidateFit(manager, team).reasons.clubFit).toBe(50);
  });

  it('prefers the manager whose reputation profile matches the club philosophy, all else equal', () => {
    const youthClub = { ...team, philosophy:{ version:1, traits:{ youthPathway:90, financialCaution:50, starRecruitment:50 } } };
    const youthAligned = createManager({ id:'m1', reputation:{ overall:70, youth:90, tactical:50, financial:50 }, record:{ matches:10, wins:4, draws:3, losses:3 } });
    const youthMismatched = createManager({ id:'m2', reputation:{ overall:70, youth:10, tactical:50, financial:50 }, record:{ matches:10, wins:4, draws:3, losses:3 } });
    expect(scoreCandidateFit(youthAligned, youthClub).overall).toBeGreaterThan(scoreCandidateFit(youthMismatched, youthClub).overall);
  });
});

describe('assembleCandidates', () => {
  it('ranks eligible candidates by fit and excludes ineligible/excluded ones', () => {
    const goodFit = createManager({ id:'good', currentClubId:null, status:'unemployed', reputation:{ overall:75, youth:60, tactical:60, financial:60 }, record:{ matches:20, wins:14, draws:3, losses:3 } });
    const poorFit = createManager({ id:'poor', currentClubId:null, status:'unemployed', reputation:{ overall:20, youth:20, tactical:20, financial:20 }, record:{ matches:20, wins:2, draws:2, losses:16 } });
    const ineligible = createManager({ id:'busy', currentClubId:'somewhere_else', status:'employed' });
    const pool = [poorFit, goodFit, ineligible];

    const candidates = assembleCandidates(vacancy, team, pool);
    expect(candidates.map(c => c.managerId)).toEqual(['good', 'poor']);

    const excluding = assembleCandidates(vacancy, team, pool, { excludeIds:['good'] });
    expect(excluding.map(c => c.managerId)).toEqual(['poor']);
  });
});

describe('offer lifecycle', () => {
  it('extends an offer with an idempotency key, then resolves accepted straight to completed', () => {
    const offered = extendOffer(vacancy, 'good', { weekKey:'2025/26:10' });
    expect(offered.status).toBe('offer_extended');
    expect(offered.offer.candidateManagerId).toBe('good');
    expect(offered.offer.idempotencyKey).toBe('vac_a:offer:2025/26:10');

    const accepted = resolveOffer(offered, 'accepted', { weekKey:'2025/26:10' });
    expect(accepted.status).toBe('completed');
  });

  it('a declined offer returns to candidates_assembled with the candidate excluded going forward', () => {
    const offered = extendOffer(vacancy, 'good', { weekKey:'2025/26:10' });
    const declined = resolveOffer(offered, 'declined', { weekKey:'2025/26:10' });
    expect(declined.status).toBe('candidates_assembled');
    expect(declined.declinedCandidateIds).toEqual(['good']);
    expect(declined.offer).toBeNull();
  });

  it('resolveOffer is a no-op without a pending offer', () => {
    expect(resolveOffer(vacancy, 'accepted')).toBe(vacancy);
  });

  it('extendOffer is a no-op on an already-completed vacancy', () => {
    const completed = { ...vacancy, status:'completed' };
    expect(extendOffer(completed, 'good', { weekKey:'x' })).toBe(completed);
  });

  it('extendOffer never overwrites an already-pending offer', () => {
    const offered = extendOffer(vacancy, 'good', { weekKey:'2025/26:10' });
    const reoffered = extendOffer(offered, 'someone_else', { weekKey:'2025/26:20' });
    expect(reoffered).toBe(offered);
    expect(reoffered.offer.candidateManagerId).toBe('good');
  });
});

describe('completeHandover', () => {
  it('marks the vacancy completed with the hired manager', () => {
    const result = completeHandover(vacancy, { hiredManagerId:'good', weekKey:'2025/26:10' });
    expect(result.status).toBe('completed');
    expect(result.hiredManagerId).toBe('good');
  });

  it('is idempotent — calling it again on an already-completed vacancy is a no-op', () => {
    const first = completeHandover(vacancy, { hiredManagerId:'good', weekKey:'2025/26:10' });
    const second = completeHandover(first, { hiredManagerId:'someone_else', weekKey:'2025/26:20' });
    expect(second).toBe(first);
    expect(second.hiredManagerId).toBe('good');
  });
});

describe('applyHireOutcome', () => {
  const vacancy = { id:'vac_a', clubId:'club_a', status:'completed', caretakerManagerId:'mgr_caretaker', resolvedWeekKey:'2025/26:10' };

  it('confirms the caretaker permanently without touching employment/history when they are the hire', () => {
    const caretaker = createManager({ id:'mgr_caretaker', currentClubId:'club_a', caretakerEligible:true });
    const { hiredManagerPatch, displacedCaretakerPatch } = applyHireOutcome({
      vacancy, hiredManagerId:'mgr_caretaker', hiredManager:caretaker, caretakerManager:caretaker, currentDate:'2025-11-01T00:00:00.000Z',
    });
    expect(hiredManagerPatch.availability.caretakerEligible).toBe(false);
    expect(hiredManagerPatch.currentClubId).toBe('club_a');
    expect(displacedCaretakerPatch).toBeNull();
  });

  it('moves an external hire to the club and displaces the caretaker back to unemployed', () => {
    const external = createManager({ id:'mgr_free_agent', status:'unemployed', currentClubId:null });
    const caretaker = createManager({ id:'mgr_caretaker', currentClubId:'club_a', caretakerEligible:true });
    const { hiredManagerPatch, displacedCaretakerPatch } = applyHireOutcome({
      vacancy, hiredManagerId:'mgr_free_agent', hiredManager:external, caretakerManager:caretaker, currentDate:'2025-11-01T00:00:00.000Z',
    });
    expect(hiredManagerPatch).toMatchObject({ status:'employed', currentClubId:'club_a' });
    expect(hiredManagerPatch.history.at(-1)).toMatchObject({ clubId:'club_a', startedWeekKey:'2025/26:10' });
    expect(displacedCaretakerPatch).toMatchObject({ status:'unemployed', currentClubId:null });
    expect(displacedCaretakerPatch.availability.caretakerEligible).toBe(false);
  });
});

describe('isVacancyOpen', () => {
  it('is true unless completed', () => {
    expect(isVacancyOpen(vacancy)).toBe(true);
    expect(isVacancyOpen({ ...vacancy, status:'completed' })).toBe(false);
    expect(isVacancyOpen(null)).toBeFalsy();
  });
});
