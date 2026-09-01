import { describe, expect, it } from 'vitest';

import {
  addCompetingOffer,
  advanceMarketDeal,
  buildTransferMarketBackfill,
  canTransitionDeal,
  compactTransferMarket,
  createEmptyTransferMarket,
  createMarketDeal,
  deterministicMarketUnit,
  evaluatePlayerInterest,
  guaranteedFeeTotal,
  markTransferMarketTick,
  normalizeDealTerms,
  projectLegacyInboundOffers,
  rebuildReservedCommitments,
  transitionMarketDeal,
  validateDealTerms,
} from './transferMarket.js';

function player(extra = {}) {
  return {
    id:'p1', name:'Player One', teamId:'seller', position:'CM', age:24,
    attack:65, midfield:74, defence:62, goalkeeping:10,
    wage:40_000, value:18_000_000, fitness:100, form:55,
    individualMorale:45, sharpness:55, positionSuitability:{ CM:1 }, traits:[],
    squadRole:'important', ...extra,
  };
}

function terms(extra = {}) {
  return {
    fee:{ upfront:16_000_000, installments:[{ amount:4_000_000, dueSeason:'2026/27', dueGameweek:1 }], sellOnPercentage:10 },
    contract:{ wage:55_000, duration:4, squadRole:'important', signingBonus:500_000 },
    ...extra,
  };
}

function deal(extra = {}) {
  return createMarketDeal({
    type:'transfer', state:'seller_terms', playerId:'p1', playerName:'Player One',
    buyerTeamId:'buyer', sellerTeamId:'seller', createdBy:'user', userSide:'buyer',
    awaiting:'seller', createdWeekKey:'2025/26:2', expiresWeekKey:'2025/26:5',
    terms:terms(), delegated:false, ...extra,
  });
}

