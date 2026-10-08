import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ getSave:vi.fn(), getManager:vi.fn() }));
vi.mock('./db.js', () => db);

import { canManageClub, requireClubEmployment } from './managerEmployment.js';

describe('club management authority', () => {
  const save = { userTeamId:'former_club', userManagerId:'mgr_user' };
  const manager = { id:'mgr_user', status:'employed', currentClubId:'former_club' };

  beforeEach(() => vi.resetAllMocks());

  it('requires the manager to be employed at the projected club', () => {
    expect(canManageClub(save, manager)).toBe(true);
    expect(canManageClub(save, { ...manager, status:'unemployed', currentClubId:null })).toBe(false);
    expect(canManageClub(save, { ...manager, currentClubId:'new_club' })).toBe(false);
    expect(canManageClub(save, { ...manager, id:'someone_else' })).toBe(false);
    expect(canManageClub(save, null)).toBe(false);
  });

  it('keeps pre-manager careers playable but never treats a missing save as a job', () => {
    expect(canManageClub({ userTeamId:'club' }, null)).toBe(true);
    expect(canManageClub({ userTeamId:'club', sacked:true }, null)).toBe(false);
    expect(canManageClub(null, manager)).toBe(false);
    expect(canManageClub({}, manager)).toBe(false);
  });

  it('reads current employment before a mutation, so a stale screen cannot control its former club', async () => {
    db.getSave.mockResolvedValue(save);
    db.getManager.mockResolvedValue({ ...manager, status:'unemployed', currentClubId:null });
    await expect(requireClubEmployment()).rejects.toThrow('MANAGER_NOT_EMPLOYED');
    expect(db.getManager).toHaveBeenCalledWith('mgr_user');
    db.getManager.mockResolvedValue(manager);
    await expect(requireClubEmployment()).resolves.toBe(save);
  });

  it('does not require manager rows for compatible legacy careers', async () => {
    const legacy = { userTeamId:'club' };
    db.getSave.mockResolvedValue(legacy);
    await expect(requireClubEmployment()).resolves.toBe(legacy);
    expect(db.getManager).not.toHaveBeenCalled();
  });
});
