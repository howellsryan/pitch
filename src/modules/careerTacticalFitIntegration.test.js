import { describe, expect, it } from 'vitest';
import { evaluateCareerTacticalFit } from './careerTacticalFit.js';
import { loanDestinationProjection } from './academyPathways.js';
import { rankRecruitmentCandidates } from './squadPlanning.js';
import { evaluatePlayerInterest } from './transferMarket.js';

function careerPlayer(id, teamId, position, rating = 80, attributes = {}, extras = {}) {
  const attacking = ['ST','CF','RW','LW','CAM','RM','LM'].includes(position);
  const midfield = ['CM','CDM','CAM','RM','LM','RW','LW'].includes(position);
  const defending = ['CB','RB','LB','CDM'].includes(position);
  return {
    id,
    name:id,
    teamId,
    position,
    age:25,
    attack:attacking ? rating : rating - 10,
    midfield:midfield ? rating : rating - 8,
    defence:defending ? rating : rating - 16,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:100,
    form:50,
    individualMorale:50,
    sharpness:50,
    injured:false,
    suspended:false,
    inSquad:true,
    value:10_000_000,
    wage:20_000,
    traits:[],
    attributeProfile:{
      version:1,
      pace:attributes.pace ?? rating,
      shooting:attributes.shooting ?? (attacking ? rating : rating - 12),
      passing:attributes.passing ?? (midfield || attacking ? rating : rating - 8),
      dribbling:attributes.dribbling ?? (midfield || attacking ? rating : rating - 8),
      defending:attributes.defending ?? (defending ? rating : rating - 18),
      physical:attributes.physical ?? rating,
    },
    ...extras,
  };
}

const controllerProfile = {
  id:'controller', label:'Possession controller', formation:'4-3-3', mentality:'possession', source:'ai', version:2,
  instructions:{
    buildUp:'patient', tempo:'balanced', useOfSpace:'to_feet', ballCarrying:'balanced',
    shotSelection:'work_into_box', deliveryTiming:'balanced', attackingWidth:'wide',
    onWin:'hold_shape', defensiveTransition:'counter_press', defensiveLine:'high',
    lineOfEngagement:'high', pressing:'standard', defensiveWidth:'balanced',
    defensiveApproach:'front_foot', setPieces:'balanced',
  },
};

function controllerSquad(teamId) {
  return [
    careerPlayer(`${teamId}-gk`,teamId,'GK',78,{ passing:72, physical:78 }),
    careerPlayer(`${teamId}-cb1`,teamId,'CB',82,{ pace:80, passing:84, defending:86, physical:84 }),
    careerPlayer(`${teamId}-cb2`,teamId,'CB',82,{ pace:79, passing:83, defending:85, physical:84 }),
    careerPlayer(`${teamId}-rb`,teamId,'RB',80,{ pace:82, passing:84, dribbling:78, defending:80 }),
    careerPlayer(`${teamId}-lb`,teamId,'LB',80,{ pace:82, passing:84, dribbling:78, defending:80 }),
    careerPlayer(`${teamId}-dm`,teamId,'CDM',86,{ passing:91, dribbling:86, defending:84, physical:82 }),
    careerPlayer(`${teamId}-cm1`,teamId,'CM',88,{ passing:94, dribbling:91, defending:74, physical:78 }),
    careerPlayer(`${teamId}-cm2`,teamId,'CM',87,{ passing:93, dribbling:90, defending:74, physical:78 }),
    careerPlayer(`${teamId}-rw`,teamId,'RW',81,{ pace:78, passing:86, dribbling:85, shooting:80 }),
    careerPlayer(`${teamId}-lw`,teamId,'LW',81,{ pace:78, passing:86, dribbling:85, shooting:80 }),
    careerPlayer(`${teamId}-st`,teamId,'ST',84,{ pace:80, passing:82, dribbling:82, shooting:91, physical:80 }),
  ];
}

