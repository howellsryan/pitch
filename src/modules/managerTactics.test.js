import { describe, expect, it } from 'vitest';
import {
  applyManagerDNAResult,
  buildManagerDNASample,
  decorateManagedPlayers,
  decorateManagedTeam,
} from './managerTactics.js';

describe('P2 managed tactical context', () => {
  const save = {
    userTeamId:'user', season:'2025/26', currentGameweek:8,
    formation:'4-2-3-1', mentality:'possession',
    lineup:['u1','u2'],
    tactics:{ source:'user', instructions:{ buildUp:'patient', pressing:'aggressive' } },
    playerRoles:{ u1:'poacher' },
  };

  it('decorates only transient match inputs from save state', () => {
    const team = { id:'user', name:'User FC' };
    const players = [{ id:'u1', position:'ST' }, { id:'u2', position:'CM' }];

    const managedTeam = decorateManagedTeam(team, save);
    const managedPlayers = decorateManagedPlayers(players, save);

    expect(managedTeam).not.toBe(team);
    expect(managedTeam.tacticalPlan.source).toBe('user');
    expect(managedTeam.tacticalPlan.instructions.buildUp).toBe('patient');
    expect(managedPlayers[0].tacticalRole).toBe('poacher');
    expect(managedPlayers[1].tacticalRole).toBeNull();
    expect(team.tacticalPlan).toBeUndefined();
    expect(players[0].tacticalRole).toBeUndefined();
  });

  it('builds DNA from actual selected tactics, result and youth starts', () => {
    const result = {
      homeTeamId:'user', awayTeamId:'opp', homeGoals:2, awayGoals:1,
      stats:{ possession:{ home:61, away:39 } },
    };
    const event = { type:'league', fixtureId:'f8', gw:8 };
    const sample = buildManagerDNASample(save, result, event, true, [
      { id:'u1', age:20 }, { id:'u2', age:29 },
    ]);

    expect(sample.formation).toBe('4-2-3-1');
    expect(sample.mentality).toBe('possession');
    expect(sample.instructions.buildUp).toBe('patient');
    expect(sample.outcome).toBe('win');
    expect(sample.possession).toBe(61);
    expect(sample.youthStarts).toBe(1);
    expect(sample.fingerprint).toContain('f8');
  });

  it('is idempotent for the same committed event fingerprint', () => {
    const result = {
      homeTeamId:'user', awayTeamId:'opp', homeGoals:1, awayGoals:0,
      stats:{ possession:{ home:55, away:45 } },
    };
    const event = { type:'league', fixtureId:'same-match', gw:8 };
    const once = applyManagerDNAResult(save, result, event, true, [{ id:'u1', age:20 }]);
    const twice = applyManagerDNAResult(once, result, event, true, [{ id:'u1', age:20 }]);

    expect(once.managerDNA.matches).toBe(1);
    expect(twice.managerDNA.matches).toBe(1);
    expect(twice.managerDNA.wins).toBe(1);
  });
});
