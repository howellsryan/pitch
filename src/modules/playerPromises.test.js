import { describe, expect, it } from 'vitest';
import {
  PLAYING_TIME_WINDOW_WEEKS,
  SQUAD_ROLE_DEFS,
  assignDefaultSquadRoles,
  buildPersonalStatePatches,
  createPlayingTimeAgreement,
  normalizePlayerModel,
  setPlayerSquadRole,
  settlePlayingTimeAgreement,
} from './playerModel.js';

function squadPlayer(id, rating, overrides = {}) {
  return normalizePlayerModel({
    id,
    name:`Player ${id}`,
    position:'CM',
    attack:rating - 5,
    midfield:rating,
    defence:rating - 8,
    goalkeeping:10,
    teamId:'user',
    age:25,
    contractExpiry:2028,
    appearances:0,
    minutes:0,
    form:50,
    fitness:100,
    ...overrides,
  });
}

function settleWeek(player, gw, { played = false, minutes = 0, season = '2025/26' } = {}) {
  const next = {
    ...player,
    appearances:(player.appearances ?? 0) + (played ? 1 : 0),
    minutes:(player.minutes ?? 0) + minutes,
  };
  return settlePlayingTimeAgreement(next, gw, season);
}

describe('P3 default squad roles', () => {
  it('assigns roles by durable squad rank while keeping promise history managed-club only', () => {
    const user = Array.from({ length:18 }, (_, index) => squadPlayer(`u${index}`, 90 - index, {
      age:index >= 15 ? 20 : 25,
    }));
    const ai = Array.from({ length:18 }, (_, index) => squadPlayer(`a${index}`, 88 - index, {
      teamId:'ai',
      age:index >= 15 ? 19 : 25,
    }));

    const assigned = assignDefaultSquadRoles([...user, ...ai], {
      currentYear:2025,
      managedTeamId:'user',
    });
    const userAssigned = assigned.filter(player => player.teamId === 'user');
    const aiAssigned = assigned.filter(player => player.teamId === 'ai');

    expect(userAssigned.slice(0, 3).every(player => player.squadRole === 'crucial')).toBe(true);
    expect(userAssigned.slice(3, 8).every(player => player.squadRole === 'important')).toBe(true);
    expect(userAssigned.slice(8, 15).every(player => player.squadRole === 'rotation')).toBe(true);
    expect(userAssigned.slice(15).every(player => player.squadRole === 'prospect')).toBe(true);
    expect(userAssigned.every(player => player.playingTimeAgreement?.scope === 'managed')).toBe(true);
    expect(aiAssigned.every(player => player.squadRole != null)).toBe(true);
    expect(aiAssigned.every(player => player.playingTimeAgreement == null)).toBe(true);
  });

  it('uses loan/contract context only to nudge the initial expectation', () => {
    const players = [
      squadPlayer('expired_star', 92, { contractExpiry:2025 }),
      squadPlayer('loan_youth', 55, { age:20, onLoan:true, loanedFrom:'parent' }),
      ...Array.from({ length:14 }, (_, index) => squadPlayer(`p${index}`, 85 - index)),
    ];
    const assigned = assignDefaultSquadRoles(players, { currentYear:2025, managedTeamId:'user' });
    expect(assigned.find(player => player.id === 'expired_star').squadRole).toBe('important');
    expect(['rotation', 'important', 'crucial']).toContain(assigned.find(player => player.id === 'loan_youth').squadRole);
  });

  it('resets the rolling agreement when the manager changes a role', () => {
    const subject = {
      ...squadPlayer('role_change', 82),
      squadRole:'rotation',
      squadRoleSource:'auto',
      squadRoleTeamId:'user',
      playingTimeAgreement:{
        ...createPlayingTimeAgreement('rotation', 'user'),
        status:'at_risk',
        history:[{ key:'2025/26:4', appeared:false, minutes:0 }],
      },
    };
    const changed = setPlayerSquadRole(subject, 'important');
    expect(changed.squadRole).toBe('important');
    expect(changed.squadRoleSource).toBe('manager');
    expect(changed.playingTimeAgreement.role).toBe('important');
    expect(changed.playingTimeAgreement.status).toBe('settling');
    expect(changed.playingTimeAgreement.history).toEqual([]);
  });
});

