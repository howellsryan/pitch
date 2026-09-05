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
  isPlayerCounterAwaitingUser,
  markTransferMarketTick,
  normalizeDealTerms,
  projectPlayerDecisionNotifications,
  projectLegacyInboundOffers,
  rebuildReservedCommitments,
  resolvePlayerContractDecision,
  rolloverTransferMarket,
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
  it('projects each current-tick player accept, rejection and counter for the managed club', () => {
    const tickKey = '2025/26:4';
    const responseDeal = (id, playerName, reasonCode) => ({
      id, playerId:id, playerName, buyerTeamId:'user', sellerTeamId:'seller',
      decisionLog:[{ actor:'player', weekKey:tickKey, reasonCode }],
    });
    const responses = projectPlayerDecisionNotifications([
      responseDeal('accepted', 'Alex Accepts', 'player_accepts'),
      responseDeal('rejected', 'Rory Rejects', 'player_rejects'),
      responseDeal('countered', 'Casey Counters', 'player_counter'),
      { ...responseDeal('old', 'Old Response', 'player_accepts'), decisionLog:[{ actor:'player', weekKey:'2025/26:3', reasonCode:'player_accepts' }] },
      { ...responseDeal('other', 'Other Club', 'player_accepts'), buyerTeamId:'other', sellerTeamId:'another' },
    ], 'user', tickKey);

    expect(responses.map(response => response.outcome)).toEqual(['accepted','rejected','countered']);
    expect(responses.map(response => response.message)).toEqual([
      'Alex Accepts accepted your contract offer.',
      'Rory Rejects rejected your contract offer.',
      'Casey Counters has countered your contract offer.',
    ]);
  });

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

  it('stops a managed purchase after fee agreement so personal terms are mandatory', () => {
    const subject = deal({ delegated:false, userSide:'buyer', seed:'managed-purchase' });
    const context = {
      player:player(),
      buyer:{ id:'buyer', reputation:82, league:'Premier League' },
      seller:{ id:'seller', reputation:72, league:'Championship' },
      buyerSquad:[], marketValue:19_000_000, windowOpen:true,
    };

    const result = advanceMarketDeal(subject, context, '2025/26:3');

    expect(result.state).toBe('player_negotiation');
    expect(result.awaiting).toBe('user');
    expect(result.stateOwner).toBe('user');
    expect(result.decisionLog.map(entry => entry.reasonCode)).toEqual(['seller_accepts']);
  });

  it('tells the selling manager how personal terms landed, in their own terms', () => {
    const tickKey = '2025/26:4';
    const sale = (id, playerName, reasonCode, actor) => ({
      id, playerId:id, playerName, buyerTeamId:'buyer', sellerTeamId:'user',
      decisionLog:[{ actor, weekKey:tickKey, reasonCode }],
    });
    const responses = projectPlayerDecisionNotifications([
      sale('sold', 'Sam Sold', 'player_accepts', 'player'),
      sale('stayed', 'Sid Stayed', 'player_rejects', 'player'),
      sale('wages', 'Wes Wages', 'buyer_declines_personal_terms', 'buyer'),
    ], 'user', tickKey);

    expect(responses.map(response => response.message)).toEqual([
      'Sam Sold agreed personal terms. The sale is going through.',
      'Sid Stayed turned down the move on personal terms.',
      'Wes Wages stays: the buying club would not meet their wage demands.',
    ]);
    // Never the buyer-side wording: the manager did not make this offer.
    expect(responses.some(response => response.message.includes('your contract offer'))).toBe(false);
  });

  it('lets the buying club settle personal terms when the manager is the seller', () => {
    // An AI club bidding for one of the manager's players negotiates the wage
    // with the player itself. The manager agrees the fee and nothing else.
    const lowWage = { ...terms(), contract:{ wage:30_000, duration:4, squadRole:'important', signingBonus:0 } };
    const subject = deal({ userSide:'seller', delegated:false, seed:'inbound-bid', terms:lowWage });
    const context = {
      player:player(),
      buyer:{ id:'buyer', reputation:70, league:'Premier League', budget:60_000_000 },
      seller:{ id:'seller', reputation:72, league:'Premier League' },
      buyerSquad:[], marketValue:16_500_000, windowOpen:true,
    };

    const result = advanceMarketDeal(subject, context, '2025/26:3');

    expect(result.decisionLog.map(entry => entry.reasonCode)).toEqual(['seller_accepts','player_accepts']);
    expect(result.state).toBe('agreed');
    expect(result.awaiting).toBe('completion');
    // The wage the player held out for is what the buying club ends up paying.
    expect(result.terms.contract.wage).toBeGreaterThan(lowWage.contract.wage);
    expect(advanceMarketDeal(subject, context, '2025/26:3')).toEqual(result);
  });

  it('collapses an inbound bid when the buying club will not stretch that far on wages', () => {
    // The player earns 20k and the bid offers 10k, so their counter lands well
    // beyond what a club that opened at that number will move to.
    const lowWage = { ...terms(), contract:{ wage:10_000, duration:4, squadRole:'important', signingBonus:0 } };
    const subject = deal({ userSide:'seller', delegated:false, seed:'inbound-bid', terms:lowWage });
    const result = advanceMarketDeal(subject, {
      player:player({ wage:20_000 }),
      buyer:{ id:'buyer', reputation:76, league:'Premier League' },
      seller:{ id:'seller', reputation:72, league:'Premier League' },
      buyerSquad:[], marketValue:16_500_000, windowOpen:true,
    }, '2025/26:3');

    expect(result.state).toBe('rejected');
    expect(result.awaiting).toBeNull();
    expect(result.decisionLog.at(-1).reasonCode).toBe('buyer_declines_personal_terms');
  });

  it('never puts a sale’s personal terms in front of the manager, across the whole parameter space', () => {
    // The behaviour the manager actually asked for: agreeing a fee is their
    // decision, the player's wage is not. Swept rather than sampled, because a
    // single missed branch here silently parks a deal on them forever —
    // `advanceTransferMarketWeek` skips anything already awaiting the user.
    const outcomes = new Set();
    for (const currentWage of [20_000, 40_000, 70_000, 110_000]) {
      for (const offeredWage of [12_000, 20_000, 30_000, 45_000, 70_000]) {
        for (const buyerRep of [58, 64, 70, 76, 84]) {
          for (const morale of [30, 55, 80]) {
            for (const squadRole of ['squad','rotation','important']) {
              const subject = deal({
                userSide:'seller', delegated:false, createdBy:'ai',
                seed:`sweep:${currentWage}:${offeredWage}:${buyerRep}:${morale}:${squadRole}`,
                terms:{ fee:{ upfront:19_000_000 }, contract:{ wage:offeredWage, duration:4, squadRole, signingBonus:0 } },
              });
              const result = advanceMarketDeal(subject, {
                player:player({ wage:currentWage, individualMorale:morale }),
                buyer:{ id:'buyer', reputation:buyerRep, league:'Premier League' },
                seller:{ id:'seller', reputation:72, league:'Premier League' },
                buyerSquad:[], marketValue:18_000_000, windowOpen:true,
              }, '2025/26:3');

              expect(result.awaiting).not.toBe('user');
              expect(result.stateOwner).not.toBe('user');
              outcomes.add(result.decisionLog.at(-1)?.reasonCode);
            }
          }
        }
      }
    }

    // And the sweep is not vacuous: every branch of the buyer-led resolution is
    // genuinely reachable, so none of them is dead code.
    expect(outcomes).toContain('player_accepts');
    expect(outcomes).toContain('player_rejects');
    expect(outcomes).toContain('buyer_declines_personal_terms');
  });

  it('never parks an AI-versus-AI negotiation on the manager', () => {
    const lowWage = { ...terms(), contract:{ wage:30_000, duration:4, squadRole:'important', signingBonus:0 } };
    const subject = deal({ userSide:null, delegated:true, seed:'ai-vs-ai', terms:lowWage });
    const result = advanceMarketDeal(subject, {
      player:player(),
      buyer:{ id:'buyer', reputation:70, league:'Premier League', budget:60_000_000 },
      seller:{ id:'seller', reputation:72, league:'Premier League' },
      buyerSquad:[], marketValue:16_500_000, windowOpen:true,
    }, '2025/26:3');

    expect(result.awaiting).not.toBe('user');
    expect(result.stateOwner).not.toBe('user');
  });

  it('returns the player contract decision immediately after personal terms are submitted', () => {
    const subject = transitionMarketDeal(deal({ userSide:'buyer' }), 'player_negotiation', {
      weekKey:'2025/26:3', actor:'seller', reasonCode:'seller_accepts', awaiting:'user', stateOwner:'user',
    });
    const offered = transitionMarketDeal(subject, 'player_negotiation', {
      weekKey:'2025/26:3', actor:'user', reasonCode:'user_contract_offer', awaiting:'player', stateOwner:'player',
      terms:terms({ contract:{ wage:65_000, duration:4, squadRole:'important', signingBonus:500_000 } }),
    });
    const context = {
      player:player(),
      buyer:{ id:'buyer', reputation:86, league:'Premier League' },
      seller:{ id:'seller', reputation:68, league:'Championship' },
      buyerSquad:[], save:{ season:'2025/26' }, windowOpen:true,
    };

    const result = resolvePlayerContractDecision(offered, context, '2025/26:3');

    expect(result.state).toBe('agreed');
    expect(result.awaiting).toBe('completion');
    expect(result.decisionLog.at(-1).reasonCode).toBe('player_accepts');
    expect(isPlayerCounterAwaitingUser(subject)).toBe(false);
  });

  it('returns editable wage, length, role and bonus terms when the player counters', () => {
    const subject = transitionMarketDeal(deal({ userSide:'buyer' }), 'player_negotiation', {
      weekKey:'2025/26:3', actor:'seller', reasonCode:'seller_accepts', awaiting:'user', stateOwner:'user',
    });
    const offered = transitionMarketDeal(subject, 'player_negotiation', {
      weekKey:'2025/26:3', actor:'user', reasonCode:'user_contract_offer', awaiting:'player', stateOwner:'player',
      terms:terms({ contract:{ wage:40_000, duration:1, squadRole:'squad', signingBonus:0 } }),
    });
    const result = resolvePlayerContractDecision(offered, {
      player:player({ age:30, individualMorale:50 }),
      buyer:{ id:'buyer', reputation:75, league:'Championship' },
      seller:{ id:'seller', reputation:72, league:'Championship' },
      buyerSquad:Array.from({ length:5 }, (_, index) => player({ id:`buyer-${index}`, teamId:'buyer', midfield:82 })),
      save:{ season:'2025/26' }, windowOpen:true,
    }, '2025/26:3');

    expect(result.state).toBe('player_negotiation');
    expect(result.awaiting).toBe('user');
    expect(isPlayerCounterAwaitingUser(result)).toBe(true);
    expect(result.terms.contract.wage).toBeGreaterThan(40_000);
    expect(result.terms.contract.duration).toBeGreaterThanOrEqual(3);
    expect(result.terms.contract.squadRole).toBe('rotation');
    expect(result.terms.contract.signingBonus).toBeGreaterThan(0);
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

  it('expires unfinished deals and clears weekly tick keys at season rollover', () => {
    const market = markTransferMarketTick({ ...createEmptyTransferMarket(), activeDeals:[deal()] }, '2025/26:4');
    const next = rolloverTransferMarket(market, '2026/27');
    expect(next.activeDeals).toEqual([]);
    expect(next.terminalSummaries.at(-1)).toMatchObject({ state:'expired', reasonCode:'season_rollover' });
    expect(next.processedTickKeys).toEqual([]);
    expect(next.lastTickKey).toBeNull();
  });
});