describe('P4 transfer-market contracts', () => {
  it('normalises structured priority terms and validates schedules', () => {
    const normalized = normalizeDealTerms(terms());
    expect(guaranteedFeeTotal(normalized)).toBe(20_000_000);
    expect(normalized.fee.sellOnPercentage).toBe(10);
    expect(normalized.contract).toMatchObject({ wage:55_000, duration:4, squadRole:'important' });
    expect(validateDealTerms(normalized, { type:'transfer', buyerTeamId:'buyer', sellerTeamId:'seller' })).toEqual(expect.objectContaining({ valid:true, errors:[] }));
    const invalid = validateDealTerms({
      fee:{ upfront:1, installments:[
        { amount:2, dueSeason:'2027/28', dueGameweek:1 },
        { amount:2, dueSeason:'2026/27', dueGameweek:1 },
      ] },
      loan:{ optionToBuy:4, obligationToBuy:5 },
    }, { type:'loan', buyerTeamId:'buyer', sellerTeamId:'seller' });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toEqual(expect.arrayContaining(['installment_schedule_order','conflicting_loan_to_buy']));
    const negative = validateDealTerms({
      fee:{ upfront:-1 },
      contract:{ wage:-10, duration:8 },
    }, { type:'transfer', buyerTeamId:'buyer', sellerTeamId:'seller' });
    expect(negative.errors).toEqual(expect.arrayContaining(['negative_amount','invalid_contract_duration']));
  });

  it('rejects illegal transitions without mutating the deal', () => {
    const original = deal();
    expect(canTransitionDeal('seller_terms', 'completed')).toBe(false);
    expect(() => transitionMarketDeal(original, 'completed')).toThrow('ILLEGAL_DEAL_TRANSITION');
    expect(original.state).toBe('seller_terms');
    const terminal = transitionMarketDeal(original, 'rejected', { weekKey:'2025/26:3', reasonCode:'seller_rejects' });
    expect(() => transitionMarketDeal(terminal, 'interest')).toThrow('DEAL_TERMINAL');
  });

  it('advances seller and player decisions deterministically from the same seed', () => {
    const subject = deal({ delegated:true, seed:'fixed-seed' });
    const context = {
      player:player(),
      buyer:{ id:'buyer', reputation:82, league:'Premier League' },
      seller:{ id:'seller', reputation:72, league:'Championship' },
      buyerSquad:[], marketValue:19_000_000, windowOpen:true,
    };
    const first = advanceMarketDeal(subject, context, '2025/26:3');
    const second = advanceMarketDeal(subject, context, '2025/26:3');
    expect(first).toEqual(second);
    expect(first.state).toBe('agreed');
    expect(first.decisionLog.map(entry => entry.to)).toEqual(['player_negotiation','agreed']);
    expect(advanceMarketDeal(first, context, '2025/26:3')).toBe(first);
    expect(deterministicMarketUnit('fixed', 'x')).toBe(deterministicMarketUnit('fixed', 'x'));
  });

  it('returns an explainable player decision with hard blockers', () => {
    const interested = evaluatePlayerInterest({
      player:player(),
      buyer:{ id:'buyer', reputation:86, league:'Premier League' },
      seller:{ id:'seller', reputation:68, league:'Championship' },
      buyerSquad:[], terms:terms(), buyerHasEurope:true,
    });
    expect(interested.interested).toBe(true);
    expect(interested.hardBlocker).toBeNull();
    expect(interested.strongestPositives.map(item => item.code)).toEqual(expect.arrayContaining(['club_step_up']));
    expect(interested.strongestConcern).toEqual(expect.any(String));

    const blocked = evaluatePlayerInterest({
      player:player({ signedThisSeason:true }),
      buyer:{ id:'buyer', reputation:99, league:'Premier League' },
      seller:{ id:'seller', reputation:60, league:'League One' },
      terms:terms(),
    });
    expect(blocked).toMatchObject({ interested:false, hardBlocker:'moved_this_season' });
  });

  it('allows a player to choose a materially better rival offer', () => {
    const subject = addCompetingOffer(
      transitionMarketDeal(deal(), 'player_negotiation', { weekKey:'2025/26:3', awaiting:'player' }),
      { clubId:'rival', packageValue:40_000_000, interestScore:95 },
      '2025/26:3',
    );
    const result = advanceMarketDeal(subject, {
      player:player(), buyer:{ id:'buyer', reputation:82, league:'Premier League' },
      seller:{ id:'seller', reputation:70, league:'Championship' }, buyerSquad:[], windowOpen:true,
    }, '2025/26:4');
    expect(result.state).toBe('hijacked');
    expect(result.decisionLog.at(-1).reasonCode).toBe('preferred_rival_offer');
  });

  it('migrates legacy pending offers once and keeps a compatibility projection', () => {
    const save = {
      userTeamId:'user', season:'2025/26', currentDate:'2025-08-16T00:00:00.000Z',
      inboundOffers:[{ playerId:'p1', playerName:'Player One', clubId:'buyer', clubName:'Buyer FC', fee:15_000_000, date:'2025-08-16', status:'pending' }],
      collapsedDeals:['p2'],
    };
    const once = buildTransferMarketBackfill(save);
    const twice = buildTransferMarketBackfill(once.save);
    expect(once.migratedDeals).toHaveLength(1);
    expect(twice.migratedDeals).toHaveLength(0);
    expect(twice.save.transferMarket.activeDeals).toHaveLength(1);
    expect(projectLegacyInboundOffers(twice.save.transferMarket)).toEqual([
      expect.objectContaining({ dealId:once.migratedDeals[0].id, playerId:'p1', clubId:'buyer', clubName:'Buyer FC', fee:15_000_000, status:'pending' }),
    ]);
  });

  it('reserves active commitments, compacts terminal state and marks ticks once', () => {
    const active = transitionMarketDeal(deal(), 'club_negotiation', { weekKey:'2025/26:3', awaiting:'user' });
    let market = rebuildReservedCommitments({ ...createEmptyTransferMarket(), activeDeals:[active] });
    expect(market.reservedCommitments).toEqual([{ dealId:active.id, clubId:'buyer', amount:20_500_000 }]);
    const rejected = transitionMarketDeal(active, 'rejected', { weekKey:'2025/26:4', reasonCode:'walked_away' });
    market = compactTransferMarket({ ...market, activeDeals:[rejected] });
    expect(market.activeDeals).toEqual([]);
    expect(market.terminalSummaries[0]).toMatchObject({ id:rejected.id, state:'rejected' });
    const ticked = markTransferMarketTick(market, 'week:2025/26:4');
    expect(markTransferMarketTick(ticked, 'week:2025/26:4')).toBe(ticked);
  });
});
