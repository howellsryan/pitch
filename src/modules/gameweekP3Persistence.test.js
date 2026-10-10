import { describe, expect, it } from 'vitest';

import { injuryRecoveryWriteSet, settleInjuryRecovery } from './gameweek.js';

describe('P3 gameweek persistence bounds', () => {
  it('writes only players whose injury recovery clock advances', () => {
    const healthy = { id:'healthy', injured:false, teamId:'a' };
    const injured = { id:'injured', injured:true, injuryGWsLeft:2, teamId:'a' };
    const otherInjured = { id:'other-injured', injured:true, injuryGWsLeft:1, teamId:'b' };

    const rows = injuryRecoveryWriteSet([healthy, injured, otherInjured]);

    expect(rows).toEqual([injured, otherInjured]);
    expect(rows).not.toContain(healthy);
  });

  it('does not create an ordinary world-player rewrite when nobody is injured', () => {
    expect(injuryRecoveryWriteSet([
      { id:'a', injured:false },
      { id:'b' },
    ])).toEqual([]);
  });

  it('advances the medical clock once even when the same closeout resumes after reload', () => {
    const players = [
      { id:'long', injured:true, injuryGWsLeft:3, teamId:'a' },
      { id:'healing', injured:true, injuryGWsLeft:1, teamId:'a', fitness:30 },
    ];
    const save = { season:'2025/26', currentGameweek:8 };
    const once = settleInjuryRecovery(players, save);
    expect(once.rows.find(player => player.id === 'long').injuryGWsLeft).toBe(2);
    expect(once.recovered.map(player => player.id)).toEqual(['healing']);
    expect(settleInjuryRecovery(players, save)).toEqual({ rows:[], recovered:[] });
    const next = settleInjuryRecovery(players, { ...save, currentGameweek:9 });
    expect(next.rows.find(player => player.id === 'long').injuryGWsLeft).toBe(1);
  });
});
