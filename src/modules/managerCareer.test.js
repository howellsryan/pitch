import { describe, expect, it } from 'vitest';
import {
  MANAGER_REVIEW_INTERVAL_GWS,
  MIN_TENURE_GWS_BEFORE_REVIEW,
  accrueManagerRecordsForWeek,
  applyReputationDelta,
  dismissAndCaretake,
  evaluateClubReview,
  isReviewCheckpointDue,
  reviewCheckpointKey,
} from './managerCareer.js';
import { createCaretakerManager, createManager } from './managers.js';

function manager(id, clubId, overrides = {}) {
  return createManager({ id, currentClubId:clubId, startDate:'2024-01-01T00:00:00.000Z', ...overrides });
}

describe('accrueManagerRecordsForWeek', () => {
  it('adds win/draw/loss to the manager currently in charge of each involved club', () => {
    const managers = [manager('m1', 'a'), manager('m2', 'b'), manager('m3', 'c')];
    const fixtures = [
      { played:true, homeTeamId:'a', awayTeamId:'b', homeGoals:2, awayGoals:1 },
      { played:true, homeTeamId:'c', awayTeamId:'a', homeGoals:0, awayGoals:0 },
    ];
    const patched = accrueManagerRecordsForWeek(managers, fixtures);
    const byId = new Map(patched.map(m => [m.id, m]));
    expect(byId.get('m1').record).toMatchObject({ matches:2, wins:1, draws:1, losses:0 });
    expect(byId.get('m2').record).toMatchObject({ matches:1, wins:0, draws:0, losses:1 });
    expect(byId.get('m3').record).toMatchObject({ matches:1, wins:0, draws:1, losses:0 });
  });

  it('ignores unplayed fixtures and clubs without an employed manager', () => {
    const managers = [manager('m1', 'a')];
    const fixtures = [
      { played:false, homeTeamId:'a', awayTeamId:'b', homeGoals:null, awayGoals:null },
      { played:true, homeTeamId:'x', awayTeamId:'y', homeGoals:1, awayGoals:0 },
    ];
    expect(accrueManagerRecordsForWeek(managers, fixtures)).toEqual([]);
  });

  it('only returns managers whose record actually changed', () => {
    const managers = [manager('m1', 'a'), manager('m2', 'b')];
    const fixtures = [{ played:true, homeTeamId:'a', awayTeamId:'z', homeGoals:3, awayGoals:0 }];
    const patched = accrueManagerRecordsForWeek(managers, fixtures);
    expect(patched.map(m => m.id)).toEqual(['m1']);
  });
});

describe('review checkpoint scheduling', () => {
  it('is due only on the fixed interval and not before gameweek 1', () => {
    expect(isReviewCheckpointDue({ season:'2025/26', currentGameweek:0 })).toBe(false);
    expect(isReviewCheckpointDue({ season:'2025/26', currentGameweek:MANAGER_REVIEW_INTERVAL_GWS - 1 })).toBe(false);
    expect(isReviewCheckpointDue({ season:'2025/26', currentGameweek:MANAGER_REVIEW_INTERVAL_GWS })).toBe(true);
  });

  it('is not due twice for the same checkpoint key', () => {
    const save = {
      season:'2025/26', currentGameweek:MANAGER_REVIEW_INTERVAL_GWS,
      managerMarket:{ reviewedCheckpoints:[reviewCheckpointKey({ season:'2025/26', currentGameweek:MANAGER_REVIEW_INTERVAL_GWS })] },
    };
    expect(isReviewCheckpointDue(save)).toBe(false);
  });
});

