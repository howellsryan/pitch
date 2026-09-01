import { describe, expect, it } from 'vitest';

import {
  assessSquadSafety,
  buildSquadNeeds,
  rankRecruitmentCandidates,
  selectAIRecruitmentTarget,
  transferAvailableBudget,
} from './squadPlanning.js';

function player(id, teamId, position, rating, extra = {}) {
  const fields = { attack:45, midfield:45, defence:45, goalkeeping:10 };
  if (position === 'GK') fields.goalkeeping = rating;
  else if (['CB','RB','LB'].includes(position)) fields.defence = rating;
  else if (['ST','CF','RW','LW'].includes(position)) fields.attack = rating;
  else fields.midfield = rating;
  return {
    id, teamId, position, age:25, value:8_000_000, wage:30_000,
    fitness:100, form:50, individualMorale:50, sharpness:50,
    positionSuitability:{ [position]:1 }, traits:[], ...fields, ...extra,
  };
}

describe('P4 shared squad planning', () => {
  it('ranks a missing goalkeeper ahead of surplus attacking recruitment', () => {
    const team = { id:'club', reputation:72, budget:50_000_000, league:'Premier League' };
    const squad = [
      player('gk', 'club', 'GK', 67, { age:37, contractExpiry:2026 }),
      ...Array.from({ length:8 }, (_, i) => player(`d${i}`, 'club', i < 5 ? 'CB' : 'RB', 68)),
      ...Array.from({ length:8 }, (_, i) => player(`m${i}`, 'club', 'CM', 69)),
      ...Array.from({ length:5 }, (_, i) => player(`a${i}`, 'club', 'ST', 70)),
    ];

    const needs = buildSquadNeeds(team, squad, { currentYear:2025, season:'2025/26' });

    expect(needs[0].group).toBe('GK');
    expect(needs[0].reasons).toEqual(expect.arrayContaining(['coverage_shortfall','age_risk','contract_risk']));
    expect(needs.some(need => need.group === 'ATT' && need.reasons.includes('coverage_shortfall'))).toBe(false);
  });

  it('subtracts reserved deals from the same budget projection used by AI', () => {
    expect(transferAvailableBudget(
      { id:'club', budget:40_000_000 },
      { reservedCommitments:[{ dealId:'a', clubId:'club', amount:12_000_000 }, { dealId:'b', clubId:'other', amount:9_000_000 }] },
    )).toBe(28_000_000);
  });

  it('ranks candidates against the declared need, fit, age and affordability', () => {
    const buyer = { id:'buyer', reputation:75, budget:30_000_000, league:'Premier League' };
    const need = {
      group:'DEF', position:'CB', roleId:'ball_playing_cb', maxBudget:25_000_000,
      preferredAgeMax:27, targetAbilityBand:{ min:66, max:76 },
    };
    const exact = player('exact', 'seller-a', 'CB', 72, { age:23, value:14_000_000, midfield:64 });
    const fullback = player('fullback', 'seller-b', 'LB', 74, { age:29, value:23_000_000 });
    const striker = player('striker', 'seller-c', 'ST', 80, { age:22, value:10_000_000 });

    const ranked = rankRecruitmentCandidates({
      need, buyer, players:[striker, fullback, exact],
      marketValueFor:p => p.value,
      canSign:() => true,
      likelihoodFor:() => 70,
    });

    expect(ranked.map(item => item.player.id)).toEqual(['exact','fullback']);
    expect(ranked[0].reasons).toContain('fills_priority_position');
  });

  it('guards seller squad and goalkeeper safety at completion', () => {
    const movingKeeper = player('gk', 'seller', 'GK', 70);
    const sellerSquad = [movingKeeper, ...Array.from({ length:15 }, (_, i) => player(`s${i}`, 'seller', 'CM', 60))];
    const buyerSquad = Array.from({ length:20 }, (_, i) => player(`b${i}`, 'buyer', 'CM', 60));
    expect(assessSquadSafety({ buyerSquad, sellerSquad, player:movingKeeper })).toEqual({ ok:false, reason:'seller_squad_floor' });
    sellerSquad.push(player('extra', 'seller', 'CM', 60));
    expect(assessSquadSafety({ buyerSquad, sellerSquad, player:movingKeeper })).toEqual({ ok:false, reason:'seller_no_goalkeeper' });
  });

  it('prefers listed managed players but still sometimes selects an unlisted one', () => {
    const listed = { player:player('listed', 'user', 'CM', 70, { transferListed:true }), score:90, value:10_000_000 };
    const unlisted = { player:player('unlisted', 'user', 'CM', 71), score:91, value:11_000_000 };
    const background = { player:player('background', 'other', 'CM', 72), score:92, value:12_000_000 };
    const candidates = [background];
    const managedCandidates = [unlisted, listed];

    expect(selectAIRecruitmentTarget({ candidates, managedCandidates, managedRoll:5, targetIndex:0 })?.player.id).toBe('listed');
    expect(selectAIRecruitmentTarget({ candidates, managedCandidates, managedRoll:23, targetIndex:0 })?.player.id).toBe('unlisted');
    expect(selectAIRecruitmentTarget({ candidates, managedCandidates, managedRoll:50, targetIndex:0 })?.player.id).toBe('background');
  });

  it('uses the lower unlisted chance when no managed player is listed', () => {
    const unlisted = { player:player('unlisted', 'user', 'CM', 71), score:91, value:11_000_000 };
    const background = { player:player('background', 'other', 'CM', 72), score:92, value:12_000_000 };

    expect(selectAIRecruitmentTarget({ candidates:[background], managedCandidates:[unlisted], managedRoll:1, targetIndex:0 })?.player.id).toBe('unlisted');
    expect(selectAIRecruitmentTarget({ candidates:[background], managedCandidates:[unlisted], managedRoll:6, targetIndex:0 })?.player.id).toBe('background');
  });
});
