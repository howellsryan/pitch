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

  it('retains stable club identity unless another archetype wins by the material margin', () => {
    const squad = wideSquad();
    let switched = null;

    for (let index = 0; index < 80; index += 1) {
      const selection = selectSquadAwareAIIdentity({
        team:{ id:`identity_${index}`, league:'Premier League', reputation:78 },
        players:squad,
      });
      if (selection.switched) { switched = selection; break; }
      expect(selection.archetypeId).toBe(selection.baseArchetypeId);
    }

    expect(switched).not.toBeNull();
    expect(switched.margin).toBeGreaterThanOrEqual(AI_IDENTITY_SWITCH_MARGIN);
    expect(switched.archetypeId).not.toBe(switched.baseArchetypeId);
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
