import { describe, expect, it } from 'vitest';

import {
  COMPETITION_RULES,
  buildLeaguePhaseVenuePlan,
  finishLeaguePhase,
  getLeaguePhaseQualification,
  getUefaKnockoutOpponentSeeds,
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

  it('models all three UEFA competitions as 36-team balanced league phases', () => {
    expect(COMPETITION_RULES.ucl.leaguePhase).toMatchObject({ teams:36, matches:8, homeMatches:4, awayMatches:4 });
    expect(COMPETITION_RULES.uel.leaguePhase).toMatchObject({ teams:36, matches:8, homeMatches:4, awayMatches:4 });
    expect(COMPETITION_RULES.uecl.leaguePhase).toMatchObject({ teams:36, matches:6, homeMatches:3, awayMatches:3 });
  });

  it('routes positions 1-8 direct, 9-24 to play-offs, and 25-36 out', () => {
    expect(getLeaguePhaseQualification('ucl', 1)).toMatchObject({ route:'direct', roundIndex:2, status:'active' });
    expect(getLeaguePhaseQualification('ucl', 8)).toMatchObject({ route:'direct', roundIndex:2, status:'active' });
    expect(getLeaguePhaseQualification('ucl', 9)).toMatchObject({ route:'playoff', roundIndex:0, status:'active' });
    expect(getLeaguePhaseQualification('ucl', 24)).toMatchObject({ route:'playoff', roundIndex:0, status:'active' });
    expect(getLeaguePhaseQualification('ucl', 25)).toMatchObject({ route:'eliminated', status:'eliminated' });
    expect(getLeaguePhaseQualification('ucl', 36)).toMatchObject({ route:'eliminated', status:'eliminated' });
  });

  it('turns UEFA league-phase rank into the correct return-leg venue advantage', () => {
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

    expect(getUefaKnockoutSeeding('ucl', 3, 'QF (Leg 1)'))
      .toEqual({ seeded:true, secondLegHome:true });
    expect(getUefaKnockoutSeeding('uel', 5, 'QF (Leg 2)'))
      .toEqual({ seeded:false, secondLegHome:false });
    expect(getUefaKnockoutSeeding('uecl', 17, 'QF (Leg 1)'))
      .toEqual({ seeded:null, secondLegHome:null });

    expect(getUefaKnockoutSeeding('ucl', 1, 'SF (Leg 1)'))
      .toEqual({ seeded:true, secondLegHome:true });
    expect(getUefaKnockoutSeeding('ucl', 3, 'SF (Leg 2)'))
      .toEqual({ seeded:false, secondLegHome:false });
    expect(getUefaKnockoutSeeding('ucl', 17, 'SF (Leg 1)'))
      .toEqual({ seeded:null, secondLegHome:null });
    expect(getUefaKnockoutSeeding('ucl', 1, 'Final'))
      .toEqual({ seeded:null, secondLegHome:null });
  });

  it('encodes the official knockout play-off pairing bands', () => {
    expect(getUefaKnockoutOpponentSeeds('ucl', 9, 'Knockout Play-off (Leg 1)')).toEqual([23, 24]);
    expect(getUefaKnockoutOpponentSeeds('ucl', 10, 'Knockout Play-off (Leg 2)')).toEqual([23, 24]);
    expect(getUefaKnockoutOpponentSeeds('uel', 12, 'Knockout Play-off (Leg 1)')).toEqual([21, 22]);
    expect(getUefaKnockoutOpponentSeeds('uecl', 14, 'Knockout Play-off (Leg 1)')).toEqual([19, 20]);
    expect(getUefaKnockoutOpponentSeeds('ucl', 16, 'Knockout Play-off (Leg 1)')).toEqual([17, 18]);
    expect(getUefaKnockoutOpponentSeeds('ucl', 18, 'Knockout Play-off (Leg 1)')).toEqual([15, 16]);
    expect(getUefaKnockoutOpponentSeeds('ucl', 20, 'Knockout Play-off (Leg 1)')).toEqual([13, 14]);
    expect(getUefaKnockoutOpponentSeeds('ucl', 22, 'Knockout Play-off (Leg 1)')).toEqual([11, 12]);
    expect(getUefaKnockoutOpponentSeeds('ucl', 24, 'Knockout Play-off (Leg 1)')).toEqual([9, 10]);
  });

  it('encodes both sides of the round-of-16 bracket paths', () => {
    expect(getUefaKnockoutOpponentSeeds('ucl', 1, 'R16 (Leg 1)')).toEqual([15, 16, 17, 18]);
    expect(getUefaKnockoutOpponentSeeds('ucl', 3, 'R16 (Leg 1)')).toEqual([13, 14, 19, 20]);
    expect(getUefaKnockoutOpponentSeeds('ucl', 5, 'R16 (Leg 1)')).toEqual([11, 12, 21, 22]);
    expect(getUefaKnockoutOpponentSeeds('ucl', 7, 'R16 (Leg 1)')).toEqual([9, 10, 23, 24]);
    expect(getUefaKnockoutOpponentSeeds('ucl', 9, 'R16 (Leg 1)')).toEqual([7, 8]);
    expect(getUefaKnockoutOpponentSeeds('ucl', 11, 'R16 (Leg 1)')).toEqual([5, 6]);
    expect(getUefaKnockoutOpponentSeeds('ucl', 13, 'R16 (Leg 1)')).toEqual([3, 4]);
    expect(getUefaKnockoutOpponentSeeds('ucl', 15, 'R16 (Leg 1)')).toEqual([1, 2]);
    expect(getUefaKnockoutOpponentSeeds('ucl', 25, 'R16 (Leg 1)')).toEqual([]);
  });

  it('builds UEFA-compliant home/away league-phase sequences', () => {
    const plans = [
      buildLeaguePhaseVenuePlan('ucl', () => 0),
      buildLeaguePhaseVenuePlan('ucl', () => 0.99),
      buildLeaguePhaseVenuePlan('uel', () => 0.42),
      buildLeaguePhaseVenuePlan('uecl', () => 0.75),
    ];

    for (const plan of plans) {
      const expectedHomes = plan.length === 6 ? 3 : 4;
      expect(plan.filter(Boolean)).toHaveLength(expectedHomes);
      expect(plan[0]).not.toBe(plan[1]);
      expect(plan.at(-2)).not.toBe(plan.at(-1));
      for (let index = 2; index < plan.length; index++) {
        expect(plan[index] === plan[index - 1] && plan[index] === plan[index - 2]).toBe(false);
      }
    }
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
