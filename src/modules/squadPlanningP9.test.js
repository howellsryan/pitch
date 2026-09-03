import { describe, expect, it } from 'vitest';

import {
  assessSquadSafety,
  buildSquadNeeds,
  rankRecruitmentCandidates,
  rankStandoutRecruitmentCandidates,
} from './squadPlanning.js';

function player(id, teamId, position = 'CM', rating = 70, extra = {}) {
  const fields = { attack:45, midfield:45, defence:45, goalkeeping:10 };
  if (position === 'GK') fields.goalkeeping = rating;
  else if (['CB','RB','LB'].includes(position)) fields.defence = rating;
  else if (['ST','CF','RW','LW'].includes(position)) fields.attack = rating;
  else fields.midfield = rating;
  return {
    id, teamId, position, age:22, value:8_000_000, wage:20_000,
    fitness:100, form:50, individualMorale:50, sharpness:50,
    positionSuitability:{ [position]:1 }, traits:[], ...fields, ...extra,
  };
}

function academy(id, teamId, position = 'CM', rating = 76) {
  return player(id, teamId, position, rating, {
    age:17,
    playerStatus:'academy',
    contractTeamId:teamId,
    registeredTeamId:teamId,
    isYouth:true,
    inSquad:false,
    wage:0,
    potentialRating:86,
  });
}

describe('P9 academy isolation from senior market planning', () => {
  it('does not count a canonical academy row as current senior coverage but can use it in the future pathway projection', () => {
    const team = { id:'club', reputation:70, budget:40_000_000, league:'Premier League' };
    const senior = player('senior', 'club', 'CM', 70);
    const prospect = academy('academy', 'club', 'CM', 78);

    const midNeed = buildSquadNeeds(team, [senior, prospect], { currentYear:2025, season:'2025/26' })
      .find(need => need.group === 'MID');

    expect(midNeed.coverage.current).toBe(1);
    expect(midNeed.future.some(row => row.academyReady > 0)).toBe(true);
  });

  it('never exposes an academy prospect as a normal recruitment candidate before promotion', () => {
    const buyer = { id:'buyer', reputation:75, budget:30_000_000, league:'Premier League' };
    const need = {
      group:'MID', position:'CM', roleId:null, maxBudget:25_000_000,
      preferredAgeMax:27, targetAbilityBand:{ min:64, max:80 },
    };
    const senior = player('senior-target', 'seller', 'CM', 72, { value:10_000_000 });
    const prospect = academy('academy-target', 'seller', 'CM', 78);

    const ranked = rankRecruitmentCandidates({
      need,
      buyer,
      players:[prospect, senior],
      marketValueFor:item => item.value,
      canSign:() => true,
      likelihoodFor:() => 80,
    });

    expect(ranked.map(item => item.player.id)).toEqual(['senior-target']);
  });

  it('keeps academy rows out of opportunistic standout targeting and senior squad-cap checks', () => {
    const buyer = { id:'buyer', reputation:75, budget:50_000_000, league:'Premier League' };
    const seniors = Array.from({ length:30 }, (_, index) => player(`senior-${index}`, 'buyer', 'CM', 68));
    const prospect = academy('academy-target', 'seller', 'ST', 80);
    const sellerSquad = [player('moving', 'seller', 'ST', 72), ...Array.from({ length:16 }, (_, index) => player(`seller-${index}`, 'seller', 'CM', 65))];

    const ranked = rankStandoutRecruitmentCandidates({
      buyer,
      buyerSquad:[...seniors, academy('buyer-academy', 'buyer', 'CM', 85)],
      players:[prospect],
      marketValueFor:item => item.value,
      canSign:() => true,
      likelihoodFor:() => 80,
    });
    expect(ranked).toEqual([]);

    const safety = assessSquadSafety({
      buyerSquad:[...seniors, academy('buyer-academy', 'buyer', 'CM', 85)],
      sellerSquad,
      player:sellerSquad[0],
    });
    expect(safety).toEqual({ ok:false, reason:'buyer_squad_full' });
  });
});
