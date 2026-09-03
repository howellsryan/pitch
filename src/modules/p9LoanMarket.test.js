import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  getAllPlayers:vi.fn(async () => []),
  getPlayer:vi.fn(async () => null),
  getSave:vi.fn(async () => null),
  getTeam:vi.fn(async () => null),
  putSave:vi.fn(async () => {}),
}));

vi.mock('./db.js', () => db);
vi.mock('./transfers.js', () => ({
  isTransferWindowOpen:vi.fn(() => ({ open:true, window:'summer' })),
}));

import { requestManagedLoanOutOffer } from './p9LoanMarket.js';

function senior(id, teamId, extra = {}) {
  return {
    id,
    name:id,
    teamId,
    contractTeamId:teamId,
    registeredTeamId:teamId,
    playerStatus:'first_team',
    isYouth:false,
    inSquad:true,
    onLoan:false,
    loanedFrom:null,
    loanedTo:null,
    loanOriginalTeamId:null,
    signedThisSeason:false,
    position:'CM',
    age:20,
    attack:60,
    midfield:72,
    defence:58,
    goalkeeping:10,
    value:10_000_000,
    wage:20_000,
    fitness:100,
    form:50,
    individualMorale:50,
    sharpness:50,
    positionSuitability:{ CM:1 },
    traits:[],
    lifecycleVersion:1,
    activeAgreementId:null,
    activeLoanAgreement:null,
    registrationSpells:[],
    lifecycleTransitionKeys:[],
    ...extra,
  };
}

const save = {
  id:'active',
  season:'2025/26',
  currentGameweek:2,
  totalGameweeks:38,
  currentDate:'2025-08-16T12:00:00.000Z',
  userTeamId:'parent',
  transferMarket:null,
  inboundOffers:[],
};
const parent = { id:'parent', name:'Parent FC', reputation:78, budget:60_000_000, league:'Premier League' };
const destination = {
  id:'destination', name:'Pathway FC', reputation:66, budget:30_000_000, league:'Championship',
  facilities:{ tracks:{ training:{ level:2 }, scouting:{ level:2 }, medical:{ level:2 }, academy:{ level:2 } } },
};

describe('P9 outbound loan agreement bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const player = senior('prospect', 'parent');
    db.getSave.mockResolvedValue(save);
    db.getPlayer.mockResolvedValue(player);
    db.getAllPlayers.mockResolvedValue([player]);
    db.getTeam.mockImplementation(async id => id === 'parent' ? parent : id === 'destination' ? destination : null);
  });

  it('creates an AI-originated P4 loan offer awaiting the manager as seller without moving the player', async () => {
    const result = await requestManagedLoanOutOffer('prospect', 'destination');

    expect(result.deal).toMatchObject({
      type:'loan',
      state:'club_negotiation',
      playerId:'prospect',
      buyerTeamId:'destination',
      sellerTeamId:'parent',
      createdBy:'ai',
      userSide:'seller',
      stateOwner:'user',
      awaiting:'user',
    });
    expect(result.deal.terms.loan).toMatchObject({
      fee:1_000_000,
      wageContributionPercentage:100,
      recall:true,
      optionToBuy:0,
      obligationToBuy:0,
    });
    expect(result.deal.terms.contract.squadRole).toBe(result.projection.expectedRole);

    expect(db.putSave).toHaveBeenCalledTimes(1);
    const persisted = db.putSave.mock.calls[0][0];
    expect(persisted.transferMarket.activeDeals).toHaveLength(1);
    expect(persisted.transferMarket.activeDeals[0].state).toBe('club_negotiation');
    await expect(db.getPlayer.mock.results[0].value).resolves.toMatchObject({ teamId:'parent', onLoan:false });
  });

  it('does not create a second agreement while that player already has an active market deal', async () => {
    const first = await requestManagedLoanOutOffer('prospect', 'destination');
    db.getSave.mockResolvedValue({ ...save, transferMarket:db.putSave.mock.calls[0][0].transferMarket });

    await expect(requestManagedLoanOutOffer('prospect', 'destination')).rejects.toThrow('PLAYER_HAS_ACTIVE_DEAL');
    expect(first.deal.playerId).toBe('prospect');
    expect(db.putSave).toHaveBeenCalledTimes(1);
  });
});
