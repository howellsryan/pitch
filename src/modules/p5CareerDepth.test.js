import { describe, expect, it } from 'vitest';

import { buildCoachCandidates, coachingEffects, withDefaultCoaching } from './coaching.js';
import { settlePlayerDevelopment } from './playerDevelopment.js';
import { applyMedicalFacilityMultiplier, buildP5CareerDepthBackfill, refreshPlanContext } from './p5Runtime.js';
import { advanceScoutingState, createScoutingAssignment, createScoutingState, latestScoutingReport } from './scouting.js';
import { projectScoutedPlayerView } from './scoutingView.js';
import { buildSquadNeeds, rankStandoutRecruitmentCandidates } from './squadPlanning.js';
import { createDevelopmentPlan, developmentPlanAttributePreference, developmentPlanProgressMultiplier, effectiveDevelopmentPlan } from './training.js';

function player(id, teamId, position, rating, extra = {}) {
  const fields = { attack:45, midfield:45, defence:45, goalkeeping:10 };
  if (position === 'GK') fields.goalkeeping = rating;
  else if (['CB','RB','LB'].includes(position)) fields.defence = rating;
  else if (['ST','CF','RW','LW'].includes(position)) fields.attack = rating;
  else fields.midfield = rating;
  return {
    id, name:`Player ${id}`, teamId, position, age:22, value:12_000_000, wage:25_000,
    fitness:100, form:50, individualMorale:50, sharpness:55, appearances:4, minutes:280,
    developmentAppearances:3, developmentMinutes:200, potentialRating:84,
    positionSuitability:{ [position]:1 }, traits:[], ...fields, ...extra,
  };
}

