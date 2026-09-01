import { describe, expect, it } from 'vitest';

import { injuryRecoveryWriteSet } from './gameweek.js';

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
});