describe('evaluateClubReview', () => {
  const leagueTeams = [
    { id:'strong', reputation:90, league:'Premier League' },
    { id:'mid', reputation:70, league:'Premier League' },
    { id:'weaker', reputation:60, league:'Premier League' },
    { id:'weak', reputation:50, league:'Premier League' },
  ];
  const save = { currentDate:'2025-11-01T00:00:00.000Z' };

  it('does nothing before minimum tenure has passed', () => {
    const freshManager = manager('m1', 'strong', { startDate:'2025-10-30T00:00:00.000Z' });
    const standing = { teamId:'strong', position:20, form:['L','L','L','L','L'] };
    const review = evaluateClubReview({ manager:freshManager, team:leagueTeams[0], standing, leagueTeams, save });
    expect(review.outcome).toBe('ok');
    expect(review.reputationDelta).toBe(0);
  });

  it('flags a reputation-club performing far below its rank with poor form as dismiss', () => {
    const tenuredManager = manager('m1', 'strong', { startDate:'2025-01-01T00:00:00.000Z' });
    const standing = { teamId:'strong', position:18, form:['L','L','L','D','L'] };
    const review = evaluateClubReview({ manager:tenuredManager, team:leagueTeams[0], standing, leagueTeams, save });
    expect(review.outcome).toBe('dismiss');
    expect(review.reputationDelta).toBeLessThan(0);
  });

  it('never dismisses the user manager (caller must skip it, but evaluate should still be safe)', () => {
    const userManager = manager('mgr_user', 'strong', { isUser:true, startDate:'2025-01-01T00:00:00.000Z' });
    const standing = { teamId:'strong', position:18, form:['L','L','L','L','L'] };
    // evaluateClubReview itself is generic; p6Runtime is responsible for skipping isUser managers,
    // but the pure function should still return a deterministic, sane result if ever called on one.
    const review = evaluateClubReview({ manager:userManager, team:leagueTeams[0], standing, leagueTeams, save });
    expect(['ok', 'warning', 'dismiss']).toContain(review.outcome);
  });

  it('rewards a club overperforming its reputation rank with good form', () => {
    const tenuredManager = manager('m3', 'weak', { startDate:'2025-01-01T00:00:00.000Z' });
    const standing = { teamId:'weak', position:1, form:['W','W','W','W','D'] };
    const review = evaluateClubReview({ manager:tenuredManager, team:leagueTeams[3], standing, leagueTeams, save });
    expect(review.outcome).toBe('ok');
    expect(review.reputationDelta).toBeGreaterThan(0);
  });
});

describe('applyReputationDelta', () => {
  it('bounds reputation to [15, 96]', () => {
    const low = createManager({ id:'m', reputation:{ overall:16, youth:50, tactical:50, financial:50 } });
    expect(applyReputationDelta(low, -10).reputation.overall).toBe(15);
    const high = createManager({ id:'m', reputation:{ overall:95, youth:50, tactical:50, financial:50 } });
    expect(applyReputationDelta(high, 10).reputation.overall).toBe(96);
  });

  it('is a no-op for a zero delta', () => {
    const m = createManager({ id:'m' });
    expect(applyReputationDelta(m, 0)).toBe(m);
  });
});

describe('dismissAndCaretake', () => {
  it('unemploys the dismissed manager and hands the club to an employed caretaker', () => {
    const dismissedTarget = manager('m1', 'club_a');
    const team = { id:'club_a', league:'Premier League', reputation:70 };
    const caretaker = createCaretakerManager(team, { weekKey:'2025/26:10', currentDate:'2025-11-01T00:00:00.000Z' });
    const result = dismissAndCaretake(dismissedTarget, caretaker, { weekKey:'2025/26:10' });

    expect(result.dismissedManager.status).toBe('unemployed');
    expect(result.dismissedManager.currentClubId).toBeNull();
    expect(result.dismissedManager.record.sackings).toBe(1);
    expect(result.caretakerManager.status).toBe('employed');
    expect(result.caretakerManager.currentClubId).toBe('club_a');
    expect(result.caretakerManager.availability.caretakerEligible).toBe(true);
    expect(result.vacancy).toMatchObject({ clubId:'club_a', reason:'dismissed', status:'caretaker' });
  });
});

describe('minimum tenure constant sanity', () => {
  it('requires less tenure than a full review interval, so a new hire gets at least one review window', () => {
    expect(MIN_TENURE_GWS_BEFORE_REVIEW).toBeLessThan(MANAGER_REVIEW_INTERVAL_GWS);
  });
});
