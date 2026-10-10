import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildCloudSaveBlob:vi.fn(),
  deleteCareerSlot:vi.fn(),
  deleteSave:vi.fn(),
  getActiveSlotId:vi.fn(() => 'legacy'),
  getCareerSlotSummaries:vi.fn(async () => []),
  getSave:vi.fn(async () => null),
  getCloudSave:vi.fn(),
  listSaves:vi.fn(),
  restoreFromCloudBlob:vi.fn(),
  isSignedIn:vi.fn(),
  putSave:vi.fn(),
}));

vi.mock('../modules/db.js', () => ({
  buildCloudSaveBlob:mocks.buildCloudSaveBlob,
  deleteCareerSlot:mocks.deleteCareerSlot,
  getActiveSlotId:mocks.getActiveSlotId,
  getCareerSlotSummaries:mocks.getCareerSlotSummaries,
  getSave:mocks.getSave,
  restoreFromCloudBlob:mocks.restoreFromCloudBlob,
}));

vi.mock('./api.js', () => ({
  api:{
    deleteSave:mocks.deleteSave,
    getSave:mocks.getCloudSave,
    listSaves:mocks.listSaves,
    putSave:mocks.putSave,
  },
  isSignedIn:mocks.isSignedIn,
}));

import { deleteCareerEverywhere, pullAndApplyCloudSave, pushSaveToCloud } from './sync.js';

describe('empty-device cloud restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSignedIn.mockReturnValue(true);
    mocks.getActiveSlotId.mockReturnValue('legacy');
    mocks.getSave.mockResolvedValue(null);
    mocks.getCareerSlotSummaries.mockResolvedValue([]);
    mocks.listSaves.mockResolvedValue({ slots:[{ slotId:'career_latest', updatedAt:200 }, { slotId:'legacy', updatedAt:100 }] });
    mocks.getCloudSave.mockResolvedValue({ save:{ save_blob:'cloud-blob' } });
    mocks.restoreFromCloudBlob.mockResolvedValue({ teamId:'club' });
  });

  it('discovers the latest generated career slot on a fresh device rather than requesting only legacy', async () => {
    const result = await pullAndApplyCloudSave();
    expect(result).toMatchObject({ applied:true, slotId:'career_latest' });
    expect(mocks.getCloudSave).toHaveBeenCalledWith('career_latest');
    expect(mocks.restoreFromCloudBlob).toHaveBeenCalledWith('cloud-blob', 'career_latest');
  });

  it('preserves an existing local career without even fetching a cloud replacement', async () => {
    mocks.getSave.mockResolvedValue({ userTeamId:'local_club' });
    const result = await pullAndApplyCloudSave();
    expect(result).toMatchObject({ applied:false, reason:'local_career_exists' });
    expect(mocks.listSaves).not.toHaveBeenCalled();
    expect(mocks.getCloudSave).not.toHaveBeenCalled();
    expect(mocks.restoreFromCloudBlob).not.toHaveBeenCalled();
  });

  it('preserves a local career created while the cloud request was pending', async () => {
    mocks.getCloudSave.mockImplementation(async () => {
      mocks.getSave.mockResolvedValue({ userTeamId:'new_local_club' });
      return { save:{ save_blob:'old_cloud' } };
    });
    expect(await pullAndApplyCloudSave()).toMatchObject({ applied:false, reason:'local_career_exists' });
    expect(mocks.restoreFromCloudBlob).not.toHaveBeenCalled();
  });

  it('does not overwrite a saved target career even when the active local slot is empty', async () => {
    mocks.getCareerSlotSummaries.mockResolvedValue([{ slotId:'career_latest', clubName:'Existing club' }]);
    expect(await pullAndApplyCloudSave()).toMatchObject({ applied:false, reason:'local_career_exists' });
    expect(mocks.restoreFromCloudBlob).not.toHaveBeenCalled();
  });

  it('retains legacy restore compatibility when no slot-list entries exist', async () => {
    mocks.listSaves.mockResolvedValue({ slots:[] });
    expect(await pullAndApplyCloudSave()).toMatchObject({ applied:true, slotId:'legacy' });
    expect(mocks.getCloudSave).toHaveBeenCalledWith('legacy');
  });
});

describe('deleteCareerEverywhere', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildCloudSaveBlob.mockResolvedValue({ blob:'blob', meta:{} });
    mocks.deleteSave.mockResolvedValue({ ok:true });
    mocks.deleteCareerSlot.mockResolvedValue(undefined);
    mocks.getActiveSlotId.mockReturnValue('legacy');
    mocks.putSave.mockResolvedValue({ ok:true });
  });

  it('deletes the cloud row before local state so reload cannot restore it', async () => {
    mocks.isSignedIn.mockReturnValue(true);

    await deleteCareerEverywhere('career_alpha');

    expect(mocks.deleteSave).toHaveBeenCalledWith('career_alpha');
    expect(mocks.deleteCareerSlot).toHaveBeenCalledWith('career_alpha');
    expect(mocks.deleteSave.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.deleteCareerSlot.mock.invocationCallOrder[0]);
  });

  it('retains the local career when cloud deletion fails', async () => {
    mocks.isSignedIn.mockReturnValue(true);
    mocks.deleteSave.mockRejectedValue(new Error('offline'));

    await expect(deleteCareerEverywhere('career_alpha')).rejects.toThrow('offline');
    expect(mocks.deleteCareerSlot).not.toHaveBeenCalled();
  });

  it('waits for an in-flight push before deleting so the row cannot be recreated', async () => {
    mocks.isSignedIn.mockReturnValue(true);
    mocks.getActiveSlotId.mockReturnValue('career_alpha');
    let finishPush;
    mocks.putSave.mockReturnValue(new Promise(resolve => { finishPush = resolve; }));

    const push = pushSaveToCloud();
    await vi.waitFor(() => expect(mocks.putSave).toHaveBeenCalled());
    const deletion = deleteCareerEverywhere('career_alpha');
    await Promise.resolve();
    expect(mocks.deleteSave).not.toHaveBeenCalled();

    finishPush({ ok:true });
    await push;
    await deletion;

    expect(mocks.deleteSave).toHaveBeenCalledWith('career_alpha');
  });

  it('deletes locally without making a cloud request when signed out', async () => {
    mocks.isSignedIn.mockReturnValue(false);

    await deleteCareerEverywhere('legacy');

    expect(mocks.deleteSave).not.toHaveBeenCalled();
    expect(mocks.deleteCareerSlot).toHaveBeenCalledWith('legacy');
  });
});
