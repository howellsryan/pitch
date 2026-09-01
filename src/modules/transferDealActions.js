import { getPlayer, getPlayersByTeam, getSave, getTeam, putSave, settleTransferMarketDealAtomic } from './db.js';
import { formAdjustedValue } from './transfers.js';
import {
  MAX_ACTIVE_MARKET_DEALS,
  createMarketDeal,
  dealCommitmentAmount,
  deterministicMarketUnit,
  guaranteedFeeTotal,
  isTerminalDeal,
  marketWeekKey,
  normalizeDealTerms,
  normalizeTransferMarket,
  projectLegacyInboundOffers,
  resolvePlayerContractDecision,
  transitionMarketDeal,
  upsertMarketDeal,
} from './transferMarket.js';

function roundFee(value) {
  const amount = Math.round(Number(value) || 0);
  return amount > 0 ? amount : 0;
}

function roundWage(value) {
  return Math.max(1_000, Math.round((Number(value) || 1_000) / 1_000) * 1_000);
}

function counterEventKey(deal, weekKey, actor, amount) {
  return `${weekKey}:counter:${actor}:${deal.decisionLog?.length ?? 0}:${amount}`;
}

function contractEventKey(deal, weekKey, actor, contract) {
  return `${weekKey}:contract:${actor}:${deal.decisionLog?.length ?? 0}:${contract.wage}:${contract.duration}:${contract.squadRole}:${contract.signingBonus}`;
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
 * Convert a pending pre-P4 inbound offer into the persisted market shape.
 * This is also used to repair saves that already have transferMarket v1 but
 * still contain pending inboundOffers created before that market became authoritative.
 */
export function buildManagedClubInboundDeal(offer, save, ordinal = 1) {
  const weekKey = marketWeekKey(save);
  return createMarketDeal({
    id:offer?.dealId ?? undefined,
    type:'transfer',
    state:'club_negotiation',
    playerId:offer?.playerId,
    playerName:offer?.playerName,
    buyerTeamId:offer?.clubId,
    sellerTeamId:save?.userTeamId,
    createdBy:'ai',
    userSide:'seller',
    stateOwner:'user',
    awaiting:'user',
    createdWeekKey:`legacy-sync:${offer?.date ?? weekKey}`,
    updatedWeekKey:weekKey,
    expiresWeekKey:`${save?.season ?? 'season'}:${(Number(save?.currentGameweek) || 1) + 3}`,
    ordinal,
    terms:{
      fee:{ upfront:offer?.fee },
      contract:{ wage:10_000, duration:3, squadRole:'rotation' },
    },
    legacyOffer:{
      date:offer?.date ?? save?.currentDate ?? null,
      status:'pending',
      clubName:offer?.clubName ?? offer?.clubId ?? null,
    },
    seed:`legacy-sync:${offer?.playerId}:${offer?.clubId}:${offer?.fee}:${offer?.date ?? ''}`,
  });
}

/**
 * Reconcile pending inboundOffers into transferMarket. P4 normally projects
 * inboundOffers from the market, but existing careers can contain pending
 * offers that were written before the migration. Those offers must remain
 * visible in Deals rather than silently disappearing from the UI.
 */
export async function reconcileManagedClubInboundOffers(saveInput = null) {
  const save = saveInput ?? await getSave();
  if (!save) return save;
  const pending = (save.inboundOffers ?? []).filter(offer => offer?.status === 'pending');
  if (!pending.length) return save;

  let market = normalizeTransferMarket(save.transferMarket);
  const terminalIds = new Set(market.terminalSummaries.map(summary => summary.id));
  let changed = false;

  for (const [index, offer] of pending.entries()) {
    if (!offer?.playerId || !offer?.clubId || Number(offer?.fee) <= 0) { changed = true; continue; }
    if (offer.dealId && terminalIds.has(offer.dealId)) { changed = true; continue; }
    const represented = market.activeDeals.some(deal =>
      !isTerminalDeal(deal) &&
      String(deal.playerId) === String(offer.playerId) &&
      String(deal.buyerTeamId) === String(offer.clubId) &&
      String(deal.sellerTeamId) === String(save.userTeamId)
    );
    if (represented) continue;
    if (market.activeDeals.filter(deal => !isTerminalDeal(deal)).length >= MAX_ACTIVE_MARKET_DEALS) break;

    const player = await getPlayer(offer.playerId);
    if (!player || String(player.teamId) !== String(save.userTeamId) || player.signedThisSeason) {
      changed = true;
      continue;
    }
    market = upsertMarketDeal(market, buildManagedClubInboundDeal(offer, save, index + 1));
    changed = true;
  }

  if (!changed) return save;
  const nextMarket = normalizeTransferMarket(market);
  const nextSave = {
    ...save,
    transferMarket:nextMarket,
    inboundOffers:projectLegacyInboundOffers(nextMarket),
  };
  await putSave(nextSave);
  return nextSave;
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

const CONTRACT_ROLE_RANK = Object.freeze({ prospect:0, squad:1, rotation:2, important:3, crucial:4 });

function renewalRequirements(deal, player) {
  const currentWage = Math.max(1_000, Number(player?.wage) || 10_000);
  const morale = Number(player?.individualMorale ?? 50);
  const age = Number(player?.age ?? 25);
  // Keep the player's underlying expectations stable for this negotiation.
  // Decision-log length changes after each counter and must not silently move
  // the goalposts after the manager responds to the requested terms.
  const wageLift = 1.04 + deterministicMarketUnit(deal?.seed, 'renewal:wage') * .08 + (morale < 35 ? .03 : 0);
  const requiredWage = roundWage(currentWage * wageLift);
  const preferredDuration = age >= 33 ? 2 : age >= 29 ? 3 : age <= 23 ? 4 : 3;
  const bonusWeeks = 2 + Math.round(deterministicMarketUnit(deal?.seed, 'renewal:bonus') * 2);
  const requiredSigningBonus = roundWage(requiredWage * bonusWeeks);
  const currentRole = CONTRACT_ROLE_RANK[player?.squadRole] == null ? 'rotation' : player.squadRole;
  return { currentWage, requiredWage, preferredDuration, requiredSigningBonus, currentRole };
}

/**
 * Renewal-specific player decision. A renewal must never fail because the
 * player is "already at club"; if the package is short, the player counters
 * the negotiable terms so the manager can respond again.
 */
export function resolveRenewalContractOffer(dealInput, { player, terms, weekKey }) {
  const deal = createMarketDeal(dealInput);
  if (deal.type !== 'renewal' || deal.state !== 'player_negotiation' || deal.awaiting !== 'player') {
    throw new Error('DEAL_NOT_CONTRACT_COUNTERABLE');
  }
  const offered = normalizeDealTerms(terms ?? deal.terms, { player });
  const req = renewalRequirements(deal, player);
  const offeredRoleRank = CONTRACT_ROLE_RANK[offered.contract.squadRole] ?? CONTRACT_ROLE_RANK.rotation;
  const currentRoleRank = CONTRACT_ROLE_RANK[req.currentRole] ?? CONTRACT_ROLE_RANK.rotation;
  const concerns = [];

  if (offered.contract.wage < req.requiredWage) concerns.push('wage');
  if (offered.contract.duration < req.preferredDuration) concerns.push('duration');
  if (offeredRoleRank < currentRoleRank) concerns.push('squadRole');
  if (offered.contract.signingBonus < req.requiredSigningBonus) concerns.push('signingBonus');

  if (!concerns.length) {
    return transitionMarketDeal(deal, 'agreed', {
      eventKey:contractEventKey(deal, weekKey, 'player-accept', offered.contract),
      weekKey,
      actor:'player',
      reasonCode:'player_accepts_renewal',
      awaiting:'completion',
      stateOwner:'system',
      terms:offered,
      interest:{ score:100, interested:true, hardBlocker:null, strongestConcern:'No major concern.', negotiableTerms:[] },
    });
  }

  const counterTerms = normalizeDealTerms(offered, { player });
  counterTerms.contract.wage = Math.max(counterTerms.contract.wage, req.requiredWage);
  counterTerms.contract.duration = Math.max(counterTerms.contract.duration, req.preferredDuration);
  if (offeredRoleRank < currentRoleRank) counterTerms.contract.squadRole = req.currentRole;
  counterTerms.contract.signingBonus = Math.max(counterTerms.contract.signingBonus, req.requiredSigningBonus);
  const concernLabels = {
    wage:'The player wants a stronger weekly wage.',
    duration:'The player wants more contract security.',
    squadRole:'The player will not accept a reduced squad role.',
    signingBonus:'The player wants a larger signing bonus.',
  };
  return transitionMarketDeal(deal, 'player_negotiation', {
    eventKey:contractEventKey(deal, weekKey, 'player-counter', counterTerms.contract),
    weekKey,
    actor:'player',
    reasonCode:'player_contract_counter',
    awaiting:'user',
    stateOwner:'user',
    terms:counterTerms,
    interest:{
      score:50,
      interested:false,
      hardBlocker:null,
      strongestConcern:concernLabels[concerns[0]] ?? 'The player wants improved terms.',
      negotiableTerms:concerns,
      requiredWage:req.requiredWage,
    },
  });
}

async function persistMarket(save, market) {
  const nextMarket = normalizeTransferMarket(market);
  const nextSave = {
    ...save,
    transferMarket:nextMarket,
    inboundOffers:projectLegacyInboundOffers(nextMarket),
  };
  await putSave(nextSave);
  return { nextMarket, nextSave };
}

async function persistDeal(save, market, deal) {
  await persistMarket(save, upsertMarketDeal(market, deal));
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

/**
 * Start or counter player contract terms. The player responds immediately so
 * the fee and personal terms can both be completed inside one game week.
 */
export async function submitContractTerms({ playerId = null, dealId = null, contract = {} } = {}) {
  const save = await getSave();
  if (!save) throw new Error('SAVE_NOT_FOUND');
  let market = normalizeTransferMarket(save.transferMarket);
  const weekKey = marketWeekKey(save);
  let deal = dealId ? market.activeDeals.find(item => item.id === dealId) : null;
  let player = await getPlayer(deal?.playerId ?? playerId);
  if (!player) throw new Error('PLAYER_NOT_FOUND');

  if (!deal) {
    if (String(player.teamId) !== String(save.userTeamId)) throw new Error('PLAYER_NOT_IN_SQUAD');
    if (player.onLoan) throw new Error('PLAYER_ON_LOAN');
    const duplicate = market.activeDeals.find(item => item.type === 'renewal' && item.playerId === String(player.id) && !isTerminalDeal(item));
    if (duplicate) deal = duplicate;
    else {
      if (market.activeDeals.filter(item => !isTerminalDeal(item)).length >= MAX_ACTIVE_MARKET_DEALS) throw new Error('MARKET_CAP_REACHED');
      deal = createMarketDeal({
        type:'renewal',
        state:'player_negotiation',
        playerId:player.id,
        playerName:player.name,
        buyerTeamId:save.userTeamId,
        sellerTeamId:save.userTeamId,
        createdBy:'user',
        userSide:'club',
        stateOwner:'player',
        awaiting:'player',
        createdWeekKey:weekKey,
        expiresWeekKey:`${save.season}:${(Number(save.currentGameweek) || 1) + 3}`,
        terms:{ contract },
      }, market);
    }
  } else {
    if (!isUserClubDeal(deal, save.userTeamId) || isTerminalDeal(deal)) throw new Error('DEAL_NOT_OWNED_BY_USER_CLUB');
    if (deal.state !== 'player_negotiation' || deal.awaiting !== 'user') throw new Error('DEAL_NOT_CONTRACT_COUNTERABLE');
    if (String(deal.buyerTeamId) !== String(save.userTeamId) && deal.type !== 'renewal') throw new Error('DEAL_NOT_CONTRACT_COUNTERABLE');
    const updatedTerms = normalizeDealTerms(deal.terms, { player });
    updatedTerms.contract = normalizeDealTerms({ contract:{ ...updatedTerms.contract, ...contract } }, { player }).contract;
    const previousReason = deal.decisionLog?.at(-1)?.reasonCode;
    const isInitialTransferOffer = ['seller_accepts','release_clause_met','club_terms_accepted'].includes(previousReason);
    deal = transitionMarketDeal(deal, 'player_negotiation', {
      eventKey:contractEventKey(deal, weekKey, 'user', updatedTerms.contract),
      weekKey,
      actor:'user',
      reasonCode:isInitialTransferOffer ? 'user_contract_offer' : 'user_contract_counter',
      awaiting:'player',
      stateOwner:'player',
      terms:updatedTerms,
    });
  }

  let offeredTerms = normalizeDealTerms(deal.terms, { player });
  offeredTerms.contract = normalizeDealTerms({ contract:{ ...offeredTerms.contract, ...contract } }, { player }).contract;
  deal = { ...deal, terms:offeredTerms };

  const userTeam = await getTeam(save.userTeamId);
  if (userTeam && String(deal.buyerTeamId) === String(save.userTeamId)) {
    const commitment = dealCommitmentAmount(deal);
    if (commitment > availableBudgetForDeal(market, userTeam, deal.id)) throw new Error('INSUFFICIENT_FUNDS');
  }

  if (deal.type === 'renewal' && deal.awaiting === 'player') {
    deal = resolveRenewalContractOffer(deal, { player, terms:offeredTerms, weekKey });
  } else if (deal.awaiting === 'player') {
    const [buyer, seller, buyerSquad] = await Promise.all([
      getTeam(deal.buyerTeamId),
      getTeam(deal.sellerTeamId),
      getPlayersByTeam(deal.buyerTeamId),
    ]);
    deal = resolvePlayerContractDecision(deal, {
      player,
      buyer,
      seller,
      buyerSquad,
      terms:offeredTerms,
      save,
      windowOpen:true,
    }, weekKey);
  }

  market = upsertMarketDeal(market, deal);
  await persistMarket(save, market);
  if (deal.state === 'agreed') {
    const settlement = await settleTransferMarketDealAtomic(deal.id);
    return { deal, settlement };
  }
  return { deal, settlement:null };
}
