import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  getSave:vi.fn(), getManager:vi.fn(), getPlayer:vi.fn(), getTeam:vi.fn(),
  putSave:vi.fn(), putTeam:vi.fn(), putPlayer:vi.fn(), putPlayersBulk:vi.fn(), putTeamsBulk:vi.fn(),
  addTransfer:vi.fn(), bulkPut:vi.fn(), settleTransferMarketDealAtomic:vi.fn(),
}));
vi.mock('./db.js', async (importOriginal) => ({ ...await importOriginal(), ...db }));

import {
  acceptMarketDeal, acceptOffer, buyPlayer, counterOffer, createUserMarketDeal,
  loanInPlayer, loanOutPlayer, rejectOffer, renewContract, sellPlayer,
  setManagedPlayerTransferListing, signFreeAgent, withdrawMarketDeal,
} from './transfers.js';
import { counterMarketDeal, submitContractTerms } from './transferDealActions.js';
import { terminateManagedPlayerContract } from './contracts.js';
import { addScoutingAssignment, hireManagedCoach, removeScoutingAssignment, setManagedDevelopmentPlan } from './p5Runtime.js';
import { startFacilityUpgrade } from './p7Runtime.js';
import { resolveCareerEvent } from './p8Runtime.js';
import { createCareerEventsState, createEventInstance } from './careerEvents.js';
import {
  cancelManagedYouthScoutingAssignment, createManagedYouthScoutingAssignment,
  promoteManagedAcademyPlayer, recallManagedLoan, releaseManagedAcademyPlayer,
} from './p9Runtime.js';
import { investInAcademy, promoteYouthPlayer, releaseYouthPlayer } from './youthAcademy.js';

describe('former club management commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.getSave.mockResolvedValue({ userTeamId:'former_club', userManagerId:'mgr_user' });
    db.getManager.mockResolvedValue({ id:'mgr_user', status:'unemployed', currentClubId:null });
    db.getPlayer.mockResolvedValue({ id:'p1', teamId:'former_club' });
  });

  it('blocks a stale board decision in Inbox before claiming or applying it', async () => {
    const save = {
      userTeamId:'former_club', userManagerId:'mgr_user', season:'2025/26',
      currentGameweek:5, currentDate:'2025-09-01T12:00:00.000Z', careerEvents:createCareerEventsState(),
    };
    const event = createEventInstance({ templateId:'board_pressure', participantIds:{ clubId:'former_club' }, tokens:{} }, save);
    save.careerEvents.active = [event];
    db.getSave.mockResolvedValue(save);
    await expect(resolveCareerEvent(event.id, 'take_blame')).rejects.toThrow('MANAGER_NOT_EMPLOYED');
    expect(db.putSave).not.toHaveBeenCalled();
    expect(db.putTeam).not.toHaveBeenCalled();
    expect(db.putPlayer).not.toHaveBeenCalled();
  });

  it.each([
    ['buy', () => buyPlayer('p1', 1_000_000)],
    ['sell', () => sellPlayer('p1')],
    ['renew', () => renewContract('p1')],
    ['sign free agent', () => signFreeAgent('p1')],
    ['list player', () => setManagedPlayerTransferListing('p1', true)],
    ['accept offer', () => acceptOffer('p1')],
    ['reject offer', () => rejectOffer('p1')],
    ['counter offer', () => counterOffer('p1', 1_000_000)],
    ['loan out', () => loanOutPlayer('p1')],
    ['loan in', () => loanInPlayer('p1')],
    ['create deal', () => createUserMarketDeal('p1')],
    ['withdraw deal', () => withdrawMarketDeal('deal')],
    ['accept deal', () => acceptMarketDeal('deal')],
    ['counter deal', () => counterMarketDeal('deal', 1_000_000)],
    ['contract offer', () => submitContractTerms({ playerId:'p1' })],
    ['terminate contract', () => terminateManagedPlayerContract('p1')],
    ['scouting', () => addScoutingAssignment({})],
    ['cancel scouting', () => removeScoutingAssignment('scout')],
    ['training', () => setManagedDevelopmentPlan('p1', 'balanced')],
    ['hire coach', () => hireManagedCoach('attack', 'coach')],
    ['facility upgrade', () => startFacilityUpgrade('training')],
    ['promote academy', () => promoteManagedAcademyPlayer('p1')],
    ['release academy', () => releaseManagedAcademyPlayer('p1')],
    ['recall loan', () => recallManagedLoan('p1')],
    ['youth scouting', () => createManagedYouthScoutingAssignment({})],
    ['cancel youth scouting', () => cancelManagedYouthScoutingAssignment('scout')],
    ['academy investment', () => investInAcademy(1_000_000)],
    ['legacy academy promotion', () => promoteYouthPlayer('p1')],
    ['legacy academy release', () => releaseYouthPlayer('p1')],
  ])('blocks %s before any save, player or finance write', async (_label, action) => {
    await expect(action()).rejects.toThrow('MANAGER_NOT_EMPLOYED');
    for (const write of [db.putSave, db.putTeam, db.putPlayer, db.putPlayersBulk, db.putTeamsBulk,
      db.addTransfer, db.bulkPut, db.settleTransferMarketDealAtomic]) expect(write).not.toHaveBeenCalled();
  });
});
