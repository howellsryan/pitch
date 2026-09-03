import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildCloudSaveBlob:vi.fn(),
  deleteCareerSlot:vi.fn(),
  deleteSave:vi.fn(),
  getActiveSlotId:vi.fn(() => 'legacy'),
  isSignedIn:vi.fn(),
  putSave:vi.fn(),
}));

vi.mock('../modules/db.js', () => ({
  buildCloudSaveBlob:mocks.buildCloudSaveBlob,
  deleteCareerSlot:mocks.deleteCareerSlot,
  getActiveSlotId:mocks.getActiveSlotId,
  restoreFromCloudBlob:vi.fn(),
}));

vi.mock('./api.js', () => ({
  api:{
    deleteSave:mocks.deleteSave,
    getSave:vi.fn(),
    listSaves:vi.fn(),
    putSave:mocks.putSave,
  },
  isSignedIn:mocks.isSignedIn,
}));

import { deleteCareerEverywhere, pushSaveToCloud } from './sync.js';

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
