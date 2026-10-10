import { describe, expect, it, vi } from 'vitest';
import { advanceUnemployedWorldWeek } from './managerWorldAdvance.js';

describe('unemployed world advance', () => {
  const unemployed = { id:'mgr_user', status:'unemployed', currentClubId:null };
  const initial = { season:'2025/26', currentGameweek:5, userTeamId:'old_club', userManagerId:'mgr_user', pendingEvents:[] };

  it('drains league and cup events through the existing advance, then stops at the next week', async () => {
    let save = { ...initial };
    const events = [{ id:'league' }, { id:'cup' }, { id:'europe' }];
    const advance = vi.fn(async () => {
      const remaining = advance.mock.calls.length === 1 ? events.slice(1) : save.pendingEvents.slice(1);
      save = { ...save, pendingEvents:remaining, currentGameweek:remaining.length ? 5 : 6 };
    });
    const result = await advanceUnemployedWorldWeek({ readSave:async () => save, readManager:async () => unemployed, advance });
    expect(advance).toHaveBeenCalledTimes(3);
    expect(result.currentGameweek).toBe(6);
    expect(result.pendingEvents).toEqual([]);
  });

  it('advances a fixture-free week once and stops', async () => {
    let save = { ...initial };
    const advance = vi.fn(async () => { save = { ...save, currentGameweek:6 }; });
    await advanceUnemployedWorldWeek({ readSave:async () => save, readManager:async () => unemployed, advance });
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it('refuses to automate an employed manager’s matches', async () => {
    const advance = vi.fn();
    await expect(advanceUnemployedWorldWeek({ readSave:async () => initial, readManager:async () => ({ ...unemployed, status:'employed', currentClubId:'old_club' }), advance })).rejects.toThrow('MANAGER_ALREADY_EMPLOYED');
    expect(advance).not.toHaveBeenCalled();
  });

  it('fails visibly instead of looping when simulation makes no progress', async () => {
    const advance = vi.fn();
    await expect(advanceUnemployedWorldWeek({ readSave:async () => initial, readManager:async () => unemployed, advance })).rejects.toThrow('WORLD_WEEK_DID_NOT_ADVANCE');
    expect(advance).toHaveBeenCalledTimes(1);
  });
});
