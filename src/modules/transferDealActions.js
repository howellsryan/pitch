import { getPlayer, getSave, getTeam, putSave } from './db.js';
import { formAdjustedValue } from './transfers.js';
import {
  createMarketDeal,
  dealCommitmentAmount,
  deterministicMarketUnit,
  guaranteedFeeTotal,
  isTerminalDeal,
  marketWeekKey,
  normalizeDealTerms,
  normalizeTransferMarket,
  projectLegacyInboundOffers,
  transitionMarketDeal,
  upsertMarketDeal,
} from './transferMarket.js';

function roundFee(value) {
  const amount = Math.round(Number(value) || 0);
  return amount > 0 ? amount : 0;
}

function counterEventKey(deal, weekKey, actor, amount) {
  return `${weekKey}:counter:${actor}:${deal.decisionLog?.length ?? 0}:${amount}`;
}

function availableBudgetForDeal(market, team, dealId) {
  const otherReserved = market.reservedCommitments
    .filter(item => String(item.clubId) === String(team?.id) && item.dealId !== dealId)
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return Math.max(0, (Number(team?.budget) || 0) - otherReserved);
}

export function isUserClubDeal(deal, userTeamId) {
  const clubId = String(userTeamId ?? '');
  if (!deal || !clubId) return false;
  if (String(deal.buyerTeamId ?? '') === clubId || String(deal.sellerTeamId ?? '') === clubId) return true;
  return !deal.buyerTeamId && !deal.sellerTeamId && String(deal.id ?? '').startsWith('legacy_collapsed_');
}

/**
 * Resolve an AI buyer's response when the managed club counters an inbound bid.
 * This is deliberately immediate: the user is responding to a live inbound bid,
 * while outbound enquiries still wait for the normal next market tick.
 */
export function resolveInboundSellerCounter(dealInput, { terms, buyer, marketValue, weekKey }) {
  const deal = createMarketDeal(dealInput);
  if (deal.state !== 'club_negotiation' || deal.awaiting !== 'user' || deal.userSide !== 'seller') {
    throw new Error('DEAL_NOT_COUNTERABLE');
  }

  const previousOffer = guaranteedFeeTotal(deal.terms);
  const counterTerms = normalizeDealTerms(terms);
  const requested = guaranteedFeeTotal(counterTerms);
  if (requested <= 0) throw new Error('INVALID_COUNTER_OFFER');

  const userCounter = transitionMarketDeal(deal, 'club_negotiation', {
    eventKey:counterEventKey(deal, weekKey, 'user', requested),
    weekKey,
    actor:'user',
    reasonCode:'user_counter',
    awaiting:'buyer',
    stateOwner:'buyer',
    terms:counterTerms,
  });

  const value = Math.max(1, Number(marketValue) || previousOffer || requested);
  const budget = Math.max(0, Number(buyer?.budget) || 0);
  const round = deal.decisionLog?.length ?? 0;
  const willingness = 1.03 + deterministicMarketUnit(deal.seed, `${weekKey}:buyer-willingness:${round}`) * 0.11;
  const ceiling = Math.min(budget, Math.round(value * willingness));

  if (requested <= ceiling) {
    return transitionMarketDeal(userCounter, 'player_negotiation', {
      eventKey:counterEventKey(userCounter, weekKey, 'buyer-accept', requested),
      weekKey,
      actor:'buyer',
      reasonCode:'buyer_accepts_counter',
      awaiting:'player',
      stateOwner:'player',
    });
  }

  if (requested > value * 1.45 || ceiling <= previousOffer + 100_000) {
    return transitionMarketDeal(userCounter, 'rejected', {
      eventKey:counterEventKey(userCounter, weekKey, 'buyer-reject', requested),
      weekKey,
      actor:'buyer',
      reasonCode:'buyer_walks_away',
      awaiting:null,
      stateOwner:'system',
    });
  }

  const progress = 0.45 + deterministicMarketUnit(deal.seed, `${weekKey}:buyer-counter:${round}`) * 0.25;
  const stepped = Math.round((previousOffer + (requested - previousOffer) * progress) / 100_000) * 100_000;
  const buyerCounter = Math.min(stepped, Math.floor(ceiling / 100_000) * 100_000, requested - 100_000);
  if (buyerCounter <= previousOffer) {
    return transitionMarketDeal(userCounter, 'rejected', {
      eventKey:counterEventKey(userCounter, weekKey, 'buyer-reject', requested),
      weekKey,
      actor:'buyer',
      reasonCode:'buyer_walks_away',
      awaiting:null,
      stateOwner:'system',
    });
  }

  const responseTerms = normalizeDealTerms(counterTerms);
  responseTerms.fee.upfront = buyerCounter;
  responseTerms.fee.installments = [];
  return transitionMarketDeal(userCounter, 'club_negotiation', {
    eventKey:counterEventKey(userCounter, weekKey, 'buyer-counter', buyerCounter),
    weekKey,
    actor:'buyer',
    reasonCode:'buyer_counter',
    awaiting:'user',
    stateOwner:'user',
    terms:responseTerms,
  });
}

