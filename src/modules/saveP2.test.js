import { describe, expect, it } from 'vitest';
import { buildP2SaveBackfill } from './save.js';

describe('P2 additive save backfill', () => {
  it('preserves the existing formation, mentality and lineup exactly', () => {
    const oldSave = {
      userTeamId:'club',
      season:'2025/26',
      formation:'4-2-3-1',
      mentality:'attacking',
      lineup:['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11'],
      currentGameweek:12,
    };

    const migrated = buildP2SaveBackfill(oldSave);

    expect(migrated.formation).toBe(oldSave.formation);
    expect(migrated.mentality).toBe(oldSave.mentality);
    expect(migrated.lineup).toEqual(oldSave.lineup);
    expect(migrated.currentGameweek).toBe(12);
  });

  it('keeps the historical v1 tactical plan, role assignments and Manager DNA defaults', () => {
    const migrated = buildP2SaveBackfill({ userTeamId:'club' });

    expect(migrated.tactics).toEqual({
      version:1,
      source:'user',
      instructions:{
        buildUp:'balanced', tempo:'balanced', defensiveLine:'mid', pressing:'standard', width:'balanced',
        transition:'balanced', chanceCreation:'balanced', defensiveApproach:'balanced', setPieces:'balanced',
      },
    });
    expect(migrated.playerRoles).toEqual({});
    expect(migrated.managerDNA.version).toBe(1);
    expect(migrated.managerDNA.matches).toBe(0);
    expect(migrated.managerDNA.formations).toEqual({});
    expect(migrated.managerDNA).not.toHaveProperty('spaceTotal');
  });

  it('retains existing P2 choices and Manager DNA while normalising only the historical schema', () => {
    const migrated = buildP2SaveBackfill({
      tactics:{
        source:'user',
        instructions:{ buildUp:'direct', pressing:'aggressive', width:'wide', transition:'counter', chanceCreation:'early_delivery', tempo:'not-valid' },
      },
      playerRoles:{ p9:'poacher' },
      managerDNA:{ matches:7, wins:4, formations:{ '4-3-3':5 } },
    });

    expect(migrated.tactics.version).toBe(1);
    expect(migrated.tactics.source).toBe('user');
    expect(migrated.tactics.instructions).toMatchObject({
      buildUp:'direct', pressing:'aggressive', width:'wide', transition:'counter', chanceCreation:'early_delivery', tempo:'balanced',
    });
    expect(migrated.tactics.instructions).not.toHaveProperty('attackingWidth');
    expect(migrated.playerRoles).toEqual({ p9:'poacher' });
    expect(migrated.managerDNA.version).toBe(1);
    expect(migrated.managerDNA.matches).toBe(7);
    expect(migrated.managerDNA.wins).toBe(4);
    expect(migrated.managerDNA.formations['4-3-3']).toBe(5);
    expect(migrated.managerDNA.losses).toBe(0);
  });
});