/** modules/transfers.js — buyPlayer, sellPlayer, generateAIOffers, formAdjustedValue */

import { getSave, getTeam, getPlayer, putTeam, putPlayer, getAllPlayers, getAllTeams, addTransfer, putSave } from './db.js';
import { primaryRating } from './matchEngine.js';

// ─── Form-adjusted value ──────────────────────────────────────
export function formAdjustedValue(player) {
  const base  = player.value ?? 10_000_000;
  const score = 50 + (player.goals ?? 0) * 8 + (player.assists ?? 0) * 5 + (player.cleanSheets ?? 0) * 6;
  const mult  = score >= 80 ? 1.35 : score >= 65 ? 1.18 : score >= 50 ? 1.0 : score >= 35 ? 0.88 : 0.75;
  return Math.round(base * mult);
}

export function minimumOffer(player) {
  return Math.floor(formAdjustedValue(player) * 0.88);
}

// ─── Buy a player ─────────────────────────────────────────────
export async function buyPlayer(playerId, offerAmount) {
  const save   = await getSave();
  const player = await getPlayer(playerId);
  if (!player)                           throw new Error('PLAYER_NOT_FOUND');
  if (player.teamId === save.userTeamId) throw new Error('ALREADY_IN_SQUAD');

  const userTeam   = await getTeam(save.userTeamId);
  if (!userTeam || userTeam.budget < offerAmount) throw new Error('INSUFFICIENT_FUNDS');

  // Capture BEFORE any writes
  const fromTeamId = player.teamId;
  const fromTeam   = await getTeam(fromTeamId);

  const threshold = minimumOffer(player);
  if (offerAmount < threshold) throw new Error('OFFER_REJECTED');
  if (offerAmount < formAdjustedValue(player) && Math.random() < 0.10) throw new Error('OFFER_REJECTED');

  await putTeam({ ...userTeam, budget: userTeam.budget - offerAmount });
  if (fromTeam) await putTeam({ ...fromTeam, budget: fromTeam.budget + offerAmount });
  const updated = { ...player, teamId: save.userTeamId };
  await putPlayer(updated);
  await addTransfer({ playerId, playerName: player.name, fromTeamId, toTeamId: save.userTeamId, fee: offerAmount, type: 'buy', date: save.currentDate });
  return { success: true, player: updated, fee: offerAmount };
}

// ─── Sell a player ────────────────────────────────────────────
export async function sellPlayer(playerId) {
  const save   = await getSave();
  const player = await getPlayer(playerId);
  if (!player || player.teamId !== save.userTeamId) throw new Error('PLAYER_NOT_IN_SQUAD');

  const allPlayers = await getAllPlayers();
  const aiIds      = [...new Set(allPlayers.map(p => p.teamId))].filter(id => id !== save.userTeamId);
  const buyerId    = aiIds[Math.floor(Math.random() * aiIds.length)];
  const buyerTeam  = await getTeam(buyerId);
  const fee        = Math.round(formAdjustedValue(player) * (0.9 + Math.random() * 0.22));

  if (!buyerTeam || buyerTeam.budget < fee) throw new Error('NO_BUYERS');

  const userTeam = await getTeam(save.userTeamId);
  await putTeam({ ...buyerTeam, budget: buyerTeam.budget - fee });
  await putTeam({ ...userTeam,  budget: userTeam.budget  + fee });
  await putPlayer({ ...player, teamId: buyerId });
  await addTransfer({ playerId, playerName: player.name, fromTeamId: save.userTeamId, toTeamId: buyerId, fee, type: 'sell', date: save.currentDate });
  return { success: true, fee, buyerName: buyerTeam.name };
}

// ─── Generate AI inbound offers ───────────────────────────────
/**
 * Each gameweek, AI clubs may bid on your players.
 * Stored in save.inboundOffers = [{playerId, clubId, clubName, fee, date, status}]
 */
export async function generateAIOffers() {
  const save      = await getSave();
  const myPlayers = await getAllPlayers();
  const userSquad = myPlayers.filter(p => p.teamId === save.userTeamId);
  const allTeams  = await getAllTeams();
  const aiTeams   = allTeams.filter(t => t.id !== save.userTeamId);

  const existing = save.inboundOffers?.filter(o => o.status === 'pending') ?? [];

  // Limit to 2 new offers per gameweek
  const newOffers = [];
  const shuffled  = [...userSquad].sort(() => Math.random() - 0.5);
  for (const player of shuffled.slice(0, 4)) {
    if (existing.find(o => o.playerId === player.id)) continue;
    if (Math.random() > 0.25) continue; // 25% chance per player per GW
    const club = aiTeams[Math.floor(Math.random() * aiTeams.length)];
    const fav  = formAdjustedValue(player);
    const fee  = Math.round(fav * (0.85 + Math.random() * 0.35));
    if (club.budget < fee) continue;
    newOffers.push({ playerId: player.id, playerName: player.name, clubId: club.id, clubName: club.name, fee, date: save.currentDate, status: 'pending' });
    if (newOffers.length >= 2) break;
  }

  const allOffers = [...existing, ...newOffers];
  await putSave({ ...save, inboundOffers: allOffers });
  return allOffers;
}

// ─── Accept an inbound offer ──────────────────────────────────
export async function acceptOffer(playerId) {
  const save   = await getSave();
  const offer  = save.inboundOffers?.find(o => o.playerId === playerId && o.status === 'pending');
  if (!offer) throw new Error('OFFER_NOT_FOUND');

  const player   = await getPlayer(playerId);
  const buyerTeam = await getTeam(offer.clubId);
  const userTeam  = await getTeam(save.userTeamId);
  if (!buyerTeam || buyerTeam.budget < offer.fee) throw new Error('BUYER_CANT_AFFORD');

  await putTeam({ ...buyerTeam, budget: buyerTeam.budget - offer.fee });
  await putTeam({ ...userTeam,  budget: userTeam.budget  + offer.fee });
  await putPlayer({ ...player, teamId: offer.clubId });
  await addTransfer({ playerId, playerName: player.name, fromTeamId: save.userTeamId, toTeamId: offer.clubId, fee: offer.fee, type: 'accepted_offer', date: save.currentDate });

  const updated = save.inboundOffers.map(o => o.playerId === playerId ? { ...o, status: 'accepted' } : o);
  await putSave({ ...save, inboundOffers: updated });
  return { success: true, fee: offer.fee, buyerName: offer.clubName };
}

// ─── Reject an offer ──────────────────────────────────────────
export async function rejectOffer(playerId) {
  const save  = await getSave();
  const updated = (save.inboundOffers ?? []).map(o => o.playerId === playerId && o.status === 'pending' ? { ...o, status: 'rejected' } : o);
  await putSave({ ...save, inboundOffers: updated });
}

// ─── Counter an offer ─────────────────────────────────────────
export async function counterOffer(playerId, askingPrice) {
  const save  = await getSave();
  const updated = (save.inboundOffers ?? []).map(o => {
    if (o.playerId !== playerId || o.status !== 'pending') return o;
    const accepted = askingPrice <= o.fee * 1.05 || Math.random() < 0.4;
    return { ...o, counterAsking: askingPrice, status: accepted ? 'pending' : 'counter_rejected' };
  });
  await putSave({ ...save, inboundOffers: updated });
}