describe('P5 coaching, training, scouting and squad planning', () => {
  it('creates deterministic four-department coaching with bounded effects', () => {
    const club = withDefaultCoaching({ id:'club', reputation:78, budget:50_000_000 });
    expect(Object.keys(club.coaching).sort()).toEqual(['attack','defence','goalkeeping','midfield']);
    const effect = coachingEffects(club, player('cb', 'club', 'CB', 72));
    expect(effect.department).toBe('defence');
    expect(effect.development).toBeGreaterThanOrEqual(.91);
    expect(effect.development).toBeLessThanOrEqual(1.09);
    expect(buildCoachCandidates(club, 'defence', '2025/26', 4)).toEqual(buildCoachCandidates(club, 'defence', '2025/26', 4));
  });

  it('keeps development on the P3 weekly boundary while training changes focus and efficiency', () => {
    const base = player('st', 'club', 'ST', 70, { developmentProgress:14, growthPoints:14 });
    const finishingPlan = createDevelopmentPlan('finishing', base, { teamId:'club', weekKey:'2025/26:3' });
    const planned = { ...base, developmentPlan:{ ...finishingPlan, coachingMultiplier:1.09 } };
    expect(developmentPlanAttributePreference(planned)).toBe('attack');
    expect(developmentPlanProgressMultiplier(planned, 1.09)).toBeGreaterThan(1);
    const settled = settlePlayerDevelopment(planned, 4, '2025/26');
    expect(settled.developmentSettledKey).toBe('2025/26:4');
    expect(settlePlayerDevelopment(settled, 4, '2025/26')).toBe(settled);
  });

  it('automatically overrides an injured player to recovery without deleting the manager plan', () => {
    const base = player('inj', 'club', 'CM', 68, { injured:true });
    const plan = createDevelopmentPlan('creation', base, { teamId:'club' });
    const subject = { ...base, developmentPlan:plan };
    expect(effectiveDevelopmentPlan(subject).id).toBe('recovery');
    expect(subject.developmentPlan.id).toBe('creation');
  });

  it('advances scouting exactly once per week and stores observations rather than true attributes', () => {
    const userTeam = withDefaultCoaching({ id:'user', reputation:74, league:'Premier League' });
    const seller = { id:'seller', reputation:70, league:'Premier League' };
    const target = player('target', 'seller', 'ST', 73, { potentialRating:89 });
    let state = createScoutingState();
    state = createScoutingAssignment(state, { type:'player', playerId:'target' }, { season:'2025/26', gameweek:2 });
    const context = {
      season:'2025/26', gameweek:3, players:[target], userTeam,
      teamsById:new Map([['user',userTeam],['seller',seller]]), valueFor:p => p.value,
    };
    const first = advanceScoutingState(state, context);
    const report = latestScoutingReport(first.state, 'target');
    expect(first.alreadyProcessed).toBe(false);
    expect(report.current.min).toBeLessThanOrEqual(report.current.max);
    expect(report.future.min).toBeLessThanOrEqual(report.future.max);
    expect(report.financial.feeMin).toBeLessThan(report.financial.feeMax);
    expect((report.financial.feeMin + report.financial.feeMax) / 2).not.toBe(target.value);
    expect(report).not.toHaveProperty('attack');
    expect(report).not.toHaveProperty('potentialRating');
    const replay = advanceScoutingState(first.state, context);
    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.state).toEqual(first.state);
  });

  it('projects one-to-three-season succession risks and academy/loan pathways in the shared planner', () => {
    const team = { id:'club', reputation:70, budget:40_000_000, league:'Premier League', youthPlayers:[player('academy', 'academy', 'CB', 66, { age:18 })] };
    const squad = [
      player('gk1','club','GK',70), player('gk2','club','GK',62),
      ...Array.from({ length:7 }, (_, i) => player(`d${i}`,'club','CB',68,{ contractExpiry:i < 3 ? 2026 : 2029, age:i < 2 ? 32 : 25 })),
      ...Array.from({ length:7 }, (_, i) => player(`m${i}`,'club','CM',69)),
      ...Array.from({ length:4 }, (_, i) => player(`a${i}`,'club','ST',70)),
      player('loan-return','other','CB',67,{ onLoan:true, loanOriginalTeamId:'club' }),
    ];
    const needs = buildSquadNeeds(team, squad, { season:'2025/26', currentYear:2025 });
    const defence = needs.find(need => need.group === 'DEF');
    expect(defence.future).toHaveLength(3);
    expect(defence.future.some(row => row.loanReturns > 0)).toBe(true);
    expect(defence.reasons).toEqual(expect.arrayContaining(['contract_risk']));
  });

  it('uses supplied scouting knowledge for standout recruitment instead of hidden potential', () => {
    const buyer = { id:'buyer', reputation:75, budget:60_000_000, league:'Premier League' };
    const buyerSquad = Array.from({ length:20 }, (_, i) => player(`b${i}`, 'buyer', 'CM', 70));
    const hiddenStar = player('hidden', 'seller', 'ST', 69, { age:20, potentialRating:96 });
    const observedStar = player('observed', 'seller', 'ST', 69, { age:20, potentialRating:72 });
    const observations = {
      hidden:{ confidence:.75, current:{ min:67, max:71 }, future:{ min:70, max:74 } },
      observed:{ confidence:.75, current:{ min:68, max:72 }, future:{ min:86, max:90 } },
    };
    const ranked = rankStandoutRecruitmentCandidates({
      buyer, buyerSquad, players:[hiddenStar, observedStar], marketValueFor:p => p.value,
      canSign:() => true, likelihoodFor:() => 70, observationFor:p => observations[p.id],
    });
    expect(ranked.map(item => item.player.id)).toEqual(['observed']);
  });

  it('gives runtime AI recruitment bounded observations when world context is present', () => {
    const buyer = { id:'buyer', reputation:95, budget:80_000_000, league:'Premier League' };
    const seller = { id:'seller', reputation:72, league:'Premier League' };
    const buyerSquad = Array.from({ length:20 }, (_, i) => player(`runtime-b${i}`, 'buyer', 'CM', 70));
    const candidate = player('runtime', 'seller', 'ST', 82, { age:20, transferListed:true, potentialRating:98 });
    const ranked = rankStandoutRecruitmentCandidates({
      buyer, buyerSquad, players:[candidate], teamsById:new Map([['buyer',buyer],['seller',seller]]),
      marketValueFor:p => p.value, canSign:() => true, likelihoodFor:() => 80,
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].observation).toBeTruthy();
    expect(ranked[0].observation.confidence).toBeLessThan(1);
    expect(ranked[0].observation.current.min).toBeLessThan(ranked[0].observation.current.max);
  });

  it('projects the user market from scouting ranges without mutating the canonical player', () => {
    const userTeam = withDefaultCoaching({ id:'user', reputation:75, league:'Premier League' });
    const seller = { id:'seller', reputation:70, league:'Premier League' };
    const canonical = player('projection', 'seller', 'ST', 76, { potentialRating:94, value:24_000_000, wage:63_000 });
    const projected = projectScoutedPlayerView(canonical, createScoutingState(), {
      season:'2025/26', gameweek:5, userTeam,
      teamsById:new Map([['user',userTeam],['seller',seller]]), valueFor:p => p.value,
    });
    expect(projected.scoutingView).toBe(true);
    expect(projected.scoutingReport.current.min).toBeLessThan(projected.scoutingReport.current.max);
    expect(projected.scoutingReport.financial.feeMin).toBeLessThan(projected.scoutingReport.financial.feeMax);
    expect(projected.value).not.toBe(canonical.value);
    expect(projected.potentialRating).not.toBe(canonical.potentialRating);
    expect(canonical).not.toHaveProperty('scoutingView');
  });

  it('backfills existing careers with usable knowledge and club coaching without changing DB schema', () => {
    const save = { userTeamId:'user', season:'2025/26', currentGameweek:5 };
    const teams = [{ id:'user', reputation:75 }, { id:'ai', reputation:65 }];
    const migration = buildP5CareerDepthBackfill(save, teams);
    expect(migration.save.careerDepthVersion).toBe(1);
    expect(migration.save.scouting.defaultKnowledge).toBe(.68);
    expect(migration.teamPatches).toHaveLength(2);
    expect(migration.teamPatches.every(team => team.coachingVersion === 1)).toBe(true);
  });

  describe('P7 WP6: applyMedicalFacilityMultiplier', () => {
    it('is a no-op for a player with no rehabilitation', () => {
      const p = player('a', 'club', 'CB', 70);
      expect(applyMedicalFacilityMultiplier(p, 1.06)).toBe(p);
    });

    it('is a no-op once match_fit, even with an active multiplier passed in', () => {
      const p = player('a', 'club', 'CB', 70, { rehabilitation:{ status:'match_fit', matchReadiness:100 } });
      expect(applyMedicalFacilityMultiplier(p, 1.06)).toBe(p);
    });

    it('sets the multiplier for an actively rehabbing player', () => {
      const p = player('a', 'club', 'CB', 70, { rehabilitation:{ status:'available_high_risk', matchReadiness:60 } });
      const updated = applyMedicalFacilityMultiplier(p, 1.06);
      expect(updated).not.toBe(p);
      expect(updated.rehabilitation.facilityRecoveryMultiplier).toBe(1.06);
    });

    it('is idempotent — the same call twice returns the same reference the second time', () => {
      const p = player('a', 'club', 'CB', 70, { rehabilitation:{ status:'available_high_risk', matchReadiness:60 } });
      const once = applyMedicalFacilityMultiplier(p, 1.06);
      expect(applyMedicalFacilityMultiplier(once, 1.06)).toBe(once);
    });
  });

  describe('P7 WP6: refreshPlanContext folds training facility level into coachingMultiplier', () => {
    it('multiplies coaching quality by the team\'s training facility multiplier', () => {
      const base = player('st', 'club', 'ST', 70, { developmentProgress:0, growthPoints:0 });
      const plan = createDevelopmentPlan('finishing', base, { teamId:'club', weekKey:'2025/26:1' });
      const withPlan = { ...base, developmentPlan:plan };
      const baselineTeam = withDefaultCoaching({ id:'club', reputation:70, facilities:{ version:1, tracks:{ training:{ level:1, upgrading:null }, medical:{ level:1, upgrading:null }, scouting:{ level:1, upgrading:null } } } });
      const upgradedTeam = withDefaultCoaching({ id:'club', reputation:70, facilities:{ version:1, tracks:{ training:{ level:5, upgrading:null }, medical:{ level:1, upgrading:null }, scouting:{ level:1, upgrading:null } } } });

      const baseline = refreshPlanContext(withPlan, baselineTeam, '2025/26:2');
      const upgraded = refreshPlanContext(withPlan, upgradedTeam, '2025/26:2');
      expect(upgraded.developmentPlan.coachingMultiplier).toBeGreaterThan(baseline.developmentPlan.coachingMultiplier);
    });

    it('is unaffected by facility level for a team with no facilities field (pre-P7 safety)', () => {
      const base = player('st', 'club', 'ST', 70, { developmentProgress:0, growthPoints:0 });
      const plan = createDevelopmentPlan('finishing', base, { teamId:'club', weekKey:'2025/26:1' });
      const withPlan = { ...base, developmentPlan:plan };
      const team = withDefaultCoaching({ id:'club', reputation:70 });
      const effects = coachingEffects(team, withPlan);
      const result = refreshPlanContext(withPlan, team, '2025/26:2');
      expect(result.developmentPlan.coachingMultiplier).toBe(effects.development);
    });
  });
});