function compactSquad(teamId, extraMidfielders = 0) {
  const rows = [
    careerPlayer(`${teamId}-gk`,teamId,'GK',78,{ passing:55, physical:88 }),
    careerPlayer(`${teamId}-cb1`,teamId,'CB',86,{ pace:45, passing:62, dribbling:38, defending:96, physical:97 }),
    careerPlayer(`${teamId}-cb2`,teamId,'CB',86,{ pace:45, passing:62, dribbling:38, defending:96, physical:97 }),
    careerPlayer(`${teamId}-rb`,teamId,'RB',82,{ pace:62, passing:68, dribbling:46, defending:91, physical:94 }),
    careerPlayer(`${teamId}-lb`,teamId,'LB',82,{ pace:62, passing:68, dribbling:46, defending:91, physical:94 }),
    careerPlayer(`${teamId}-cm1`,teamId,'CM',82,{ pace:76, passing:70, dribbling:45, defending:86, physical:94 }),
    careerPlayer(`${teamId}-cm2`,teamId,'CM',82,{ pace:76, passing:70, dribbling:45, defending:86, physical:94 }),
    careerPlayer(`${teamId}-rm`,teamId,'RM',84,{ pace:94, passing:80, dribbling:58, shooting:78, defending:70, physical:92 }),
    careerPlayer(`${teamId}-lm`,teamId,'LM',84,{ pace:94, passing:80, dribbling:58, shooting:78, defending:70, physical:92 }),
    careerPlayer(`${teamId}-st1`,teamId,'ST',86,{ pace:98, passing:74, dribbling:55, shooting:91, physical:96 }),
    careerPlayer(`${teamId}-st2`,teamId,'ST',85,{ pace:96, passing:70, dribbling:54, shooting:89, physical:95 }),
  ];
  for (let index = 0; index < extraMidfielders; index++) {
    rows.push(careerPlayer(`${teamId}-ahead-${index}`,teamId,'CM',94,{ pace:72, passing:84, dribbling:76, defending:88, physical:92 }));
  }
  return rows;
}

describe('T5.3 recruitment tactical-fit integration', () => {
  it('uses action attributes to rank otherwise comparable need-fitting candidates and still excludes the wrong group', () => {
    const buyer = { id:'buyer', reputation:80, budget:30_000_000 };
    const need = {
      group:'MID', position:'CM', roleId:'deep_playmaker', maxBudget:20_000_000,
      preferredAgeMax:30, targetAbilityBand:{ min:77, max:85 }, tacticalProfile:controllerProfile,
    };
    const technical = careerPlayer('technical','seller-a','CM',88,{ passing:98, dribbling:95, pace:72, physical:74 }, { value:10_000_000 });
    const blunt = careerPlayer('blunt','seller-b','CM',88,{ passing:54, dribbling:52, pace:72, physical:74 }, { value:10_000_000 });
    const wrongGroup = careerPlayer('wrong-group','seller-c','ST',88,{ passing:99, dribbling:99, shooting:99 }, { value:5_000_000 });

    const ranked = rankRecruitmentCandidates({
      need, buyer, players:[blunt, wrongGroup, technical],
      marketValueFor:player => player.value, canSign:() => true, likelihoodFor:() => 70,
    });

    expect(ranked.map(item => item.player.id)).toEqual(['technical','blunt']);
    expect(ranked[0].tacticalFit).toBeGreaterThan(ranked[1].tacticalFit);
  });

  it('does not let tactical fit displace a materially better ability/value need candidate', () => {
    const buyer = { id:'buyer', reputation:82, budget:30_000_000 };
    const need = {
      group:'MID', position:'CM', roleId:'deep_playmaker', maxBudget:20_000_000,
      preferredAgeMax:30, targetAbilityBand:{ min:84, max:90 }, tacticalProfile:controllerProfile,
    };
    const strongerValue = careerPlayer('strong-value','seller-a','CM',95,{ passing:52, dribbling:50, pace:68, physical:70 }, { value:5_000_000 });
    const tacticalLuxury = careerPlayer('tactical-luxury','seller-b','CM',89,{ passing:99, dribbling:98, pace:80, physical:80 }, { value:12_000_000 });

    const ranked = rankRecruitmentCandidates({
      need, buyer, players:[tacticalLuxury, strongerValue],
      marketValueFor:player => player.value, canSign:() => true, likelihoodFor:() => 70,
    });

    expect(ranked[0].player.id).toBe('strong-value');
    expect(ranked[1].tacticalFit).toBeGreaterThan(ranked[0].tacticalFit);
  });
});

