import {
  SQUAD_ROLE_DEFS,
  currentEffectiveLevel,
} from './playerModel.js';
import { chooseAIRole, getAITacticalProfile, roleSuitability } from './tactics.js';

/**
 * Pure P4 transfer-market contracts.
 *
 * Persisted state and domain decisions live here; IndexedDB orchestration lives
 * in transfers.js/db.js and Svelte is only a projection/command surface.
 */

export const TRANSFER_MARKET_VERSION = 1;
export const MAX_ACTIVE_MARKET_DEALS = 72;
export const MAX_TERMINAL_MARKET_SUMMARIES = 120;
export const MAX_DEAL_DECISIONS = 24;

export const DEAL_TYPES = Object.freeze(['transfer','loan','renewal','free_agent']);
export const DEAL_STATES = Object.freeze([
  'interest',
  'seller_terms',
  'club_negotiation',
  'player_negotiation',
  'agreed',
  'completed',
  'rejected',
  'withdrawn',
  'expired',
  'hijacked',
]);

export const TERMINAL_DEAL_STATES = new Set(['completed','rejected','withdrawn','expired','hijacked']);

export const LEGAL_DEAL_TRANSITIONS = Object.freeze({
  interest:new Set(['seller_terms','player_negotiation','rejected','withdrawn','expired']),
  seller_terms:new Set(['club_negotiation','player_negotiation','rejected','withdrawn','expired']),
  club_negotiation:new Set(['club_negotiation','player_negotiation','rejected','withdrawn','expired']),
  player_negotiation:new Set(['player_negotiation','agreed','rejected','withdrawn','expired','hijacked']),
  agreed:new Set(['completed','rejected','expired','hijacked']),
  completed:new Set(),
  rejected:new Set(),
  withdrawn:new Set(),
  expired:new Set(),
  hijacked:new Set(),
});

const TRANSFER_SQUAD_ROLE_IDS = new Set(Object.keys(SQUAD_ROLE_DEFS));

const RIVAL_PAIRS = new Set([
  'ac_milan|inter',
  'arsenal|tottenham',
  'barcelona|real_madrid',
  'bayern|dortmund',
  'liverpool|man_utd',
  'man_city|man_utd',
]);

const LEAGUE_PRESTIGE = Object.freeze({
  'Premier League':96,
  'La Liga':92,
  Bundesliga:90,
  'Serie A':89,
  'Ligue 1':85,
  Eredivisie:78,
  Championship:69,
  'League One':57,
  'League Two':49,
});

const transferMarketClamp = (value, min, max) => Math.max(min, Math.min(max, value));
const asMoney = value => Math.max(0, Math.round(Number(value) || 0));
const asPercent = (value, max = 100) => transferMarketClamp(Math.round(Number(value) || 0), 0, max);

