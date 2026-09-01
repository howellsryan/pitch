import { describe, expect, it } from 'vitest';
import {
  applyManagerDNAResult,
  buildManagedMatchInputs,
  buildManagerDNASample,
  buildOpponentTacticalInsight,
} from '../modules/managerTactics.js';

function player(id, position) {
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
  };
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

  it('builds Team News insight from the same AI profile contract', () => {
    const opponentTeam = { id:'opponent', name:'Opponent', league:'Premier League', reputation:76 };
    const userTeam = { id:'user', name:'User', league:'Premier League', reputation:82 };
    const { profile, insight } = buildOpponentTacticalInsight({
      opponentTeam,
      userTeam,
      userIsHome:true,
      form:[{ result:'W' }, { result:'D' }, { result:'L' }],
      keyPlayer:{ name:'Key Threat', position:'ST' },
    });

    expect(insight.style).toBe(profile.label);
    expect(insight.shape).toBe(profile.formation);
    expect(insight.mentality).toBe(profile.mentality);
    expect(insight.formText).toBe('WDL');
    expect(insight.keyPlayer).toBe('Key Threat · ST');
    expect(insight.threat.length).toBeGreaterThan(10);
    expect(insight.weakness.length).toBeGreaterThan(10);
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
