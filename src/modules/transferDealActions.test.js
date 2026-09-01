import { describe, expect, it } from 'vitest';

import { createMarketDeal, guaranteedFeeTotal } from './transferMarket.js';
import { isUserClubDeal, resolveInboundSellerCounter } from './transferDealActions.js';

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

describe('P4 user transfer-deal actions', () => {
  it('projects only deals involving the managed club', () => {
    expect(isUserClubDeal({ buyerTeamId:'user', sellerTeamId:'other' }, 'user')).toBe(true);
    expect(isUserClubDeal({ buyerTeamId:'other', sellerTeamId:'user' }, 'user')).toBe(true);
    expect(isUserClubDeal({ buyerTeamId:'club_a', sellerTeamId:'club_b' }, 'user')).toBe(false);
    expect(isUserClubDeal({ id:'legacy_collapsed_123', buyerTeamId:null, sellerTeamId:null }, 'user')).toBe(true);
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
});
