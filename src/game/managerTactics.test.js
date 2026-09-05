import { describe, expect, it } from 'vitest';
import { buildSquadAwareAITacticalProfile } from '../modules/aiTacticalIdentity.js';
import {
  applyManagerDNAResult,
  buildManagedMatchInputs,
  buildManagerDNASample,
  buildOpponentTacticalInsight,
} from '../modules/managerTactics.js';
import { generateStubPlayers } from './opponents.js';

function player(id, position, overrides = {}) {
  const attacking = ['ST','CF','RW','LW','CAM','RM','LM'].includes(position);
  const midfield = ['CM','CDM','CAM','RM','LM','RW','LW'].includes(position);
  const defending = ['CB','RB','LB','CDM'].includes(position);
  return {
    id,
    name:id,
    position,
    age:20,
    attack:78,
    midfield:76,
    defence:72,
    goalkeeping:position === 'GK' ? 80 : 8,
    fitness:90,
    injured:false,
    suspended:false,
    inSquad:true,
    traits:[],
    attributeProfile:{
      version:1,
      pace:overrides.pace ?? (position === 'GK' ? 55 : 78),
      shooting:overrides.shooting ?? (attacking ? 80 : 58),
      passing:overrides.passing ?? (midfield || attacking ? 80 : 70),
      dribbling:overrides.dribbling ?? (midfield || attacking ? 78 : 64),
      defending:overrides.defending ?? (defending ? 82 : 56),
      physical:overrides.physical ?? 80,
    },
    ...overrides,
  };
}

function opponentSquad() {
  return [
    player('ogk','GK'), player('ocb1','CB'), player('ocb2','CB'),
    player('orb','RB'), player('olb','LB'), player('odm','CDM'),
    player('ocm1','CM'), player('ocm2','CM'), player('orw','RW'),
    player('olw','LW'), player('ost','ST'), player('ost2','ST'),
  ];
}

const save = {
  season:'2026/27',
  currentGameweek:4,
  userTeamId:'user',
  formation:'4-2-3-1',
  mentality:'attacking',
  lineup:['h1','h2','h3','h4','h5','h6','h7','h8','h9','h10','h11'],
  tactics:{
    version:1,
    instructions:{
      buildUp:'direct', tempo:'fast', defensiveLine:'high', pressing:'aggressive', width:'wide',
      transition:'counter', chanceCreation:'early_delivery', defensiveApproach:'front_foot', setPieces:'attack',
    },
  },
  playerRoles:{ h1:'poacher' },
  managerDNA:null,
};