describe('P3 rolling playing-time promises', () => {
  function crucialPlayer() {
    return {
      ...squadPlayer('crucial', 90),
      squadRole:'crucial',
      squadRoleSource:'auto',
      squadRoleTeamId:'user',
      playingTimeAgreement:createPlayingTimeAgreement('crucial', 'user'),
    };
  }

  it('does not turn one omission into an instant violation', () => {
    const week1 = settleWeek(crucialPlayer(), 1);
    const week2 = settleWeek(week1, 2);
    expect(week1.playingTimeAgreement.status).toBe('settling');
    expect(week2.playingTimeAgreement.status).toBe('settling');
    expect(week2.playingTimeAgreement.history).toHaveLength(2);
  });

  it('moves through at-risk to broken only after sustained under-delivery', () => {
    let subject = crucialPlayer();
    for (let gw = 1; gw <= 3; gw++) subject = settleWeek(subject, gw);
    expect(subject.playingTimeAgreement.status).toBe('at_risk');
    const moraleAtRisk = subject.individualMorale;
    for (let gw = 4; gw <= PLAYING_TIME_WINDOW_WEEKS; gw++) subject = settleWeek(subject, gw);
    expect(subject.playingTimeAgreement.status).toBe('broken');
    expect(subject.individualMorale).toBeLessThan(moraleAtRisk);
    expect(subject.playingTimeAgreement.history).toHaveLength(PLAYING_TIME_WINDOW_WEEKS);
  });

  it('fulfils a Crucial promise through sustained starts/minutes', () => {
    let subject = crucialPlayer();
    for (let gw = 1; gw <= 4; gw++) subject = settleWeek(subject, gw, { played:true, minutes:90 });
    expect(subject.playingTimeAgreement.status).toBe('fulfilled');
    expect(subject.playingTimeAgreement.appearanceShare).toBe(1);
    expect(subject.playingTimeAgreement.minuteShare).toBe(1);
    expect(subject.playingTimeAgreement.deliveryScore).toBeGreaterThanOrEqual(1);
    expect(SQUAD_ROLE_DEFS.crucial.appearanceShare).toBeGreaterThan(SQUAD_ROLE_DEFS.rotation.appearanceShare);
  });

  it('is idempotent for the same season-scoped world week', () => {
    const once = settleWeek(crucialPlayer(), 3, { played:true, minutes:90 });
    expect(settlePlayingTimeAgreement(once, 3, '2025/26')).toBe(once);
  });
});

describe('P3 promise handoff and bounded weekly writes', () => {
  it('invalidates the old club agreement after a transfer and remaps the role for the new team', () => {
    const user = Array.from({ length:16 }, (_, index) => squadPlayer(`u${index}`, 90 - index));
    const ai = Array.from({ length:16 }, (_, index) => squadPlayer(`a${index}`, 86 - index, { teamId:'ai' }));
    let assigned = assignDefaultSquadRoles([...user, ...ai], { currentYear:2025, managedTeamId:'user' });
    const movedIndex = assigned.findIndex(player => player.id === 'u0');
    assigned[movedIndex] = { ...assigned[movedIndex], teamId:'ai' };

    const remapped = assignDefaultSquadRoles(assigned, { currentYear:2025, managedTeamId:'user' });
    const moved = remapped.find(player => player.id === 'u0');
    expect(moved.squadRoleTeamId).toBe('ai');
    expect(moved.playingTimeAgreement).toBeNull();
    expect(moved.squadRoleSource).toBe('auto');
  });

  it('creates weekly promise history only for the inferred managed squad', () => {
    const user = assignDefaultSquadRoles([
      squadPlayer('u1', 88), squadPlayer('u2', 82), squadPlayer('u3', 76),
    ], { currentYear:2025, managedTeamId:'user' });
    const ai = assignDefaultSquadRoles([
      squadPlayer('a1', 88, { teamId:'ai' }), squadPlayer('a2', 82, { teamId:'ai' }),
    ], { currentYear:2025, managedTeamId:'user' });

    const patches = buildPersonalStatePatches([...user, ...ai], 1, '2025/26');
    expect(patches.filter(player => player.teamId === 'user')).toHaveLength(3);
    expect(patches.filter(player => player.teamId === 'ai')).toHaveLength(0);
    expect(patches.every(player => player.playingTimeAgreement?.history?.length === 1)).toBe(true);
  });
});
