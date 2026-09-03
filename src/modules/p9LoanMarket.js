import { getAllPlayers, getPlayer, getSave, getTeam, putSave } from './db.js';
import { loanDestinationProjection } from './academyPathways.js';
import { isOwnedByTeam, isSeniorEligiblePlayer, normalizePlayerStatus } from './playerStatus.js';
import { isTransferWindowOpen } from './transfers.js';
import {
  TERMINAL_DEAL_STATES,
  createMarketDeal,
  marketWeekKey,
  normalizeDealTerms,
  normalizeTransferMarket,
  projectLegacyInboundOffers,
  upsertMarketDeal,
} from './transferMarket.js';

/*
 * P9 outbound-loan bridge into P4's persisted agreement state machine.
 *
 * Destination comparison never moves a player. Choosing a destination creates
 * an AI-originated loan offer awaiting the manager as seller; the existing P4
 * Deals surface owns accept/counter/withdraw, player consent and atomic
 * settlement. There is deliberately no direct player/team/budget write here.
 */

function p9LoanExpiryKey(save, weeks = 3) {
  return `${save.season}:${Number(save.currentGameweek ?? 1) + weeks}`;
}

function p9LoanRemainingWeeks(save) {
  return Math.max(0, Number(save.totalGameweeks ?? 38) - Number(save.currentGameweek ?? 1) + 1);
}

function p9LoanFee(player) {
  return Math.max(0, Math.round(Number(player?.value ?? 0) * .1));
}

function p9HasActivePlayerDeal(market, playerId) {
  return market.activeDeals.some(deal =>
    String(deal.playerId) === String(playerId)
    && !TERMINAL_DEAL_STATES.has(deal.state),
  );
}

export async function requestManagedLoanOutOffer(playerId, destinationTeamId) {
  const save = await getSave();
  if (!save) throw new Error('NO_ACTIVE_SAVE');
  if (!isTransferWindowOpen(save).open) throw new Error('WINDOW_CLOSED');

  const [rawPlayer, destination, parent, allPlayers] = await Promise.all([
    getPlayer(playerId),
    getTeam(destinationTeamId),
    getTeam(save.userTeamId),
    getAllPlayers(),
  ]);
  const player = normalizePlayerStatus(rawPlayer);
  if (!player || !isOwnedByTeam(player, save.userTeamId) || !isSeniorEligiblePlayer(player, save.userTeamId)) {
    throw new Error('PLAYER_NOT_ELIGIBLE_FOR_LOAN');
  }
  if (player.onLoan || player.loanedFrom) throw new Error('ALREADY_ON_LOAN');
  if (player.signedThisSeason) throw new Error('SIGNED_THIS_SEASON');
  if (!destination || String(destination.id) === String(save.userTeamId)) throw new Error('INVALID_LOAN_DESTINATION');
  if (!parent) throw new Error('TEAM_NOT_FOUND');

  const destinationSeniorCount = allPlayers.filter(candidate => isSeniorEligiblePlayer(candidate, destination.id)).length;
  if (destinationSeniorCount >= 30) throw new Error('DESTINATION_SQUAD_FULL');

  const weekKey = marketWeekKey(save);
  const projection = loanDestinationProjection(player, destination, allPlayers, { weekKey });
  if (!projection) throw new Error('INVALID_LOAN_DESTINATION');

  const fee = p9LoanFee(player);
  const wageContributionPercentage = 100;
  const prepaidWages = Math.round(
    Number(player.wage ?? 0)
    * p9LoanRemainingWeeks(save)
    * wageContributionPercentage / 100,
  );
  if (Number(destination.budget ?? 0) < fee + prepaidWages) throw new Error('DESTINATION_CANNOT_AFFORD');

  const market = normalizeTransferMarket(save.transferMarket);
  if (p9HasActivePlayerDeal(market, player.id)) throw new Error('PLAYER_HAS_ACTIVE_DEAL');

  const terms = normalizeDealTerms({
    loan:{
      fee,
      wageContributionPercentage,
      recall:true,
      optionToBuy:0,
      obligationToBuy:0,
    },
    contract:{
      wage:Math.max(1_000, Number(player.wage ?? 1_000)),
      duration:1,
      squadRole:projection.expectedRole,
      signingBonus:0,
    },
  }, { player });

  const deal = createMarketDeal({
    type:'loan',
    state:'club_negotiation',
    playerId:player.id,
    playerName:player.name,
    buyerTeamId:destination.id,
    sellerTeamId:save.userTeamId,
    createdBy:'ai',
    userSide:'seller',
    stateOwner:'user',
    awaiting:'user',
    delegated:false,
    createdWeekKey:weekKey,
    expiresWeekKey:p9LoanExpiryKey(save),
    terms,
    legacyOffer:{
      date:save.currentDate ?? null,
      clubName:destination.name ?? destination.id,
      status:'pending',
    },
    seed:`p9-loan-offer:${player.id}:${destination.id}:${weekKey}`,
  }, market);

  const transferMarket = upsertMarketDeal(market, deal);
  await putSave({
    ...save,
    transferMarket,
    inboundOffers:projectLegacyInboundOffers(transferMarket),
  });
  return { deal, projection };
}