async function persistDeal(save, market, deal) {
  const nextMarket = normalizeTransferMarket(upsertMarketDeal(market, deal));
  await putSave({
    ...save,
    transferMarket:nextMarket,
    inboundOffers:projectLegacyInboundOffers(nextMarket),
  });
  return deal;
}

/** Counter the current club-level fee in a user-visible transfer negotiation. */
export async function counterMarketDeal(dealId, feeAmount) {
  const save = await getSave();
  if (!save) throw new Error('SAVE_NOT_FOUND');
  const market = normalizeTransferMarket(save.transferMarket);
  const deal = market.activeDeals.find(item => item.id === dealId);
  if (!deal) throw new Error('DEAL_NOT_FOUND');
  if (isTerminalDeal(deal) || deal.state !== 'club_negotiation' || deal.awaiting !== 'user' || deal.type !== 'transfer') {
    throw new Error('DEAL_NOT_COUNTERABLE');
  }
  if (!isUserClubDeal(deal, save.userTeamId)) throw new Error('DEAL_NOT_OWNED_BY_USER_CLUB');

  const player = await getPlayer(deal.playerId);
  if (!player) throw new Error('PLAYER_NOT_FOUND');
  const fee = roundFee(feeAmount);
  if (!fee) throw new Error('INVALID_COUNTER_OFFER');
  const weekKey = marketWeekKey(save);
  const terms = normalizeDealTerms(deal.terms, { player });
  terms.fee.upfront = fee;
  terms.fee.installments = [];

  if (String(deal.sellerTeamId) === String(save.userTeamId)) {
    const buyer = await getTeam(deal.buyerTeamId);
    if (!buyer) throw new Error('BUYER_NOT_FOUND');
    const response = resolveInboundSellerCounter(deal, {
      terms,
      buyer:{ ...buyer, budget:availableBudgetForDeal(market, buyer, deal.id) },
      marketValue:formAdjustedValue(player),
      weekKey,
    });
    return persistDeal(save, market, response);
  }

  const userTeam = await getTeam(save.userTeamId);
  if (!userTeam) throw new Error('USER_TEAM_NOT_FOUND');
  const counterCommitment = dealCommitmentAmount({ ...deal, terms });
  if (counterCommitment > availableBudgetForDeal(market, userTeam, deal.id)) throw new Error('INSUFFICIENT_FUNDS');

  const countered = transitionMarketDeal(deal, 'club_negotiation', {
    eventKey:counterEventKey(deal, weekKey, 'user', fee),
    weekKey,
    actor:'user',
    reasonCode:'user_counter',
    awaiting:'seller',
    stateOwner:'seller',
    terms,
  });
  return persistDeal(save, market, countered);
}
