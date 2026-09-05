import { describe, expect, it } from 'vitest';
import { evaluateCareerTacticalFit } from './careerTacticalFit.js';
import { buildScoutingReport } from './scouting.js';
import { buildScoutingTacticalAssessment } from './scoutingTacticalAssessment.js';

const controllerProfile = {
  id:'controller', label:'Possession controller', formation:'4-3-3', mentality:'possession', source:'user', version:2,
  instructions:{
    buildUp:'patient', tempo:'balanced', useOfSpace:'to_feet', ballCarrying:'balanced',
    shotSelection:'work_into_box', deliveryTiming:'balanced', attackingWidth:'wide',
    onWin:'hold_shape', defensiveTransition:'counter_press', defensiveLine:'high',
    lineOfEngagement:'high', pressing:'standard', defensiveWidth:'balanced',
    defensiveApproach:'front_foot', setPieces:'balanced',
  },
};

const compactProfile = {
  id:'compact_counter', label:'Compact counter', formation:'4-4-2', mentality:'defensive', source:'user', version:2,
  instructions:{
    buildUp:'direct', tempo:'fast', useOfSpace:'pass_into_space', ballCarrying:'dribble_less',
    shotSelection:'balanced', deliveryTiming:'early', attackingWidth:'narrow',
    onWin:'counter', defensiveTransition:'regroup', defensiveLine:'low',
    lineOfEngagement:'low', pressing:'passive', defensiveWidth:'narrow',
    defensiveApproach:'compact', setPieces:'secure',
  },
};

function midfielder(attributeProfile = {}) {
  return {
    id:'target', name:'Target', teamId:'seller', position:'CM', age:24,
    attack:72, midfield:84, defence:68, goalkeeping:8,
    fitness:100, form:50, individualMorale:50, sharpness:50,
    injured:false, inSquad:true, traits:[], value:16_000_000, wage:35_000,
    potentialRating:89,
    attributeProfile:{
      version:1,
      pace:attributeProfile.pace ?? 78,
      shooting:attributeProfile.shooting ?? 70,
      passing:attributeProfile.passing ?? 84,
      dribbling:attributeProfile.dribbling ?? 82,
      defending:attributeProfile.defending ?? 68,
      physical:attributeProfile.physical ?? 76,
    },
  };
}

function coarseFit(value) {
  return value >= 1.02 ? 'Strong' : value >= .91 ? 'Good' : 'Stretch';
}

describe('T5.4 scouting tactical assessment', () => {
  it('maps an exact report to the same shared tactical evaluator without exposing the raw score', () => {
    const player = midfielder({ passing:97, dribbling:94 });
    const team = { id:'user', reputation:80 };
    const shared = evaluateCareerTacticalFit({ player, team, tacticalProfile:controllerProfile });
    const assessment = buildScoutingTacticalAssessment({
      player, userTeam:team, tacticalProfile:controllerProfile, currentRange:{ min:84, max:84 }, exact:true,
    });

    expect(assessment.roleId).toBe(shared.roleId);
    expect(assessment.fit).toBe(coarseFit(shared.tacticalFit));
    expect(assessment.focus).toEqual(expect.any(String));
    expect(assessment).not.toHaveProperty('tacticalFit');
    expect(assessment).not.toHaveProperty('actionQuality');
    expect(assessment).not.toHaveProperty('actions');
  });

  it('cannot leak hidden detailed attributes through a partial report', () => {
    const technical = midfielder({ pace:92, shooting:90, passing:99, dribbling:99, defending:92, physical:94 });
    const blunt = midfielder({ pace:42, shooting:40, passing:42, dribbling:40, defending:38, physical:44 });
    const context = {
      userTeam:{ id:'user', reputation:80 },
      tacticalProfile:controllerProfile,
      currentRange:{ min:78, max:88 },
      exact:false,
    };

    const technicalAssessment = buildScoutingTacticalAssessment({ ...context, player:technical });
    const bluntAssessment = buildScoutingTacticalAssessment({ ...context, player:blunt });

    expect(technicalAssessment).toEqual(bluntAssessment);
  });

  it('stores the same partial tactical report when only hidden detailed attributes change', () => {
    const technical = midfielder({ pace:95, passing:99, dribbling:98, defending:92, physical:94 });
    const blunt = midfielder({ pace:40, passing:40, dribbling:40, defending:40, physical:40 });
    const context = {
      season:'2026/27', gameweek:8, confidence:.54,
      userTeam:{ id:'user', reputation:80 }, tacticalProfile:controllerProfile,
      teamsById:new Map([['seller',{ id:'seller', reputation:75 }]]),
      valueFor:player => player.value,
    };

    const technicalReport = buildScoutingReport(technical, context);
    const bluntReport = buildScoutingReport(blunt, context);

    expect(technicalReport.current).toEqual(bluntReport.current);
    expect(technicalReport.tactical).toEqual(bluntReport.tactical);
  });

  it('uses the supplied user plan rather than one fixed hash-only tactical identity', () => {
    const player = { ...midfielder(), position:'RW', attack:84, midfield:76, defence:42 };
    const base = { player, userTeam:{ id:'user', reputation:80 }, currentRange:{ min:80, max:86 }, exact:false };
    const controller = buildScoutingTacticalAssessment({ ...base, tacticalProfile:controllerProfile });
    const compact = buildScoutingTacticalAssessment({ ...base, tacticalProfile:compactProfile });

    expect(controller.roleId).toBe('wide_creator');
    expect(compact.roleId).toBe('inside_forward');
  });

  it('is deterministic and non-mutating', () => {
    const player = midfielder();
    const before = structuredClone(player);
    const args = { player, userTeam:{ id:'user' }, tacticalProfile:controllerProfile, currentRange:{ min:77, max:87 }, exact:false };

    expect(buildScoutingTacticalAssessment(args)).toEqual(buildScoutingTacticalAssessment(args));
    expect(player).toEqual(before);
  });
});