describe('T5.3 player interest tactical fit', () => {
  it('uses the same squad-aware buyer identity as the shared career evaluator', () => {
    const buyer = { id:'buyer', league:'Premier League', reputation:82 };
    const seller = { id:'seller', league:'Premier League', reputation:72 };
    const buyerSquad = controllerSquad('buyer');
    const target = careerPlayer('target','seller','CM',84,{ passing:95, dribbling:92, defending:65, physical:78 }, { wage:20_000 });
    const expected = evaluateCareerTacticalFit({ player:target, team:buyer, squad:buyerSquad });
    const interest = evaluatePlayerInterest({
      player:target, buyer, seller, buyerSquad,
      terms:{ contract:{ wage:24_000, duration:4, squadRole:'rotation' } },
    });

    expect(interest.hardBlocker).toBeNull();
    expect(interest.tacticalProfileId).toBe(expected.profileId);
    expect(interest.tacticalRole).toBe(expected.roleId);
    expect(interest.tacticalFit).toBe(expected.tacticalFit);
  });

  it('never lets strong tactical fit bypass an existing rivalry hard blocker', () => {
    const buyer = { id:'arsenal', league:'Premier League', reputation:90 };
    const seller = { id:'tottenham', league:'Premier League', reputation:88 };
    const buyerSquad = controllerSquad('arsenal');
    const target = careerPlayer('rival-star','tottenham','CM',88,{ passing:99, dribbling:98 }, { individualMorale:85, wage:30_000 });
    const interest = evaluatePlayerInterest({
      player:target, buyer, seller, buyerSquad,
      terms:{ contract:{ wage:60_000, duration:5, squadRole:'crucial' } },
    });

    expect(interest.interested).toBe(false);
    expect(interest.hardBlocker).toBe('rivalry');
  });
});

describe('T5.3 loan destination tactical fit', () => {
  it('lets tactical/action fit separate destinations with the same expected opportunity', () => {
    const player = careerPlayer('loan-target','parent','CM',103,{ passing:99, dribbling:99, defending:30, pace:78, physical:74 }, { age:20, wage:8_000 });
    const controllerTeam = { id:'controller-dest', reputation:75, budget:20_000_000 };
    const compactTeam = { id:'compact-dest', reputation:75, budget:20_000_000 };
    const controller = loanDestinationProjection(player, controllerTeam, controllerSquad(controllerTeam.id), { weekKey:'2026/27:4' });
    const compact = loanDestinationProjection(player, compactTeam, compactSquad(compactTeam.id), { weekKey:'2026/27:4' });

    expect(controller.expectedMinutes).toBe(compact.expectedMinutes);
    expect(controller.tacticalFit).toBeGreaterThan(compact.tacticalFit);
    expect(controller.pathwayScore).toBeGreaterThan(compact.pathwayScore);
  });

  it('keeps a material playing-time advantage ahead of a better tactical fit', () => {
    const player = careerPlayer('loan-target','parent','CM',86,{ passing:98, dribbling:96, defending:35, pace:78, physical:74 }, { age:20, wage:8_000 });
    const minutesTeam = { id:'minutes-dest', reputation:72, budget:20_000_000 };
    const fitTeam = { id:'fit-dest', reputation:72, budget:20_000_000 };
    const minutesProjection = loanDestinationProjection(player, minutesTeam, compactSquad(minutesTeam.id), { weekKey:'2026/27:4' });
    const fitSquad = controllerSquad(fitTeam.id).concat([
      careerPlayer('fit-ahead-1',fitTeam.id,'CM',96,{ passing:96, dribbling:94 }),
      careerPlayer('fit-ahead-2',fitTeam.id,'CM',95,{ passing:95, dribbling:93 }),
      careerPlayer('fit-ahead-3',fitTeam.id,'CM',94,{ passing:94, dribbling:92 }),
    ]);
    const fitProjection = loanDestinationProjection(player, fitTeam, fitSquad, { weekKey:'2026/27:4' });

    expect(minutesProjection.expectedMinutes).toBeGreaterThan(fitProjection.expectedMinutes);
    expect(fitProjection.tacticalFit).toBeGreaterThan(minutesProjection.tacticalFit);
    expect(minutesProjection.pathwayScore).toBeGreaterThan(fitProjection.pathwayScore);
  });
});
