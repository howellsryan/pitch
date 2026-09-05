import { describe, expect, it } from 'vitest';
import {
  AI_IDENTITY_SWITCH_MARGIN,
  buildSquadAwareAITacticalProfile,
  evaluateAIArchetypeFeasibility,
  selectSquadAwareAIIdentity,
} from './aiTacticalIdentity.js';
import { TACTICS_PLAN_VERSION, getAITacticalProfile } from './tactics.js';

function player(id, position, attributes = {}, rating = 78) {
  const attacking = ['ST','CF','RW','LW','CAM','RM','LM'].includes(position);
  const midfield = ['CM','CDM','CAM','RM','LM','RW','LW'].includes(position);
  const defending = ['CB','RB','LB','CDM'].includes(position);
  return {
    id,
    name:id,
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

function controllerSquad() {
  return [
    player('gk','GK',{ pace:55, passing:72, defending:72, physical:78 }),
    player('cb1','CB',{ pace:80, passing:84, dribbling:75, defending:86, physical:84 }),
    player('cb2','CB',{ pace:79, passing:83, dribbling:74, defending:85, physical:84 }),
    player('rb','RB',{ pace:82, passing:84, dribbling:78, defending:80, physical:80 }),
    player('lb','LB',{ pace:82, passing:84, dribbling:78, defending:80, physical:80 }),
    player('dm','CDM',{ pace:76, passing:91, dribbling:86, defending:84, physical:82 }),
    player('cm1','CM',{ pace:75, passing:94, dribbling:91, defending:75, physical:78 }),
    player('cm2','CM',{ pace:76, passing:93, dribbling:90, defending:74, physical:78 }),
    player('rw','RW',{ pace:70, passing:82, dribbling:76, shooting:80, physical:72 }),
    player('lw','LW',{ pace:70, passing:82, dribbling:76, shooting:80, physical:72 }),
    player('st','ST',{ pace:76, passing:82, dribbling:82, shooting:91, physical:80 }),
    player('gk2','GK',{ pace:50, passing:68, defending:68, physical:75 }, 72),
    player('cb3','CB',{ pace:76, passing:80, defending:82, physical:82 }, 75),
  ];
}

function wideSquad() {
  return [
    player('wgk','GK',{ pace:52, passing:66, defending:72, physical:76 }),
    player('wcb1','CB',{ pace:74, passing:68, dribbling:60, defending:82, physical:84 }),
    player('wcb2','CB',{ pace:73, passing:68, dribbling:60, defending:82, physical:84 }),
    player('wrb','RB',{ pace:96, passing:91, dribbling:92, defending:74, physical:83 }),
    player('wlb','LB',{ pace:95, passing:91, dribbling:92, defending:74, physical:83 }),
    player('wdm','CDM',{ pace:75, passing:68, dribbling:64, defending:80, physical:84 }),
    player('wcm1','CM',{ pace:78, passing:70, dribbling:68, defending:69, physical:78 }),
    player('wcm2','CM',{ pace:78, passing:70, dribbling:68, defending:69, physical:78 }),
    player('wrw','RW',{ pace:98, passing:94, dribbling:97, shooting:84, physical:82 }),
    player('wlw','LW',{ pace:98, passing:94, dribbling:97, shooting:84, physical:82 }),
    player('wst','ST',{ pace:88, passing:72, dribbling:80, shooting:90, physical:86 }),
    player('wrm','RM',{ pace:94, passing:90, dribbling:93, shooting:80, physical:80 }),
    player('wlm','LM',{ pace:94, passing:90, dribbling:93, shooting:80, physical:80 }),
    player('wst2','ST',{ pace:86, passing:70, dribbling:78, shooting:88, physical:87 }),
  ];
}

function compactCounterSquad() {
  const stopper = { pace:44, passing:62, dribbling:38, defending:96, physical:97 };
  const fullBack = { pace:62, passing:68, dribbling:46, defending:91, physical:94 };
  const worker = { pace:76, passing:78, dribbling:45, defending:84, physical:94 };
  const wideRunner = { pace:94, passing:80, dribbling:58, shooting:78, defending:70, physical:92 };
  const runner = { pace:98, passing:74, dribbling:55, shooting:91, defending:42, physical:96 };
  return [
    player('cgk','GK',{ pace:42, passing:58, defending:78, physical:88 }, 80),
    player('ccb1','CB',stopper, 84),
    player('ccb2','CB',stopper, 84),
    player('crb','RB',fullBack, 82),
    player('clb','LB',fullBack, 82),
    player('ccm1','CM',worker, 82),
    player('ccm2','CM',worker, 82),
    player('crm','RM',wideRunner, 84),
    player('clm','LM',wideRunner, 84),
    player('cst1','ST',runner, 86),
    player('cst2','ST',{ ...runner, pace:96, shooting:89 }, 85),
    player('cdm','CDM',{ ...worker, defending:90 }, 81),
    player('ccb3','CB',{ ...stopper, pace:46 }, 80),
  ];
}

function verticalPressSquad(defenderPace) {
  const fastFront = { pace:94, passing:80, dribbling:87, shooting:84, physical:88 };
  return [
    player('vgk','GK',{ pace:60, passing:72, defending:75, physical:80 }),
    player('vcb1','CB',{ pace:defenderPace, passing:72, dribbling:60, defending:90, physical:91 }),
    player('vcb2','CB',{ pace:defenderPace, passing:72, dribbling:60, defending:90, physical:91 }),
    player('vrb','RB',{ pace:defenderPace, passing:76, dribbling:70, defending:84, physical:86 }),
    player('vlb','LB',{ pace:defenderPace, passing:76, dribbling:70, defending:84, physical:86 }),
    player('vdm1','CDM',{ pace:84, passing:80, dribbling:72, defending:87, physical:92 }),
    player('vdm2','CDM',{ pace:84, passing:80, dribbling:72, defending:87, physical:92 }),
    player('vcam','CAM',fastFront),
    player('vrw','RW',fastFront),
    player('vlw','LW',fastFront),
    player('vst','ST',{ ...fastFront, shooting:91 }),
    player('vcm','CM',{ pace:84, passing:79, dribbling:75, defending:80, physical:88 }),
  ];
}

describe('T5 squad-aware AI tactical identity', () => {
  it('scores a technical possession squad higher for Controller than Wide Overload', () => {
    const squad = controllerSquad();
    const controller = evaluateAIArchetypeFeasibility(squad, 'controller');
    const wide = evaluateAIArchetypeFeasibility(squad, 'wing_overload');

    expect(controller.score).toBeGreaterThan(wide.score);
    expect(controller.missingSlots).toBe(0);
  });

  it('scores an elite wide squad higher for Wide Overload than Controller', () => {
    const squad = wideSquad();
    const wide = evaluateAIArchetypeFeasibility(squad, 'wing_overload');
    const controller = evaluateAIArchetypeFeasibility(squad, 'controller');

    expect(wide.score).toBeGreaterThan(controller.score);
    expect(wide.coverageScore).toBeGreaterThanOrEqual(90);
  });

  it('penalises an aggressive high-line identity when recovery pace is poor', () => {
    const quick = evaluateAIArchetypeFeasibility(verticalPressSquad(92), 'vertical_press');
    const slow = evaluateAIArchetypeFeasibility(verticalPressSquad(44), 'vertical_press');

    expect(quick.score).toBeGreaterThan(slow.score);
    expect(quick.actionFit).toBeGreaterThan(slow.actionFit);
  });

  it('keeps the chosen identity but makes an away-underdog low block internally coherent', () => {
    const team = { id:'identity_14', league:'Premier League', reputation:70 };
    const opponent = { id:'strong_home', league:'Premier League', reputation:82 };
    expect(getAITacticalProfile(team).id).toBe('vertical_press');

    const { profile, selection } = buildSquadAwareAITacticalProfile({
      team,
      opponent,
      isHome:false,
      players:verticalPressSquad(92),
    });

    expect(profile.id).toBe(selection.archetypeId);
    expect(profile.instructions.defensiveLine).toBe('low');
    expect(profile.instructions.lineOfEngagement).toBe('low');
    expect(profile.instructions.defensiveTransition).toBe('regroup');
    expect(profile.instructions.pressing).toBe('passive');
    expect(profile.instructions.onWin).toBe('counter');
    expect(profile.mentality).toBe('defensive');
  });

  it('retains a versatile squad identity but switches a materially mismatched specialist squad', () => {
    const controllerTeam = { id:'identity_5', league:'Premier League', reputation:78 };
    expect(getAITacticalProfile(controllerTeam).id).toBe('controller');

    const versatile = selectSquadAwareAIIdentity({ team:controllerTeam, players:wideSquad() });
    expect(versatile.margin).toBeLessThan(AI_IDENTITY_SWITCH_MARGIN);
    expect(versatile.switched).toBe(false);
    expect(versatile.archetypeId).toBe('controller');

    const specialist = selectSquadAwareAIIdentity({ team:controllerTeam, players:compactCounterSquad() });
    expect(specialist.evaluations[0]?.archetypeId).toBe('compact_counter');
    expect(specialist.margin).toBeGreaterThanOrEqual(AI_IDENTITY_SWITCH_MARGIN);
    expect(specialist.switched).toBe(true);
    expect(specialist.archetypeId).toBe('compact_counter');
  });

  it('is deterministic, non-mutating and falls back to legacy stable identity without squad data', () => {
    const team = { id:'deterministic_ai', league:'Serie A', reputation:81 };
    const opponent = { id:'opponent', reputation:84 };
    const squad = controllerSquad();
    const before = JSON.stringify(squad);

    const first = buildSquadAwareAITacticalProfile({ team, opponent, isHome:false, players:squad });
    const second = buildSquadAwareAITacticalProfile({ team, opponent, isHome:false, players:squad });
    expect(second).toEqual(first);
    expect(JSON.stringify(squad)).toBe(before);
    expect(first.profile.version).toBe(TACTICS_PLAN_VERSION);
    expect(first.profile.source).toBe('ai');
    expect(first.profile.instructions.width).toBe(first.profile.instructions.attackingWidth);

    const fallback = selectSquadAwareAIIdentity({ team, players:[] });
    expect(fallback.archetypeId).toBe(getAITacticalProfile(team).id);
    expect(fallback.switched).toBe(false);
    expect(fallback.reason).toBe('insufficient_squad_data');
  });
});