describe('P2 manager match context', () => {
  it('decorates only the managed side and leaves AI formation/mentality to the engine profile', () => {
    const homePlayers = [player('h1','ST'), player('h2','GK')];
    const awayPlayers = [player('a1','ST'), player('a2','GK')];
    const inputs = buildManagedMatchInputs({
      save,
      homeTeam:{ id:'user', name:'User', reputation:80 },
      awayTeam:{ id:'ai', name:'AI', reputation:82 },
      homePlayers,
      awayPlayers,
      userIsHome:true,
    });

    expect(inputs.homeTeam.tacticalPlan.source).toBe('user');
    expect(inputs.homeTeam.tacticalPlan.instructions.pressing).toBe('aggressive');
    expect(inputs.awayTeam.tacticalPlan).toBeUndefined();
    expect(inputs.homePlayers.find(p => p.id === 'h1').tacticalRole).toBe('poacher');
    expect(inputs.homeFormation).toBe('4-2-3-1');
    expect(inputs.homeMentality).toBe('attacking');
    expect(inputs.homeLineup).toEqual(save.lineup);
    expect(inputs.awayFormation).toBeUndefined();
    expect(inputs.awayMentality).toBeUndefined();
    expect(inputs.awayLineup).toBeNull();
  });

  it('builds Team News from the same squad-aware profile as match authority without leaking selector internals', () => {
    const opponentTeam = { id:'opponent', name:'Opponent', league:'Premier League', reputation:76 };
    const userTeam = { id:'user', name:'User', league:'Premier League', reputation:82 };
    const opponentPlayers = opponentSquad();
    const expected = buildSquadAwareAITacticalProfile({
      team:opponentTeam,
      opponent:userTeam,
      isHome:false,
      players:opponentPlayers,
    }).profile;
    const { profile, insight } = buildOpponentTacticalInsight({
      opponentTeam,
      userTeam,
      userIsHome:true,
      opponentPlayers,
      form:[{ result:'W' }, { result:'D' }, { result:'L' }],
      keyPlayer:{ name:'Key Threat', position:'ST' },
    });

    expect(profile).toEqual(expected);
    expect(insight.style).toBe(profile.label);
    expect(insight.shape).toBe(profile.formation);
    expect(insight.mentality).toBe(profile.mentality);
    expect(insight.formText).toBe('WDL');
    expect(insight.keyPlayer).toBe('Key Threat · ST');
    expect(insight.confidence).toBe('Established');
    expect(insight.threat.length).toBeGreaterThan(10);
    expect(insight.weakness.length).toBeGreaterThan(10);
    expect(insight).not.toHaveProperty('margin');
    expect(insight).not.toHaveProperty('evaluations');
    expect(JSON.stringify(insight)).not.toContain('attributeProfile');
    expect(JSON.stringify(insight)).not.toContain('actionFit');
  });

  it('uses cautious wording for synthetic or otherwise limited opponent evidence', () => {
    const opponentTeam = { id:'legacy_opponent', name:'Legacy Opponent', league:'Premier League', reputation:76 };
    const userTeam = { id:'user', name:'User', league:'Premier League', reputation:82 };
    const opponentPlayers = generateStubPlayers(opponentTeam, 76);
    const { profile, insight } = buildOpponentTacticalInsight({
      opponentTeam,
      userTeam,
      userIsHome:true,
      opponentPlayers,
      form:[],
    });

    const expected = buildSquadAwareAITacticalProfile({
      team:opponentTeam,
      opponent:userTeam,
      isHome:false,
      players:opponentPlayers,
    }).profile;
    expect(profile).toEqual(expected);
    expect(insight.confidence).toBe('Limited');
    expect(insight.threat.startsWith('Possible:')).toBe(true);
    expect(insight.weakness.startsWith('Possible:')).toBe(true);
  });
});

describe('P2 Manager DNA sampling', () => {
  it('prefers the authoritative user-side result plan over stale save defaults', () => {
    const result = {
      homeTeamId:'ai',
      awayTeamId:'user',
      homeGoals:1,
      awayGoals:2,
      homeFormation:'4-4-2',
      awayFormation:'3-4-3',
      homeMentality:'balanced',
      awayMentality:'possession',
      homeTactics:{ buildUp:'balanced' },
      awayTactics:{ buildUp:'patient', pressing:'passive' },
      stats:{ possession:{ home:44, away:56 } },
    };
    const sample = buildManagerDNASample(save, result, { type:'league', gw:4, fixtureId:'f4' }, false, [player('h1','ST')]);

    expect(sample.formation).toBe('3-4-3');
    expect(sample.mentality).toBe('possession');
    expect(sample.instructions.buildUp).toBe('patient');
    expect(sample.possession).toBe(56);
    expect(sample.outcome).toBe('win');
    expect(sample.youthStarts).toBe(1);
  });

  it('does not double-count the same authoritative match fingerprint', () => {
    const result = {
      homeTeamId:'user', awayTeamId:'ai', homeGoals:1, awayGoals:0,
      homeFormation:'4-2-3-1', homeMentality:'attacking',
      homeTactics:save.tactics.instructions,
      stats:{ possession:{ home:51, away:49 } },
    };
    const event = { type:'league', gw:4, fixtureId:'f4' };
    const first = applyManagerDNAResult(save, result, event, true, [player('h1','ST')]);
    const second = applyManagerDNAResult(first, result, event, true, [player('h1','ST')]);

    expect(first.managerDNA.matches).toBe(1);
    expect(second.managerDNA.matches).toBe(1);
    expect(second.managerDNA.lastFingerprint).toBe(first.managerDNA.lastFingerprint);
  });
});
