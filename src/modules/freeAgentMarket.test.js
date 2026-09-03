import { describe, expect, it } from 'vitest';
import { createMarketDeal, dealCommitmentAmount, guaranteedFeeTotal, normalizeTransferMarket } from './transferMarket.js';

describe('free-agent transfer market integration', () => {
  it('turns an AI transfer-shaped free-agent approach into direct player terms', () => {
    const deal = createMarketDeal({
      type:'transfer',
      state:'seller_terms',
      playerId:'fa-1',
      playerName:'Free Agent',
      buyerTeamId:'club_a',
      sellerTeamId:'free_agents',
      createdBy:'ai',
      stateOwner:'seller',
      awaiting:'seller',
      createdWeekKey:'2025/26:2',
      terms:{
        fee:{ upfront:12_000_000, installments:[{ id:'i1', amount:2_000_000, dueSeason:'2026/27', dueGameweek:1 }] },
        contract:{ wage:70_000, duration:3, squadRole:'important', signingBonus:250_000 },
      },
    });

    expect(deal.type).toBe('free_agent');
    expect(deal.state).toBe('player_negotiation');
    expect(deal.awaiting).toBe('player');
    expect(deal.stateOwner).toBe('player');
    expect(guaranteedFeeTotal(deal.terms)).toBe(0);
    expect(deal.terms.fee.installments).toEqual([]);
    expect(deal.termsValid).toBe(true);
    expect(dealCommitmentAmount(deal)).toBe(250_000);
  });

  it('repairs an already-persisted malformed AI free-agent deal on market load', () => {
    const market = normalizeTransferMarket({
      version:1,
      nextDealOrdinal:2,
      activeDeals:[{
        id:'persisted-deal',
        type:'transfer',
        state:'club_negotiation',
        playerId:'fa-2',
        buyerTeamId:'club_b',
        sellerTeamId:'free_agents',
        createdBy:'ai',
        stateOwner:'seller',
        awaiting:'seller',
        createdWeekKey:'2025/26:3',
        updatedWeekKey:'2025/26:3',
        terms:{ fee:{ upfront:8_000_000 }, contract:{ wage:50_000, duration:3, squadRole:'rotation' } },
      }],
    });

    expect(market.activeDeals[0].id).toBe('persisted-deal');
    expect(market.activeDeals[0].type).toBe('free_agent');
    expect(market.activeDeals[0].state).toBe('player_negotiation');
    expect(market.activeDeals[0].awaiting).toBe('player');
    expect(guaranteedFeeTotal(market.activeDeals[0].terms)).toBe(0);
  });
});
