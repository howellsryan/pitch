import { describe, expect, it } from 'vitest';
import {
  advanceAcademyEvidence,
  advanceYouthScoutingState,
  applyLoanDevelopmentReport,
  academyEvidenceFor,
  academyReadiness,
  buildLoanDevelopmentReport,
  createAcademyPathwaysState,
  createYouthScoutingAssignment,
  loanDestinationProjection,
} from './academyPathways.js';
import { normalizePlayerStatus } from './playerStatus.js';

function academy(overrides = {}) {
  return normalizePlayerStatus({
    id:'academy_1', name:'Academy One', position:'CM', age:17,
    teamId:'club', youthTeamId:'club', isYouth:true, inSquad:false,
    attack:60, midfield:66, defence:58, goalkeeping:20, potentialRating:84,
    fitness:100, form:50, individualMorale:60, sharpness:60,
    appearances:0, starts:0, minutes:0, ratingTotal:0, ratingApps:0,
    ...overrides,
  });
}

function team(id, overrides = {}) {
  return {
    id, name:id, reputation:68, budget:10_000_000,
    coaching:{ attack:{quality:70}, midfield:{quality:72}, defence:{quality:68}, goalkeeping:{quality:65} },
    facilities:{ training:{level:2}, medical:{level:1}, scouting:{level:2} },
    ...overrides,
  };
}

describe('P9 academy evidence', () => {
  it('records aggregate academy evidence without changing senior P1 stats and replays as a no-op', () => {
    const before = academy();
    const settled = advanceAcademyEvidence(before, {
      season:'2025/26', gameweek:2, coachingMultiplier:1.04, trainingMultiplier:1.03,
    });
    expect(settled.appearances).toBe(0);
    expect(settled.minutes).toBe(0);
    expect(settled.academyEvidence.lastWeekKey).toBe('2025/26:2');
    expect(advanceAcademyEvidence(settled, { season:'2025/26', gameweek:2 })).toBe(settled);
    expect(academyEvidenceFor(settled, '2025/26').appearances).toBeGreaterThanOrEqual(0);
  });

  it('produces an explainable readiness projection from level and academy evidence', () => {
    const player = academy({
      midfield:72,
      academyEvidence:{ season:'2025/26', appearances:10, starts:8, minutes:760, ratingTotal:71, ratingApps:10, averageRating:7.1, lastRating:7.3 },
    });
    const readiness = academyReadiness(player);
    expect(readiness.score).toBeGreaterThan(50);
    expect(readiness.potential.min).toBeGreaterThanOrEqual(72);
    expect(readiness.evidenceMinutes).toBe(760);
  });
});

describe('P9 regional youth scouting', () => {
  it('progresses a bounded assignment once per week and finishes with an uncertain calibrated report', () => {
    let state = createYouthScoutingAssignment(createAcademyPathwaysState(), {
      region:'South America', positionGroup:'ATT', role:'inside_forward', style:'technical', targetWeeks:2,
    }, { teamId:'club', season:'2025/26', gameweek:1 });
    let advanced = advanceYouthScoutingState(state, {
      season:'2025/26', gameweek:1, reputation:75, academyInvestment:50, scoutingLevel:2,
    });
    state = advanced.state;
    expect(advanced.completed).toHaveLength(0);
    const replay = advanceYouthScoutingState(state, { season:'2025/26', gameweek:1 });
    expect(replay.alreadyProcessed).toBe(true);
    advanced = advanceYouthScoutingState(state, {
      season:'2025/26', gameweek:2, reputation:75, academyInvestment:50, scoutingLevel:2,
    });
    expect(advanced.completed).toHaveLength(1);
    expect(advanced.completed[0].report.positionGroup).toBe('ATT');
    expect(advanced.completed[0].report.potentialBand.max).toBeGreaterThan(advanced.completed[0].report.potentialBand.min);
  });
});

describe('P9 loan pathways', () => {
  const loan = normalizePlayerStatus({
    id:'loan_1', name:'Loan One', position:'CM', age:20,
    teamId:'loan_club', onLoan:true, loanedFrom:'parent', loanOriginalTeamId:'parent',
    attack:60, midfield:69, defence:62, goalkeeping:20, potentialRating:82,
    appearances:6, starts:4, minutes:390, ratingTotal:41.2, ratingApps:6,
    wage:8_000, inSquad:true,
    activeLoanAgreement:{
      id:'deal_loan_1', parentTeamId:'parent', loanTeamId:'loan_club', startSeason:'2025/26', startGameweek:1,
      expectedRole:'rotation', recallAllowed:true,
      baselineStats:{ appearances:2, starts:1, minutes:100, goals:0, assists:0, cleanSheets:0, ratingTotal:13, ratingApps:2 },
      lastReportStats:{ appearances:2, starts:1, minutes:100, goals:0, assists:0, cleanSheets:0, ratingTotal:13, ratingApps:2 },
    },
  });

  it('compares destination fit using squad opportunity plus coaching/facilities instead of a flat growth bonus', () => {
    const destination = team('candidate');
    const projection = loanDestinationProjection(loan, destination, [
      { ...academy({ id:'senior_a', isYouth:false, youthTeamId:null, teamId:'candidate', inSquad:true, age:25, midfield:72 }), playerStatus:'first_team', contractTeamId:'candidate', registeredTeamId:'candidate' },
    ], { weekKey:'2025/26:4' });
    expect(projection.teamId).toBe('candidate');
    expect(projection.expectedMinutes).toBeGreaterThan(0);
    expect(projection.pathwayScore).toBeGreaterThan(0);
    expect(projection.coaching).toBeGreaterThan(0);
    expect(projection.facilities).toBeGreaterThan(0);
  });

  it('reports only real senior evidence and advances the report baseline idempotently', () => {
    const report = buildLoanDevelopmentReport(loan, { season:'2025/26', gameweek:5 });
    expect(report.appearances).toBe(4);
    expect(report.minutes).toBe(290);
    expect(report.seasonLoanMinutes).toBe(290);
    const withReport = applyLoanDevelopmentReport(loan, report);
    expect(withReport.loanReports).toHaveLength(1);
    expect(withReport.activeLoanAgreement.lastReportWeekKey).toBe('2025/26:5');
    expect(applyLoanDevelopmentReport(withReport, report)).toBe(withReport);
  });
});
