import { describe, expect, it } from 'vitest';
import {
  buildP2SaveBackfill,
  buildTacticsV2SaveBackfill,
  tacticsV2NeedsBackfill,
} from './save.js';
import { TACTICS_PLAN_VERSION } from './tactics.js';

describe('T4 tactics v2 save migration', () => {
  it('upgrades a historical P2 save without changing career state', () => {
    const oldSave = buildP2SaveBackfill({
      userTeamId:'club',
      season:'2025/26',
      formation:'4-2-3-1',
      mentality:'attacking',
      lineup:['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11'],
      currentGameweek:17,
      tactics:{
        source:'user',
        instructions:{
          buildUp:'direct',
          tempo:'fast',
          defensiveLine:'high',
          pressing:'aggressive',
          width:'wide',
          transition:'counter',
          chanceCreation:'work_ball',
          defensiveApproach:'front_foot',
          setPieces:'attack',
        },
      },
      playerRoles:{ p9:'poacher' },
      managerDNA:{ matches:12, wins:7, losses:3, formations:{ '4-2-3-1':8 } },
    });

    expect(tacticsV2NeedsBackfill(oldSave)).toBe(true);
    const migrated = buildTacticsV2SaveBackfill(oldSave);

    expect(migrated.userTeamId).toBe(oldSave.userTeamId);
    expect(migrated.season).toBe(oldSave.season);
    expect(migrated.formation).toBe(oldSave.formation);
    expect(migrated.mentality).toBe(oldSave.mentality);
    expect(migrated.lineup).toEqual(oldSave.lineup);
    expect(migrated.currentGameweek).toBe(17);
    expect(migrated.playerRoles).toEqual({ p9:'poacher' });

    expect(migrated.tactics.version).toBe(TACTICS_PLAN_VERSION);
    expect(migrated.tactics.source).toBe('user');
    expect(migrated.tactics.instructions).toMatchObject({
      buildUp:'direct',
      tempo:'fast',
      attackingWidth:'wide',
      defensiveWidth:'wide',
      onWin:'counter',
      shotSelection:'work_into_box',
      deliveryTiming:'balanced',
      useOfSpace:'mixed',
      ballCarrying:'balanced',
      defensiveTransition:'balanced',
      lineOfEngagement:'mid',
      defensiveLine:'high',
      pressing:'aggressive',
      defensiveApproach:'front_foot',
      setPieces:'attack',
    });

    expect(migrated.managerDNA.version).toBe(2);
    expect(migrated.managerDNA.matches).toBe(12);
    expect(migrated.managerDNA.wins).toBe(7);
    expect(migrated.managerDNA.losses).toBe(3);
    expect(migrated.managerDNA.formations['4-2-3-1']).toBe(8);
    expect(migrated.managerDNA.spaceTotal).toBe(0);
    expect(migrated.managerDNA.carryingTotal).toBe(0);
    expect(migrated.managerDNA.defensiveTransitionTotal).toBe(0);
  });

  it('maps early delivery independently from shot selection', () => {
    const migrated = buildTacticsV2SaveBackfill(buildP2SaveBackfill({
      tactics:{ instructions:{ chanceCreation:'early_delivery' } },
    }));

    expect(migrated.tactics.instructions.deliveryTiming).toBe('early');
    expect(migrated.tactics.instructions.shotSelection).toBe('balanced');
  });

  it('preserves already-explicit v2 dimensions, including asymmetric widths', () => {
    const save = {
      tactics:{
        version:2,
        source:'user',
        instructions:{
          attackingWidth:'wide',
          defensiveWidth:'narrow',
          useOfSpace:'pass_into_space',
          ballCarrying:'run_at_defence',
          shotSelection:'shoot_on_sight',
          deliveryTiming:'early',
          onWin:'counter',
          defensiveTransition:'counter_press',
          lineOfEngagement:'high',
        },
      },
      managerDNA:{ version:2 },
    };

    const migrated = buildTacticsV2SaveBackfill(save);
    expect(migrated.tactics.instructions).toMatchObject({
      attackingWidth:'wide',
      defensiveWidth:'narrow',
      useOfSpace:'pass_into_space',
      ballCarrying:'run_at_defence',
      shotSelection:'shoot_on_sight',
      deliveryTiming:'early',
      onWin:'counter',
      defensiveTransition:'counter_press',
      lineOfEngagement:'high',
    });
  });

  it('is idempotent once the canonical v2 shape is persisted', () => {
    const migrated = buildTacticsV2SaveBackfill(buildP2SaveBackfill({
      tactics:{ instructions:{ width:'narrow', transition:'hold_shape', chanceCreation:'work_ball' } },
      managerDNA:{ matches:4, wins:2 },
    }));

    expect(tacticsV2NeedsBackfill(migrated)).toBe(false);
    expect(buildTacticsV2SaveBackfill(migrated)).toEqual(migrated);
  });
});