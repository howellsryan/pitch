import { describe, expect, it } from 'vitest';
import { buildSquadAwareAITacticalProfile } from './aiTacticalIdentity.js';
import {
  buildCareerTacticalContext,
  evaluateCareerTacticalFit,
} from './careerTacticalFit.js';

function fitPlayer(id, position, attributes = {}, rating = 78) {
  const attacking = ['ST','CF','RW','LW','CAM','RM','LM'].includes(position);
  const midfield = ['CM','CDM','CAM','RM','LM','RW','LW'].includes(position);
  const defending = ['CB','RB','LB','CDM'].includes(position);
  return {
    id,
    name:id,
    teamId:'buyer',
    position,
    age:25,
    attack:attacking ? rating : rating - 10,
    midfield:midfield ? rating : rating - 8,
    defence:defending ? rating : rating - 16,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:92,
    form:50,
    individualMorale:50,
    sharpness:50,
    injured:false,
    suspended:false,
    inSquad:true,
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
  };
}

function fitSquad() {
  return [
    fitPlayer('gk','GK',{ passing:72, physical:80 }),
    fitPlayer('cb1','CB',{ passing:82, defending:86, physical:85 }),
    fitPlayer('cb2','CB',{ passing:80, defending:85, physical:85 }),
    fitPlayer('rb','RB',{ pace:84, passing:82, dribbling:79, defending:80 }),
    fitPlayer('lb','LB',{ pace:84, passing:82, dribbling:79, defending:80 }),
    fitPlayer('dm','CDM',{ passing:90, dribbling:84, defending:84, physical:84 }),
    fitPlayer('cm1','CM',{ passing:94, dribbling:90, physical:78 }),
    fitPlayer('cm2','CM',{ passing:92, dribbling:88, physical:79 }),
    fitPlayer('rw','RW',{ pace:82, passing:84, dribbling:87, shooting:80 }),
    fitPlayer('lw','LW',{ pace:82, passing:84, dribbling:87, shooting:80 }),
    fitPlayer('st','ST',{ pace:82, passing:80, dribbling:82, shooting:91, physical:84 }),
  ];
}

const patientProfile = {
  id:'controller',
  formation:'4-3-3',
  mentality:'possession',
  source:'ai',
  version:2,
  instructions:{
    buildUp:'patient', tempo:'slow', useOfSpace:'to_feet', ballCarrying:'dribble_less',
    attackingWidth:'narrow', defensiveWidth:'standard', onWin:'hold_shape',
    shotSelection:'work_into_box', deliveryTiming:'patient', defensiveLine:'standard',
    lineOfEngagement:'standard', pressing:'standard', defensiveTransition:'regroup',
    defensiveApproach:'balanced', setPieces:'balanced',
  },
};

describe('T5.3 shared career tactical fit', () => {
  it('uses the same deterministic squad-aware identity without mutating inputs', () => {
    const team = { id:'buyer', league:'Premier League', reputation:80 };
    const squad = fitSquad();
    const before = JSON.stringify({ team, squad });
    const expected = buildSquadAwareAITacticalProfile({ team, players:squad });

    const first = buildCareerTacticalContext({ team, squad });
    const second = buildCareerTacticalContext({ team, squad });

    expect(first.profile).toEqual(expected.profile);
    expect(first.profileId).toBe(expected.profile.id);
    expect(second).toEqual(first);
    expect(JSON.stringify({ team, squad })).toBe(before);
  });

  it('rewards action-relevant detailed attributes when headline ability and role are the same', () => {
    const team = { id:'buyer', reputation:80 };
    const technical = fitPlayer('technical','CM',{ passing:96, dribbling:92, pace:72, physical:74 }, 80);
    const blunt = fitPlayer('blunt','CM',{ passing:58, dribbling:55, pace:72, physical:74 }, 80);

    const technicalFit = evaluateCareerTacticalFit({
      player:technical, team, tacticalProfile:patientProfile, roleId:'deep_playmaker',
    });
    const bluntFit = evaluateCareerTacticalFit({
      player:blunt, team, tacticalProfile:patientProfile, roleId:'deep_playmaker',
    });

    expect(technicalFit.roleFit).toBe(bluntFit.roleFit);
    expect(technicalFit.actionQuality).toBeGreaterThan(bluntFit.actionQuality);
    expect(technicalFit.tacticalFit).toBeGreaterThan(bluntFit.tacticalFit);
    expect(technicalFit.actions.some(action => action.actionId === 'circulation')).toBe(true);
  });

  it('keeps the combined career multiplier bounded even for extreme profiles', () => {
    const team = { id:'buyer', reputation:80 };
    const elite = fitPlayer('elite','CM',{ passing:99, dribbling:99, pace:99, physical:99 }, 95);
    const weak = fitPlayer('weak','CM',{ passing:1, dribbling:1, pace:1, physical:1 }, 45);

    const high = evaluateCareerTacticalFit({ player:elite, team, tacticalProfile:patientProfile, roleId:'deep_playmaker' });
    const low = evaluateCareerTacticalFit({ player:weak, team, tacticalProfile:patientProfile, roleId:'deep_playmaker' });

    expect(high.tacticalFit).toBeLessThanOrEqual(1.10);
    expect(low.tacticalFit).toBeGreaterThanOrEqual(.72);
  });
});
