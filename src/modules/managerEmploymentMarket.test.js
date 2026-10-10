import { describe, expect, it } from 'vitest';
import { delegateFormerClubMarketDeals } from './transfers.js';
import { createMarketDeal, normalizeTransferMarket } from './transferMarket.js';

describe('former club transfer delegation', () => {
  it('returns seller bids and player counters to AI authority without changing clubs or terms', () => {
    const make = (id, state, buyerTeamId, sellerTeamId) => createMarketDeal({
      id, state, buyerTeamId, sellerTeamId, playerId:`p_${id}`, userSide:'seller',
      stateOwner:'user', awaiting:'user', delegated:false,
      terms:{ fee:{ upfront:1_000_000 }, contract:{ wage:10_000, duration:3 } },
    });
    const inbound = make('sale', 'club_negotiation', 'buyer', 'former');
    const contract = make('buy', 'player_negotiation', 'former', 'seller');
    const unrelated = make('other', 'club_negotiation', 'other_buyer', 'other_seller');
    const result = delegateFormerClubMarketDeals(normalizeTransferMarket({ activeDeals:[inbound, contract, unrelated] }), 'former');
    const [sale, buy, other] = result.activeDeals;
    expect(sale).toMatchObject({ buyerTeamId:'buyer', sellerTeamId:'former', delegated:true, awaiting:'seller', stateOwner:'seller', userSide:null });
    expect(buy).toMatchObject({ buyerTeamId:'former', sellerTeamId:'seller', delegated:true, awaiting:'player', stateOwner:'player', userSide:null });
    expect(sale.terms).toEqual(inbound.terms);
    expect(buy.terms).toEqual(contract.terms);
    expect(other).toEqual(unrelated);
    expect(delegateFormerClubMarketDeals(result, 'former')).toEqual(result);
  });
});
