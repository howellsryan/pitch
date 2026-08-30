import { describe, expect, it } from 'vitest';

import {
  COMPETITION_RULES,
  finishLeaguePhase,
  getLeaguePhaseQualification,
  getUefaKnockoutSeeding,
  isTwoLegRound,
  resolveTwoLegTie,
} from './competitionRules.js';

describe('P0 competition rules', () => {
  it('never applies away goals to a level two-legged tie', () => {
    const leg1 = { userGoals: 0, oppGoals: 1, userIsHome: true };
    const leg2 = { userGoals: 2, oppGoals: 1, userIsHome: false };

    const outcome = resolveTwoLegTie(leg1, leg2, () => 0.2);

    expect(outcome.userAgg).toBe(2);
    expect(outcome.oppAgg).toBe(2);
    expect(outcome.penalties).toBe(true);
    expect(outcome.extraTime).toBe(true);
    expect(outcome.userWon).toBe(true);
  });

  it('models all three UEFA competitions as 36-team league phases', () => {
    expect(COMPETITION_RULES.ucl.leaguePhase).toMatchObject({ teams: 36, matches: 8 });
    expect(COMPETITION_RULES.uel.leaguePhase).toMatchObject({ teams: 36, matches: 8 });
    expect(COMPETITION_RULES.uecl.leaguePhase).toMatchObject({ teams: 36, matches: 6 });
  });

  it('routes positions 1-8 direct, 9-24 to play-offs, and 25-36 out', () => {
    expect(getLeaguePhaseQualification('ucl', 1)).toMatchObject({ route: 'direct', roundIndex: 2, status: 'active' });
    expect(getLeaguePhaseQualification('ucl', 8)).toMatchObject({ route: 'direct', roundIndex: 2, status: 'active' });
    expect(getLeaguePhaseQualification('ucl', 9)).toMatchObject({ route: 'playoff', roundIndex: 0, status: 'active' });
    expect(getLeaguePhaseQualification('ucl', 24)).toMatchObject({ route: 'playoff', roundIndex: 0, status: 'active' });
    expect(getLeaguePhaseQualification('ucl', 25)).toMatchObject({ route: 'eliminated', status: 'eliminated' });
    expect(getLeaguePhaseQualification('ucl', 36)).toMatchObject({ route: 'eliminated', status: 'eliminated' });
  });

  it('turns UEFA league-phase rank into the correct second-leg venue advantage', () => {
    expect(getUefaKnockoutSeeding('ucl', 9, 'Knockout Play-off (Leg 1)'))
      .toEqual({ seeded:true, secondLegHome:true });
    expect(getUefaKnockoutSeeding('ucl', 16, 'Knockout Play-off (Leg 2)'))
      .toEqual({ seeded:true, secondLegHome:true });
    expect(getUefaKnockoutSeeding('uel', 17, 'Knockout Play-off (Leg 1)'))
      .toEqual({ seeded:false, secondLegHome:false });
    expect(getUefaKnockoutSeeding('uecl', 24, 'Knockout Play-off (Leg 2)'))
      .toEqual({ seeded:false, secondLegHome:false });
    expect(getUefaKnockoutSeeding('ucl', 1, 'R16 (Leg 1)'))
      .toEqual({ seeded:true, secondLegHome:true });
    expect(getUefaKnockoutSeeding('ucl', 8, 'R16 (Leg 2)'))
      .toEqual({ seeded:true, secondLegHome:true });
    expect(getUefaKnockoutSeeding('ucl', 17, 'R16 (Leg 1)'))
      .toEqual({ seeded:false, secondLegHome:false });
    expect(getUefaKnockoutSeeding('uel', 24, 'R16 (Leg 2)'))
      .toEqual({ seeded:false, secondLegHome:false });
    expect(getUefaKnockoutSeeding('ucl', 3, 'QF (Leg 1)'))
      .toEqual({ seeded:null, secondLegHome:null });
  });

  it('recognises configured domestic and European two-legged rounds', () => {
    expect(isTwoLegRound('league_cup', 'SF (Leg 1)', 1)).toBe(true);
    expect(isTwoLegRound('copa_del_rey', 'SF (Leg 2)', 2)).toBe(true);
    expect(isTwoLegRound('ucl', 'R16 (Leg 1)', 1)).toBe(true);
    expect(isTwoLegRound('fa_cup', 'SF', 1)).toBe(false);
  });

  it('produces a 36-row final league-phase table and qualification route', () => {
    const phase = { points: 24, gf: 18, ga: 4, gd: 14 };
    const result = finishLeaguePhase('ucl', phase, 'arsenal', () => 0.5);

    expect(result.table).toHaveLength(36);
    expect(result.position).toBeGreaterThanOrEqual(1);
    expect(result.position).toBeLessThanOrEqual(36);
    expect(['direct', 'playoff', 'eliminated']).toContain(result.route);
  });

  it('records the audited no-replay FA Cup and corrected third-round Championship entry', () => {
    expect(COMPETITION_RULES.fa_cup.replay).toBe(false);
    expect(COMPETITION_RULES.fa_cup.entryRound.Championship).toBe(2);
  });
});