export function stableMarketHash(input) {
  let hash = 2166136261;
  const text = String(input ?? '');
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicMarketUnit(seed, label = '') {
  return stableMarketHash(`${seed}:${label}`) / 0x100000000;
}

export function marketWeekKey(saveOrSeason, gameweek = null) {
  const season = typeof saveOrSeason === 'object' ? saveOrSeason?.season : saveOrSeason;
  const gw = typeof saveOrSeason === 'object' ? saveOrSeason?.currentGameweek : gameweek;
  return `${season ?? 'season'}:${Number(gw) || 0}`;
}

function normalizeInstallments(installments) {
  if (!Array.isArray(installments)) return [];
  return installments.slice(0, 5).map((item, index) => ({
    id:String(item?.id ?? `i${index + 1}`),
    amount:asMoney(item?.amount),
    dueSeason:String(item?.dueSeason ?? ''),
    dueGameweek:Math.max(1, Math.round(Number(item?.dueGameweek) || 1)),
  }));
}

function normalizeBonuses(bonuses) {
  if (!Array.isArray(bonuses)) return [];
  const allowed = new Set(['appearances','goals','clean_sheets','promotion','trophy']);
  return bonuses.slice(0, 5).flatMap((bonus, index) => {
    if (!allowed.has(bonus?.kind)) return [];
    return [{
      id:String(bonus.id ?? `b${index + 1}`),
      kind:bonus.kind,
      target:Math.max(1, Math.round(Number(bonus.target) || 1)),
      amount:asMoney(bonus.amount),
    }];
  });
}

export function normalizeDealTerms(input = {}, context = {}) {
  const rawFee = input.fee ?? input;
  const rawLoan = input.loan ?? {};
  const rawContract = input.contract ?? {};
  const wageFallback = Math.max(1_000, asMoney(context.player?.wage ?? 10_000));
  const duration = transferMarketClamp(Math.round(Number(rawContract.duration) || 3), 1, 5);
  const role = TRANSFER_SQUAD_ROLE_IDS.has(rawContract.squadRole)
    ? rawContract.squadRole
    : (TRANSFER_SQUAD_ROLE_IDS.has(context.player?.squadRole) ? context.player.squadRole : 'rotation');

  return {
    version:1,
    fee:{
      upfront:asMoney(rawFee.upfront ?? rawFee.guaranteedFee ?? rawFee.amount),
      installments:normalizeInstallments(rawFee.installments),
      sellOnPercentage:asPercent(rawFee.sellOnPercentage, 50),
      performanceBonuses:normalizeBonuses(rawFee.performanceBonuses),
      exchangePlayerId:rawFee.exchangePlayerId ? String(rawFee.exchangePlayerId) : null,
      loanBack:Boolean(rawFee.loanBack),
    },
    loan:{
      fee:asMoney(rawLoan.fee),
      wageContributionPercentage:asPercent(rawLoan.wageContributionPercentage ?? 100),
      recall:Boolean(rawLoan.recall),
      optionToBuy:asMoney(rawLoan.optionToBuy),
      obligationToBuy:asMoney(rawLoan.obligationToBuy),
    },
    contract:{
      wage:Math.max(1_000, asMoney(rawContract.wage ?? wageFallback)),
      duration,
      squadRole:role,
      signingBonus:asMoney(rawContract.signingBonus),
      appearanceBonus:asMoney(rawContract.appearanceBonus),
      goalBonus:asMoney(rawContract.goalBonus),
      cleanSheetBonus:asMoney(rawContract.cleanSheetBonus),
      promotionSalaryIncreasePercentage:asPercent(rawContract.promotionSalaryIncreasePercentage, 50),
      relegationSalaryReductionPercentage:asPercent(rawContract.relegationSalaryReductionPercentage, 50),
      releaseClause:asMoney(rawContract.releaseClause),
    },
  };
}

export function guaranteedFeeTotal(terms) {
  const normalized = normalizeDealTerms(terms);
  return normalized.fee.upfront + normalized.fee.installments.reduce((sum, item) => sum + item.amount, 0);
}

export function dealCommitmentAmount(deal) {
  const terms = normalizeDealTerms(deal?.terms);
  if (deal?.type === 'renewal' || deal?.type === 'free_agent') return terms.contract.signingBonus;
  if (deal?.type === 'loan') return terms.loan.fee + terms.contract.signingBonus;
  return guaranteedFeeTotal(terms) + terms.contract.signingBonus;
}

function dueOrder(item) {
  const year = Number.parseInt(String(item.dueSeason ?? '').split('/')[0], 10);
  return (Number.isFinite(year) ? year : 9999) * 100 + Number(item.dueGameweek ?? 1);
}

export function validateDealTerms(termsInput, { type = 'transfer', buyerTeamId = null, sellerTeamId = null } = {}) {
  const rawFee = termsInput?.fee ?? termsInput ?? {};
  const rawLoan = termsInput?.loan ?? {};
  const rawContract = termsInput?.contract ?? {};
  const terms = normalizeDealTerms(termsInput);
  const errors = [];
  const rawAmounts = [
    rawFee.upfront, rawFee.guaranteedFee, rawFee.amount,
    ...(Array.isArray(rawFee.installments) ? rawFee.installments.map(item => item?.amount) : []),
    ...(Array.isArray(rawFee.performanceBonuses) ? rawFee.performanceBonuses.map(item => item?.amount) : []),
    rawLoan.fee, rawLoan.optionToBuy, rawLoan.obligationToBuy,
    rawContract.wage, rawContract.signingBonus, rawContract.appearanceBonus,
    rawContract.goalBonus, rawContract.cleanSheetBonus, rawContract.releaseClause,
  ];
  if (rawAmounts.some(value => value != null && Number(value) < 0)) errors.push('negative_amount');
  if (rawContract.duration != null && (Number(rawContract.duration) < 1 || Number(rawContract.duration) > 5)) errors.push('invalid_contract_duration');
  if ([rawFee.sellOnPercentage, rawLoan.wageContributionPercentage,
    rawContract.promotionSalaryIncreasePercentage, rawContract.relegationSalaryReductionPercentage]
    .some(value => value != null && Number(value) < 0)) errors.push('negative_percentage');
  if (!DEAL_TYPES.includes(type)) errors.push('invalid_deal_type');
  if (buyerTeamId && sellerTeamId && buyerTeamId === sellerTeamId && !['renewal'].includes(type)) errors.push('same_club');
  if (terms.fee.installments.some(item => item.amount <= 0 || !item.dueSeason)) errors.push('invalid_installment');
  const orders = terms.fee.installments.map(dueOrder);
  if (orders.some((value, index) => index > 0 && value <= orders[index - 1])) errors.push('installment_schedule_order');
  if (type === 'transfer' && guaranteedFeeTotal(terms) <= 0 && !terms.fee.exchangePlayerId) errors.push('missing_transfer_value');
  if (type === 'loan' && terms.loan.optionToBuy > 0 && terms.loan.obligationToBuy > 0) errors.push('conflicting_loan_to_buy');
  if (type !== 'loan' && (terms.loan.fee || terms.loan.optionToBuy || terms.loan.obligationToBuy)) errors.push('loan_terms_on_non_loan');
  if (!TRANSFER_SQUAD_ROLE_IDS.has(terms.contract.squadRole)) errors.push('invalid_squad_role');
  return { valid:errors.length === 0, errors:[...new Set(errors)], terms };
}

export function createEmptyTransferMarket() {
  return {
    version:TRANSFER_MARKET_VERSION,
    nextDealOrdinal:1,
    activeDeals:[],
    negotiationQueue:[],
    reservedCommitments:[],
    terminalSummaries:[],
    shortlist:[],
    rumours:[],
    lastTickKey:null,
    processedTickKeys:[],
  };
}

export function createDealId({ type, playerId, buyerTeamId, sellerTeamId, createdWeekKey, ordinal = 1 }) {
  const hash = stableMarketHash(`${type}:${playerId}:${buyerTeamId}:${sellerTeamId}:${createdWeekKey}:${ordinal}`).toString(36);
  return `deal_${hash}`;
}

export function createMarketDeal(input, marketInput = null) {
  // `normalizeTransferMarket` normalises every contained deal through this
  // function, so only read the ordinal directly here; recursively normalising
  // the parent market would recurse once it already contains an active deal.
  const market = marketInput && typeof marketInput === 'object' && !Array.isArray(marketInput)
    ? marketInput
    : createEmptyTransferMarket();
  const sellerTeamId = input?.sellerTeamId == null ? null : String(input.sellerTeamId);
  // The AI recruitment generator considers the shared free-agent pool alongside
  // club-owned players. Older/current callers may still describe that approach
  // as a normal transfer; normalise it here so there is no imaginary seller or
  // transfer fee and the deal goes directly to player terms. This also repairs
  // malformed persisted AI free-agent approaches on load.
  const inferredFreeAgent = sellerTeamId === 'free_agents' && !['renewal','loan'].includes(input?.type);
  const type = inferredFreeAgent ? 'free_agent' : (DEAL_TYPES.includes(input?.type) ? input.type : 'transfer');
  const createdWeekKey = input?.createdWeekKey ?? 'legacy:0';
  const ordinal = Math.max(1, Number(input?.ordinal ?? market.nextDealOrdinal) || 1);
  const id = input?.id ?? createDealId({
    type,
    playerId:input?.playerId,
    buyerTeamId:input?.buyerTeamId,
    sellerTeamId,
    createdWeekKey,
    ordinal,
  });
  const requestedState = DEAL_STATES.includes(input?.state) ? input.state : 'interest';
  const state = inferredFreeAgent && ['interest','seller_terms','club_negotiation'].includes(requestedState)
    ? 'player_negotiation'
    : requestedState;
  const freeAgentTerms = inferredFreeAgent
    ? {
        ...(input?.terms ?? {}),
        fee:{
          ...(input?.terms?.fee ?? {}),
          upfront:0,
          guaranteedFee:0,
          amount:0,
          installments:[],
          sellOnPercentage:0,
          performanceBonuses:[],
          exchangePlayerId:null,
          loanBack:false,
        },
      }
    : input?.terms;
  const validation = validateDealTerms(freeAgentTerms, { type, buyerTeamId:input?.buyerTeamId, sellerTeamId });
  const seed = String(input?.seed ?? `${id}:${createdWeekKey}`);
  const awaiting = inferredFreeAgent && state === 'player_negotiation' && (input?.awaiting == null || input.awaiting === 'seller')
    ? 'player'
    : (input?.awaiting ?? null);
  const stateOwner = inferredFreeAgent && state === 'player_negotiation' && (input?.stateOwner == null || input.stateOwner === 'seller' || input.stateOwner === 'system')
    ? 'player'
    : (input?.stateOwner ?? 'system');
  return {
    version:1,
    id,
    type,
    state,
    playerId:String(input?.playerId ?? ''),
    playerName:String(input?.playerName ?? ''),
    buyerTeamId:input?.buyerTeamId == null ? null : String(input.buyerTeamId),
    sellerTeamId,
    createdBy:input?.createdBy === 'ai' ? 'ai' : 'user',
    userSide:['buyer','seller','club'].includes(input?.userSide) ? input.userSide : null,
    stateOwner,
    awaiting,
    delegated:Boolean(input?.delegated),
    createdWeekKey,
    updatedWeekKey:input?.updatedWeekKey ?? createdWeekKey,
    expiresWeekKey:input?.expiresWeekKey ?? null,
    terms:validation.terms,
    termsValid:validation.valid,
    termsErrors:validation.errors,
    seed,
    idempotencyKey:String(input?.idempotencyKey ?? `settle_${stableMarketHash(seed).toString(36)}`),
    interest:input?.interest ?? null,
    competingOffers:Array.isArray(input?.competingOffers) ? input.competingOffers.slice(0, 4) : [],
    decisionLog:Array.isArray(input?.decisionLog) ? input.decisionLog.slice(-MAX_DEAL_DECISIONS) : [],
    legacyOffer:input?.legacyOffer ?? null,
  };
}

export function isTerminalDeal(deal) {
  return TERMINAL_DEAL_STATES.has(deal?.state);
}

export function canTransitionDeal(fromState, toState) {
  return Boolean(LEGAL_DEAL_TRANSITIONS[fromState]?.has(toState));
}

export function transitionMarketDeal(deal, nextState, options = {}) {
  if (!deal || !DEAL_STATES.includes(nextState)) throw new Error('INVALID_DEAL_STATE');
  if (isTerminalDeal(deal)) throw new Error('DEAL_TERMINAL');
  if (!canTransitionDeal(deal.state, nextState)) throw new Error('ILLEGAL_DEAL_TRANSITION');
  const eventKey = options.eventKey ?? `${options.weekKey ?? deal.updatedWeekKey}:${deal.state}:${nextState}:${options.actor ?? 'system'}`;
  if (deal.decisionLog?.some(entry => entry.eventKey === eventKey)) return deal;
  const terms = options.terms ? normalizeDealTerms(options.terms) : deal.terms;
  const validation = validateDealTerms(terms, { type:deal.type, buyerTeamId:deal.buyerTeamId, sellerTeamId:deal.sellerTeamId });
  const entry = {
    eventKey,
    weekKey:options.weekKey ?? deal.updatedWeekKey,
    from:deal.state,
    to:nextState,
    actor:options.actor ?? 'system',
    reasonCode:options.reasonCode ?? null,
  };
  return {
    ...deal,
    state:nextState,
    stateOwner:options.stateOwner ?? deal.stateOwner,
    awaiting:Object.hasOwn(options, 'awaiting') ? options.awaiting : deal.awaiting,
    updatedWeekKey:options.weekKey ?? deal.updatedWeekKey,
    terms:validation.terms,
    termsValid:validation.valid,
    termsErrors:validation.errors,
    interest:Object.hasOwn(options, 'interest') ? options.interest : deal.interest,
    competingOffers:Object.hasOwn(options, 'competingOffers') ? options.competingOffers.slice(0, 4) : deal.competingOffers,
    decisionLog:[...(deal.decisionLog ?? []), entry].slice(-MAX_DEAL_DECISIONS),
  };
}

function summaryForDeal(deal) {
  return {
    id:deal.id,
    idempotencyKey:deal.idempotencyKey,
    type:deal.type,
    state:deal.state,
    playerId:deal.playerId,
    playerName:deal.playerName,
    buyerTeamId:deal.buyerTeamId,
    sellerTeamId:deal.sellerTeamId,
    total:deal.type === 'loan' ? deal.terms.loan.fee : guaranteedFeeTotal(deal.terms),
    updatedWeekKey:deal.updatedWeekKey,
    reasonCode:deal.decisionLog?.at(-1)?.reasonCode ?? null,
  };
}

export function rebuildReservedCommitments(marketInput) {
  const market = normalizeTransferMarket(marketInput, { rebuild:false });
  const reservedCommitments = market.activeDeals
    .filter(deal => !isTerminalDeal(deal) && deal.buyerTeamId && ['club_negotiation','player_negotiation','agreed'].includes(deal.state))
    .map(deal => ({ dealId:deal.id, clubId:deal.buyerTeamId, amount:dealCommitmentAmount(deal) }))
    .filter(item => item.amount > 0);
  return { ...market, reservedCommitments };
}

export function normalizeTransferMarket(input, { rebuild = true } = {}) {
  const base = createEmptyTransferMarket();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return base;
  const activeDeals = (Array.isArray(input.activeDeals) ? input.activeDeals : [])
    .slice(0, MAX_ACTIVE_MARKET_DEALS)
    .map(deal => createMarketDeal(deal, input));
  const market = {
    ...base,
    ...input,
    version:TRANSFER_MARKET_VERSION,
    nextDealOrdinal:Math.max(1, Number(input.nextDealOrdinal) || 1),
    activeDeals,
    negotiationQueue:Array.isArray(input.negotiationQueue) ? [...new Set(input.negotiationQueue)].slice(0, MAX_ACTIVE_MARKET_DEALS) : [],
    reservedCommitments:Array.isArray(input.reservedCommitments) ? input.reservedCommitments.slice(0, MAX_ACTIVE_MARKET_DEALS) : [],
    terminalSummaries:Array.isArray(input.terminalSummaries) ? input.terminalSummaries.slice(-MAX_TERMINAL_MARKET_SUMMARIES) : [],
    shortlist:Array.isArray(input.shortlist) ? [...new Set(input.shortlist.map(String))].slice(0, 120) : [],
    rumours:Array.isArray(input.rumours) ? input.rumours.slice(-80) : [],
    processedTickKeys:Array.isArray(input.processedTickKeys) ? [...new Set(input.processedTickKeys)].slice(-16) : [],
  };
  return rebuild ? rebuildReservedCommitments(market) : market;
}

export function upsertMarketDeal(marketInput, dealInput) {
  const market = normalizeTransferMarket(marketInput);
  const deal = createMarketDeal(dealInput, market);
  const activeDeals = market.activeDeals.filter(item => item.id !== deal.id);
  activeDeals.push(deal);
  const negotiationQueue = [...market.negotiationQueue.filter(id => id !== deal.id), deal.id];
  return rebuildReservedCommitments({
    ...market,
    nextDealOrdinal:Math.max(market.nextDealOrdinal + (market.activeDeals.some(item => item.id === deal.id) ? 0 : 1), 2),
    activeDeals:activeDeals.slice(-MAX_ACTIVE_MARKET_DEALS),
    negotiationQueue:negotiationQueue.slice(-MAX_ACTIVE_MARKET_DEALS),
  });
}

export function compactTransferMarket(marketInput, { terminalOnly = true } = {}) {
  const market = normalizeTransferMarket(marketInput);
  const terminal = market.activeDeals.filter(isTerminalDeal);
  const terminalSummaries = [
    ...market.terminalSummaries.filter(summary => !terminal.some(deal => deal.id === summary.id)),
    ...terminal.map(summaryForDeal),
  ].slice(-MAX_TERMINAL_MARKET_SUMMARIES);
  const activeDeals = terminalOnly ? market.activeDeals.filter(deal => !isTerminalDeal(deal)) : [];
  const activeIds = new Set(activeDeals.map(deal => deal.id));
  return rebuildReservedCommitments({
    ...market,
    activeDeals,
    negotiationQueue:market.negotiationQueue.filter(id => activeIds.has(id)),
    terminalSummaries,
  });
}

function legacyOfferDeal(offer, save, ordinal) {
  const createdWeekKey = `legacy:${save?.season ?? 'season'}:${offer?.date ?? save?.currentDate ?? ''}`;
  return createMarketDeal({
    type:'transfer',
    state:offer?.status === 'pending' ? 'club_negotiation' : (offer?.status === 'accepted' ? 'completed' : 'rejected'),
    playerId:offer?.playerId,
    playerName:offer?.playerName,
    buyerTeamId:offer?.clubId,
    sellerTeamId:save?.userTeamId,
    createdBy:'ai',
    userSide:'seller',
    stateOwner:'user',
    awaiting:offer?.status === 'pending' ? 'user' : null,
    createdWeekKey,
    updatedWeekKey:createdWeekKey,
    expiresWeekKey:null,
    ordinal,
    terms:{
      fee:{ upfront:offer?.fee },
      contract:{ wage:10_000, duration:3, squadRole:'rotation' },
    },
    legacyOffer:{
      date:offer?.date ?? save?.currentDate ?? null,
      status:offer?.status ?? 'pending',
      clubName:offer?.clubName ?? offer?.clubId ?? null,
    },
    seed:`legacy:${offer?.playerId}:${offer?.clubId}:${offer?.fee}:${offer?.date ?? ''}`,
  });
}

export function buildTransferMarketBackfill(save) {
  if (!save) return { save, migratedDeals:[] };
  let market = normalizeTransferMarket(save.transferMarket);
  const migratedDeals = [];
  const known = new Set([
    ...market.activeDeals.map(deal => deal.id),
    ...market.terminalSummaries.map(summary => summary.id),
  ]);
  for (const [index, offer] of (save.inboundOffers ?? []).entries()) {
    const deal = legacyOfferDeal(offer, save, index + 1);
    if (known.has(deal.id)) continue;
    known.add(deal.id);
    migratedDeals.push(deal);
    if (isTerminalDeal(deal)) {
      market = { ...market, terminalSummaries:[...market.terminalSummaries, summaryForDeal(deal)].slice(-MAX_TERMINAL_MARKET_SUMMARIES) };
    } else market = upsertMarketDeal(market, deal);
  }
  for (const playerId of save.collapsedDeals ?? []) {
    const id = `legacy_collapsed_${stableMarketHash(`${save.season}:${playerId}`).toString(36)}`;
    if (known.has(id)) continue;
    market.terminalSummaries.push({ id, type:'transfer', state:'rejected', playerId:String(playerId), reasonCode:'legacy_collapsed', updatedWeekKey:`legacy:${save.season}` });
  }
  market = normalizeTransferMarket({
    ...market,
    terminalSummaries:market.terminalSummaries.slice(-MAX_TERMINAL_MARKET_SUMMARIES),
  });
  return {
    save:{
      ...save,
      transferMarket:market,
      inboundOffers:projectLegacyInboundOffers(market),
    },
    migratedDeals,
  };
}

export function transferMarketNeedsBackfill(save) {
  return !save?.transferMarket || Number(save.transferMarket.version) !== TRANSFER_MARKET_VERSION;
}

export function projectLegacyInboundOffers(marketInput) {
  return normalizeTransferMarket(marketInput).activeDeals
    .filter(deal => deal.userSide === 'seller' && deal.awaiting === 'user' && !isTerminalDeal(deal))
    .map(deal => ({
      dealId:deal.id,
      playerId:deal.playerId,
      playerName:deal.playerName,
      clubId:deal.buyerTeamId,
      clubName:deal.legacyOffer?.clubName ?? deal.buyerTeamId,
      fee:guaranteedFeeTotal(deal.terms),
      date:deal.legacyOffer?.date ?? null,
      status:'pending',
    }));
}

function repMinimumForLevel(level) {
  if (level >= 90) return 88;
  if (level >= 85) return 80;
  if (level >= 80) return 72;
  if (level >= 75) return 64;
  if (level >= 70) return 56;
  if (level >= 65) return 48;
  if (level >= 60) return 40;
  return 0;
}

function isRivalMove(fromTeamId, toTeamId) {
  return RIVAL_PAIRS.has([String(fromTeamId), String(toTeamId)].sort().join('|'));
}

function prestigeFor(team) {
  return LEAGUE_PRESTIGE[team?.league] ?? transferMarketClamp(Number(team?.reputation) || 60, 40, 96);
}

function roleMinutesScore(player, buyerSquad, promisedRole) {
  const level = Number(currentEffectiveLevel(player)) || 50;
  const rank = [...(buyerSquad ?? []), player]
    .sort((a, b) => (Number(currentEffectiveLevel(b)) || 0) - (Number(currentEffectiveLevel(a)) || 0))
    .findIndex(row => row.id === player.id);
  const roleBoost = { crucial:16, important:11, rotation:5, squad:0, prospect:-2 }[promisedRole] ?? 0;
  return transferMarketClamp(70 - rank * 4 + roleBoost + (level >= 80 ? 4 : 0), 10, 96);
}

function pushReason(bucket, score, code, label) {
  bucket.push({ score, code, label });
}

export function evaluatePlayerInterest({
  player,
  buyer,
  seller = null,
  buyerSquad = [],
  terms,
  save = {},
  tacticalProfile = null,
  buyerHasEurope = false,
} = {}) {
  const normalized = normalizeDealTerms(terms, { player });
  const level = Number(currentEffectiveLevel(player)) || 50;
  const minRep = Math.max(0, repMinimumForLevel(level) - (player?.transferListed ? 4 : 0));
  if (!player || !buyer) return { score:0, interested:false, hardBlocker:'missing_participant', strongestPositives:[], strongestConcern:'Missing deal participant.', negotiableTerms:[] };
  if (player.signedThisSeason) return { score:0, interested:false, hardBlocker:'moved_this_season', strongestPositives:[], strongestConcern:'The player has already moved this season.', negotiableTerms:[] };
  if (player.teamId === buyer.id) return { score:0, interested:false, hardBlocker:'already_at_club', strongestPositives:[], strongestConcern:'The player is already at this club.', negotiableTerms:[] };
  if ((Number(buyer.reputation) || 60) < minRep) return { score:0, interested:false, hardBlocker:'club_reputation', strongestPositives:[], strongestConcern:`Club reputation must reach ${minRep}.`, negotiableTerms:['squadRole','wage'] };
  if (isRivalMove(seller?.id ?? player.teamId, buyer.id) && Number(player.individualMorale ?? 50) >= 65 && !player.transferListed) {
    return { score:0, interested:false, hardBlocker:'rivalry', strongestPositives:[], strongestConcern:'The player will not cross this rivalry while settled at their club.', negotiableTerms:['wage','squadRole'] };
  }

  const positives = [];
  const concerns = [];
  let score = 48;
  const buyerRep = Number(buyer.reputation) || 60;
  const sellerRep = Number(seller?.reputation) || buyerRep;
  const repDelta = buyerRep - sellerRep;
  score += transferMarketClamp(repDelta * .65, -14, 16);
  if (repDelta >= 6) pushReason(positives, repDelta, 'club_step_up', 'A clear step up in club stature.');
  else if (repDelta <= -8) pushReason(concerns, -repDelta, 'club_step_down', 'The move is a significant step down.');

  const prestigeDelta = prestigeFor(buyer) - prestigeFor(seller ?? { league:save.userLeague, reputation:sellerRep });
  score += transferMarketClamp(prestigeDelta * .35, -9, 10);
  if (prestigeDelta >= 7) pushReason(positives, prestigeDelta, 'league_prestige', 'The league offers a bigger stage.');
  if (buyerHasEurope) { score += 7; pushReason(positives, 7, 'european_football', 'European football is attractive.'); }

  const currentWage = Math.max(1_000, Number(player.wage) || 10_000);
  const wageRatio = normalized.contract.wage / currentWage;
  score += transferMarketClamp((wageRatio - 1) * 25, -16, 18);
  if (wageRatio >= 1.18) pushReason(positives, wageRatio * 10, 'wage_increase', 'The wage offer is a meaningful increase.');
  else if (wageRatio < .95) pushReason(concerns, (1 - wageRatio) * 20, 'wage_cut', 'The proposed wage is below current terms.');

  const minutesScore = roleMinutesScore(player, buyerSquad, normalized.contract.squadRole);
  score += (minutesScore - 50) * .22;
  if (minutesScore >= 70) pushReason(positives, minutesScore / 10, 'playing_time', 'The promised role offers credible minutes.');
  else if (minutesScore < 40) pushReason(concerns, (50 - minutesScore) / 4, 'playing_time_risk', 'Competition for minutes is a concern.');

  const profile = tacticalProfile ?? getAITacticalProfile(buyer);
  const tacticalRole = chooseAIRole(player, profile);
  const tacticalFit = roleSuitability(player, tacticalRole);
  score += (tacticalFit - .9) * 45;
  if (tacticalFit >= 1) pushReason(positives, tacticalFit * 7, 'tactical_fit', 'The manager’s approach suits the player.');
  else if (tacticalFit < .86) pushReason(concerns, (1 - tacticalFit) * 28, 'tactical_concern', 'The tactical role is not an obvious fit.');

  const morale = Number(player.individualMorale ?? 50);
  if (player.transferListed || morale <= 35 || player.playingTimeAgreement?.status === 'broken') {
    score += 10;
    pushReason(positives, 9, 'wants_change', 'The player is open to a change of club.');
  } else if (morale >= 75 && sellerRep >= buyerRep - 2) {
    score -= 8;
    pushReason(concerns, 8, 'settled_at_club', 'The player is settled at the current club.');
  }

  const age = Number(player.age ?? 25);
  if (age >= 30 && normalized.contract.duration < 2) {
    score -= 6;
    pushReason(concerns, 6, 'contract_security', 'Contract security matters at this career stage.');
  } else if (age <= 22 && normalized.contract.squadRole === 'prospect') {
    score += 4;
    pushReason(positives, 4, 'development_path', 'The role offers a credible development path.');
  }

  const finalScore = Math.round(transferMarketClamp(score, 0, 100));
  const interested = finalScore >= 55;
  concerns.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  positives.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  const negotiableTerms = [];
  if (wageRatio < 1.1) negotiableTerms.push('wage');
  if (minutesScore < 60) negotiableTerms.push('squadRole');
  if (age >= 29 && normalized.contract.duration < 3) negotiableTerms.push('duration');
  if (!normalized.contract.signingBonus) negotiableTerms.push('signingBonus');
  return {
    score:finalScore,
    interested,
    hardBlocker:null,
    strongestPositives:positives.slice(0, 3).map(item => ({ code:item.code, label:item.label })),
    strongestConcern:concerns[0]?.label ?? (interested ? 'No major concern.' : 'The overall package is not compelling enough.'),
    concernCode:concerns[0]?.code ?? null,
    negotiableTerms,
    requiredWage:Math.round(currentWage * transferMarketClamp(1.02 + Math.max(0, 58 - finalScore) / 100, 1.02, 1.35)),
    tacticalRole,
    tacticalFit:Math.round(tacticalFit * 100) / 100,
    minutesScore:Math.round(minutesScore),
  };
}

function parseWeekKey(key) {
  const [season = '', gameweek = '0'] = String(key ?? '').split(':');
  const year = Number.parseInt(season.split('/')[0], 10);
  return { year:Number.isFinite(year) ? year : 0, gameweek:Number(gameweek) || 0 };
}

export function hasDealExpired(deal, weekKey) {
  if (!deal?.expiresWeekKey) return false;
  const expiry = parseWeekKey(deal.expiresWeekKey);
  const current = parseWeekKey(weekKey);
  return current.year > expiry.year || (current.year === expiry.year && current.gameweek >= expiry.gameweek);
}

function withSellerCounter(deal, marketValue, weekKey) {
  const current = guaranteedFeeTotal(deal.terms);
  const ask = Math.max(current + 100_000, Math.round(marketValue * (1.02 + deterministicMarketUnit(deal.seed, `${weekKey}:ask`) * .12)));
  const terms = normalizeDealTerms(deal.terms);
  terms.fee.upfront = ask;
  terms.fee.installments = [];
  return transitionMarketDeal(deal, 'club_negotiation', {
    weekKey,
    actor:'seller',
    reasonCode:'seller_counter',
    awaiting:'user',
    stateOwner:'user',
    terms,
  });
}

function advanceSeller(deal, context, weekKey) {
  const marketValue = Math.max(1, Number(context.marketValue) || guaranteedFeeTotal(deal.terms));
  const offered = guaranteedFeeTotal(deal.terms);
  const releaseClause = Number(context.player?.contract?.releaseClause ?? context.player?.releaseClause) || 0;
  const ratio = offered / marketValue;
  const managedBuyerNeedsContract = deal.userSide === 'buyer' && !deal.delegated;
  const playerStep = managedBuyerNeedsContract
    ? { awaiting:'user', stateOwner:'user' }
    : { awaiting:'player', stateOwner:'player' };
  if (releaseClause > 0 && offered >= releaseClause) {
    return transitionMarketDeal(deal, 'player_negotiation', { weekKey, actor:'seller', reasonCode:'release_clause_met', ...playerStep });
  }
  if (ratio >= .98) return transitionMarketDeal(deal, 'player_negotiation', { weekKey, actor:'seller', reasonCode:'seller_accepts', ...playerStep });
  if (ratio < .68) return transitionMarketDeal(deal, 'rejected', { weekKey, actor:'seller', reasonCode:'offer_far_too_low', awaiting:null, stateOwner:'system' });
  return withSellerCounter(deal, marketValue, weekKey);
}

function competingOfferWins(deal, interest) {
  const competitors = deal.competingOffers ?? [];
  if (!competitors.length) return null;
  const ourPackage = guaranteedFeeTotal(deal.terms) + deal.terms.contract.wage * 52;
  return [...competitors]
    .sort((a, b) => (Number(b.packageValue) || 0) - (Number(a.packageValue) || 0) || String(a.clubId).localeCompare(String(b.clubId)))
    .find(offer => (Number(offer.packageValue) || 0) > ourPackage * 1.08 && Number(offer.interestScore ?? 0) >= Number(interest?.score ?? 0) + 4) ?? null;
}

function advancePlayer(deal, context, weekKey) {
  const interest = context.interest ?? evaluatePlayerInterest({
    player:context.player,
    buyer:context.buyer,
    seller:context.seller,
    buyerSquad:context.buyerSquad,
    terms:deal.terms,
    save:context.save,
    buyerHasEurope:context.buyerHasEurope,
  });
  if (interest.hardBlocker) return transitionMarketDeal(deal, 'rejected', { weekKey, actor:'player', reasonCode:interest.hardBlocker, interest, awaiting:null, stateOwner:'system' });
  const winner = competingOfferWins(deal, interest);
  if (winner) return transitionMarketDeal(deal, 'hijacked', { weekKey, actor:'player', reasonCode:'preferred_rival_offer', interest, awaiting:null, stateOwner:'system' });
  if (interest.interested) return transitionMarketDeal(deal, 'agreed', { weekKey, actor:'player', reasonCode:'player_accepts', interest, awaiting:'completion', stateOwner:'system' });
  if (interest.score >= 43 && interest.negotiableTerms?.length) {
    const terms = normalizeDealTerms(deal.terms);
    terms.contract.wage = Math.max(terms.contract.wage, interest.requiredWage);
    if (interest.negotiableTerms.includes('duration')) terms.contract.duration = Math.max(terms.contract.duration, 3);
    if (interest.negotiableTerms.includes('squadRole')) {
      const nextRole = { prospect:'squad', squad:'rotation', rotation:'important', important:'crucial', crucial:'crucial' }[terms.contract.squadRole];
      terms.contract.squadRole = nextRole ?? 'rotation';
    }
    if (interest.negotiableTerms.includes('signingBonus')) {
      terms.contract.signingBonus = Math.max(terms.contract.signingBonus, terms.contract.wage * 3);
    }
    return transitionMarketDeal(deal, 'player_negotiation', { weekKey, actor:'player', reasonCode:'player_counter', interest, awaiting:'user', stateOwner:'user', terms });
  }
  return transitionMarketDeal(deal, 'rejected', { weekKey, actor:'player', reasonCode:'player_rejects', interest, awaiting:null, stateOwner:'system' });
}

/** Resolve a submitted personal-terms offer synchronously, independent of a market tick. */
export function resolvePlayerContractDecision(dealInput, context, weekKey) {
  const deal = createMarketDeal(dealInput);
  if (deal.state !== 'player_negotiation' || deal.awaiting !== 'player') {
    throw new Error('DEAL_NOT_AWAITING_PLAYER');
  }
  return advancePlayer(deal, context, weekKey);
}

export function isPlayerCounterAwaitingUser(deal) {
  if (deal?.state !== 'player_negotiation' || deal?.awaiting !== 'user') return false;
  return ['player_counter','player_contract_counter'].includes(deal.decisionLog?.at(-1)?.reasonCode);
}

/** Project player decisions from one market tick into UI-safe notifications. */
export function projectPlayerDecisionNotifications(deals = [], userTeamId, tickKey) {
  const userId = String(userTeamId ?? '');
  if (!userId || !tickKey) return [];
  const messages = {
    player_accepts:{ outcome:'accepted', tone:'success', text:'accepted your contract offer.' },
    player_rejects:{ outcome:'rejected', tone:'error', text:'rejected your contract offer.' },
    player_counter:{ outcome:'countered', tone:'info', text:'has countered your contract offer.' },
  };
  return deals.flatMap(deal => {
    if (String(deal?.buyerTeamId) !== userId && String(deal?.sellerTeamId) !== userId) return [];
    const decision = deal?.decisionLog?.at(-1);
    const response = messages[decision?.reasonCode];
    if (!response || decision?.actor !== 'player' || decision?.weekKey !== tickKey) return [];
    return [{
      dealId:deal.id,
      playerId:deal.playerId,
      playerName:deal.playerName ?? 'The player',
      ...response,
      message:`${deal.playerName ?? 'The player'} ${response.text}`,
    }];
  });
}

/**
 * Advance one persisted deal for one unique market tick. Delegated deals may
 * traverse seller and player decisions in the same week, but every transition
 * is still recorded and legal.
 */
export function advanceMarketDeal(dealInput, context, weekKey) {
  if (isTerminalDeal(dealInput) || dealInput?.state === 'agreed') return dealInput;
  let deal = createMarketDeal(dealInput);
  if (hasDealExpired(deal, weekKey) || context?.windowOpen === false) {
    return transitionMarketDeal(deal, 'expired', { weekKey, actor:'system', reasonCode:'deadline_expired', awaiting:null, stateOwner:'system' });
  }
  if (deal.decisionLog?.some(entry => entry.eventKey?.startsWith(`${weekKey}:tick:`))) return deal;

  const tickEvent = (from, to) => `${weekKey}:tick:${from}:${to}`;
  if (['seller_terms','club_negotiation'].includes(deal.state) && deal.awaiting === 'seller') {
    const previous = deal.state;
    deal = advanceSeller(deal, context, weekKey);
    const last = deal.decisionLog.at(-1);
    deal = { ...deal, decisionLog:[...deal.decisionLog.slice(0, -1), { ...last, eventKey:tickEvent(previous, deal.state) }] };
  }
  if (deal.state === 'player_negotiation' && deal.awaiting === 'player' && (deal.delegated || context?.allowPlayerDecision !== false)) {
    const previous = deal.state;
    deal = advancePlayer(deal, context, weekKey);
    const last = deal.decisionLog.at(-1);
    deal = { ...deal, decisionLog:[...deal.decisionLog.slice(0, -1), { ...last, eventKey:tickEvent(previous, deal.state) }] };
  }
  return deal;
}

export function addCompetingOffer(deal, offer, weekKey) {
  if (!deal || isTerminalDeal(deal)) return deal;
  const clubId = String(offer?.clubId ?? '');
  if (!clubId || clubId === deal.buyerTeamId) return deal;
  const competingOffers = [
    ...(deal.competingOffers ?? []).filter(item => item.clubId !== clubId),
    {
      clubId,
      clubName:String(offer?.clubName ?? clubId),
      packageValue:asMoney(offer?.packageValue),
      interestScore:transferMarketClamp(Math.round(Number(offer?.interestScore) || 0), 0, 100),
      weekKey,
    },
  ].sort((a, b) => b.packageValue - a.packageValue).slice(0, 4);
  return { ...deal, competingOffers, updatedWeekKey:weekKey };
}

export function markTransferMarketTick(marketInput, tickKey) {
  if (Array.isArray(marketInput?.processedTickKeys) && marketInput.processedTickKeys.includes(tickKey)) return marketInput;
  const market = normalizeTransferMarket(marketInput);
  return {
    ...market,
    lastTickKey:tickKey,
    processedTickKeys:[...market.processedTickKeys, tickKey].slice(-16),
  };
}

/** Expire unfinished negotiations and retain only bounded summaries at rollover. */
export function rolloverTransferMarket(marketInput, nextSeason) {
  const market = normalizeTransferMarket(marketInput);
  const weekKey = `${nextSeason}:0`;
  const activeDeals = market.activeDeals.map(deal => {
    if (isTerminalDeal(deal)) return deal;
    return transitionMarketDeal(deal, 'expired', { weekKey, actor:'system', reasonCode:'season_rollover', awaiting:null, stateOwner:'system' });
  });
  return compactTransferMarket({ ...market, activeDeals, processedTickKeys:[], lastTickKey:null });
}