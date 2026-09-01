import { describe, expect, it } from 'vitest';

import { createMarketDeal, guaranteedFeeTotal, transitionMarketDeal } from './transferMarket.js';
import {
  buildManagedClubInboundDeal,
  isUserClubDeal,
  resolveInboundSellerCounter,
  resolveRenewalContractOffer,
} from './transferDealActions.js';

function inboundDeal(extra = {}) {
  return createMarketDeal({
    type:'transfer',
    state:'club_negotiation',
    playerId:'p1',
    playerName:'Player One',
    buyerTeamId:'ai_buyer',
    sellerTeamId:'user',
    createdBy:'ai',
    userSide:'seller',
    stateOwner:'user',
    awaiting:'user',
    createdWeekKey:'2025/26:2',
    expiresWeekKey:'2025/26:5',
    seed:'inbound-seed',
    terms:{ fee:{ upfront:18_000_000 }, contract:{ wage:50_000, duration:3, squadRole:'rotation' } },
    ...extra,
  });
}

function renewalDeal(extra = {}) {
  return createMarketDeal({
    type:'renewal',
    state:'player_negotiation',
    playerId:'p1',
    playerName:'Player One',
    buyerTeamId:'user',
    sellerTeamId:'user',
    createdBy:'user',
    userSide:'club',
    stateOwner:'player',
    awaiting:'player',
    createdWeekKey:'2025/26:2',
    expiresWeekKey:'2025/26:5',
    seed:'renewal-seed',
    terms:{ contract:{ wage:42_000, duration:2, squadRole:'rotation', signingBonus:0 } },
    ...extra,
  });
}

const renewalPlayer = {
  id:'p1', name:'Player One', teamId:'user', age:26, wage:50_000,
  squadRole:'important', individualMorale:55,
};

describe('P4 user transfer-deal actions', () => {
  it('projects only deals involving the managed club', () => {
    expect(isUserClubDeal({ buyerTeamId:'user', sellerTeamId:'other' }, 'user')).toBe(true);
    expect(isUserClubDeal({ buyerTeamId:'other', sellerTeamId:'user' }, 'user')).toBe(true);
    expect(isUserClubDeal({ buyerTeamId:'club_a', sellerTeamId:'club_b' }, 'user')).toBe(false);
    expect(isUserClubDeal({ id:'legacy_collapsed_123', buyerTeamId:null, sellerTeamId:null }, 'user')).toBe(true);
  });

  it('repairs a pending inbound offer into a managed-club deal', () => {
    const deal = buildManagedClubInboundDeal({
      playerId:'p1', playerName:'Player One', clubId:'ai_buyer', clubName:'Buyer FC',
      fee:19_500_000, date:'2025-08-20', status:'pending',
    }, { userTeamId:'user', season:'2025/26', currentGameweek:2, currentDate:'2025-08-20T00:00:00.000Z' });

    expect(deal).toMatchObject({
      type:'transfer', state:'club_negotiation', buyerTeamId:'ai_buyer', sellerTeamId:'user',
      userSide:'seller', awaiting:'user',
    });
    expect(guaranteedFeeTotal(deal.terms)).toBe(19_500_000);
    expect(isUserClubDeal(deal, 'user')).toBe(true);
  });

  it('supports repeated seller counters when the AI buyer counters back', () => {
    const deal = inboundDeal();
    const args = {
      terms:{ ...deal.terms, fee:{ ...deal.terms.fee, upfront:24_000_000 } },
      buyer:{ id:'ai_buyer', budget:60_000_000 },
      marketValue:20_000_000,
      weekKey:'2025/26:2',
    };
    const first = resolveInboundSellerCounter(deal, args);
    const repeat = resolveInboundSellerCounter(first, {
      ...args,
      terms:{ ...first.terms, fee:{ ...first.terms.fee, upfront:23_000_000 } },
    });

    expect(resolveInboundSellerCounter(deal, args)).toEqual(first);
    expect(first.state).toBe('club_negotiation');
    expect(first.awaiting).toBe('user');
    expect(first.decisionLog.map(entry => entry.reasonCode)).toEqual(['user_counter', 'buyer_counter']);
    expect(guaranteedFeeTotal(first.terms)).toBeGreaterThan(18_000_000);
    expect(guaranteedFeeTotal(first.terms)).toBeLessThan(24_000_000);
    expect(repeat.decisionLog).toHaveLength(4);
    expect(repeat.decisionLog[2].reasonCode).toBe('user_counter');
  });

  it('allows the AI buyer to accept a reasonable seller counter', () => {
    const deal = inboundDeal();
    const result = resolveInboundSellerCounter(deal, {
      terms:{ ...deal.terms, fee:{ ...deal.terms.fee, upfront:20_000_000 } },
      buyer:{ id:'ai_buyer', budget:60_000_000 },
      marketValue:20_000_000,
      weekKey:'2025/26:2',
    });

    expect(result.state).toBe('player_negotiation');
    expect(result.awaiting).toBe('player');
    expect(result.decisionLog.map(entry => entry.reasonCode)).toEqual(['user_counter', 'buyer_accepts_counter']);
  });

  it('counters a weak renewal instead of rejecting a player for already being at the club', () => {
    const result = resolveRenewalContractOffer(renewalDeal(), {
      player:renewalPlayer,
      terms:{ contract:{ wage:42_000, duration:2, squadRole:'rotation', signingBonus:0 } },
      weekKey:'2025/26:2',
    });

    expect(result.state).toBe('player_negotiation');
    expect(result.awaiting).toBe('user');
    expect(result.decisionLog.at(-1).reasonCode).toBe('player_contract_counter');
    expect(result.interest.hardBlocker).toBeNull();
    expect(result.interest.negotiableTerms).toEqual(expect.arrayContaining(['wage','duration','squadRole','signingBonus']));
    expect(result.terms.contract.wage).toBeGreaterThan(renewalPlayer.wage);
    expect(result.terms.contract.duration).toBeGreaterThanOrEqual(3);
    expect(result.terms.contract.squadRole).toBe('important');
  });

  it('can agree a materially improved renewal after a player counter', () => {
    const first = resolveRenewalContractOffer(renewalDeal(), {
      player:renewalPlayer,
      terms:{ contract:{ wage:42_000, duration:2, squadRole:'rotation', signingBonus:0 } },
      weekKey:'2025/26:2',
    });
    const generous = {
      ...first.terms,
      contract:{ ...first.terms.contract, wage:75_000, duration:5, squadRole:'crucial', signingBonus:500_000 },
    };
    const sentBack = transitionMarketDeal(first, 'player_negotiation', {
      eventKey:'2025/26:2:test-user-counter', weekKey:'2025/26:2', actor:'user',
      reasonCode:'user_contract_counter', awaiting:'player', stateOwner:'player', terms:generous,
    });
    const agreed = resolveRenewalContractOffer(sentBack, {
      player:renewalPlayer,
      terms:generous,
      weekKey:'2025/26:2',
    });

    expect(agreed.state).toBe('agreed');
    expect(agreed.awaiting).toBe('completion');
    expect(agreed.decisionLog.at(-1).reasonCode).toBe('player_accepts_renewal');
  });
});
