/** modules/transfers.js — buyPlayer, sellPlayer, generateAIOffers, formAdjustedValue */

// ─── Form-adjusted value ──────────────────────────────────────
// Computes a realistic market value factoring in: base value, current form,
// age, and potential. Higher-value players get smaller % boosts from form
// to prevent £100M players becoming £250M. Young high-potential players
// in form get outsized premiums (the "wonderkid tax").
function formAdjustedValue(player) {
  const base  = Number(player.value) || 10_000_000;
  const age   = player.age ?? 24;
  const pot   = player.potentialRating ?? 70;
  const cur   = _fav_primaryRating(player) || 70; // fallback 70 if position/ratings missing
  const headroom = Math.max(0, pot - cur);

  // ── Form score: uses the player's actual form field (50 = average, 80+ = hot) ──
  // Form is updated each GW: rises when playing (boosted by goals/assists/CS), decays when benched
  const cappedForm = Math.min(99, Math.max(1, player.form ?? 50));

  // ── Form multiplier: scales DOWN for expensive players ──
  // Base form effect: hot form = up to +50%, cold = down to -25%
  let formMult;
  if (cappedForm >= 80)      formMult = 1.25 + (cappedForm - 80) * 0.013; // 80→1.25, 99→1.50
  else if (cappedForm >= 65) formMult = 1.08 + (cappedForm - 65) * 0.011; // 65→1.08, 79→1.24
  else if (cappedForm >= 50) formMult = 1.0;                               // average
  else if (cappedForm >= 35) formMult = 0.92 - (50 - cappedForm) * 0.004;  // 35→0.86
  else                       formMult = 0.75;

  // Dampen form effect for high-value players (diminishing returns)
  const valueTier = Math.min(1, base / 80_000_000);
  const dampening = 1 - valueTier * 0.4;

  // ALSO dampen form for low-rated players — a 55-rated player on a hot streak
  // shouldn't inflate as much as an 80-rated player on the same streak
  // Rating dampening: 0.4 at rating 50, 0.7 at 65, 1.0 at 78+
  const ratingDamp = Math.min(1, Math.max(0.4, (cur - 50) / 28));
  const dampenedFormMult = 1 + (formMult - 1) * dampening * ratingDamp;

  // ── Youth/potential premium ──
  // Young players with high potential command outsized premiums when in form
  // But scale by current rating — a 55-rated youth with high potential gets
  // a moderate premium, not the same as a 70-rated wonderkid
  let potentialMult = 1.0;
  if (age <= 23 && headroom > 10) {
    // Potential premium scales with headroom but is moderated by current rating
    // A 70-rated player with pot 90 (headroom 20): 0.03*20 = 0.60
    // A 55-rated player with pot 85 (headroom 30): 0.03*30 = 0.90 → capped 0.60
    const rawPremium = headroom * 0.03;
    // Cap harder for low-rated players: max premium scales from 30% at rating 50 to 80% at 75+
    const ratingCap = Math.min(0.80, 0.30 + Math.max(0, (cur - 50) / 25) * 0.50);
    const potPremium = Math.min(ratingCap, rawPremium);
    // Potential premium is a stable valuation factor — form has only a small
    // influence (±10%) so it doesn't compound with the form multiplier above
    const formFactor = Math.max(0, (cappedForm - 50) / 40);
    potentialMult = 1 + potPremium * (0.9 + 0.1 * formFactor);
  } else if (age <= 26 && headroom > 5) {
    potentialMult = 1 + Math.min(0.25, headroom * 0.015);
  }

  // ── Age discount for older players ──
  const ageMult = age >= 33 ? 0.80 : age >= 31 ? 0.90 : age >= 29 ? 0.95 : 1.0;

  // ── Final cap: prevent total multiplier from exceeding sensible bounds ──
  // For low-rated players (< 65), cap total boost at 2.0× base value
  // For mid-rated (65-75), cap at 2.5×; for high-rated (75+), no extra cap
  const rawResult = base * dampenedFormMult * potentialMult * ageMult;
  let maxMult;
  if (cur < 65)      maxMult = 2.0;
  else if (cur < 75) maxMult = 2.5;
  else               maxMult = 4.0;
  const capped = Math.min(rawResult, base * maxMult);

  return Math.max(500_000, Math.round(capped));
}

function _fav_primaryRating(p) {
  const pos = p.position;
  if (['ST','CF','RW','LW','CAM'].includes(pos)) return p.attack;
  if (['CM','CDM','RM','LM'].includes(pos))       return p.midfield;
  if (['CB','RB','LB'].includes(pos))             return p.defence;
  return p.goalkeeping;
}

function minimumOffer(player) {
  return Math.floor(formAdjustedValue(player) * 0.88);
}

// ─── Reputation gate ──────────────────────────────────────────
// Returns the minimum club reputation required to sign a player based on
// their CURRENT rating (not potential). High-potential/low-rated youth are
// not blocked — their potential is fine to develop at any club level.
// A club growing through promotions naturally gains rep to unlock better signings.
//
// Thresholds (current rating → min club rep):
//  90+  elite world-class  → need rep ≥ 88  (UCL-level clubs only)
//  85+  top-tier           → need rep ≥ 80
//  80+  very good          → need rep ≥ 72
//  75+  above average      → need rep ≥ 64
//  70+  solid              → need rep ≥ 56
//  65+  decent             → need rep ≥ 48
//  60+  league-standard    → need rep ≥ 40
//  <60  anyone can sign
function playerMinRepToSign(player) {
  const rating = _fav_primaryRating(player);
  if (rating >= 90) return 88;
  if (rating >= 85) return 80;
  if (rating >= 80) return 72;
  if (rating >= 75) return 64;
  if (rating >= 70) return 56;
  if (rating >= 65) return 48;
  if (rating >= 60) return 40;
  return 0;
}

// Returns true if a club is allowed to sign this player.
// Potential is explicitly excluded from the gate — a player with a low current
// rating but high potential can move to any club (developing wonderkids at
// small clubs is a valid and realistic strategy).
//
// Soft bypass: transfer-listed players are slightly more flexible (-4 rep)
// because they actively want to leave, giving lower-rep clubs a small window.
//
// Hard block: a player who has already moved clubs this season cannot be
// signed again until the next season (signedThisSeason flag).
function canClubSignPlayer(team, player) {
  if (player.signedThisSeason) return false; // already transferred this season
  const minRep = playerMinRepToSign(player);
  if (minRep === 0) return true; // sub-60 rated — anyone can sign
  const clubRep = team.reputation ?? 60;
  const adjustedMin = player.transferListed ? Math.max(0, minRep - 4) : minRep;
  return clubRep >= adjustedMin;
}

// Human-readable reason why a signing is blocked (shown in UI).
function repGateReason(team, player) {
  if (player.signedThisSeason) {
    return `${player.name} already transferred this season and cannot move again until next season.`;
  }
  const minRep = playerMinRepToSign(player);
  const needed = player.transferListed ? Math.max(0, minRep - 4) : minRep;
  const clubRep = team.reputation ?? 60;
  const gap = needed - clubRep;
  if (gap <= 0) return null;
  return `${player.name} (rated ${_fav_primaryRating(player)}) won't join — your club reputation (${clubRep}) is too low. Need ${needed}+.`;
}

// ─── Buy a player ─────────────────────────────────────────────
async function buyPlayer(playerId, offerAmount) {
  const save   = await getSave();
  const player = await getPlayer(playerId);
  if (!player)                           throw new Error('PLAYER_NOT_FOUND');
  if (player.teamId === save.userTeamId) throw new Error('ALREADY_IN_SQUAD');

  const userTeam   = await getTeam(save.userTeamId);
  if (!userTeam || userTeam.budget < offerAmount) throw new Error('INSUFFICIENT_FUNDS');

  // Transfer window gate: both buyer and seller must be within a valid window.
  if (!isTransferWindowOpen(save).open) throw new Error('WINDOW_CLOSED');

  // Already transferred this season — hard block before rep check
  if (player.signedThisSeason) throw new Error('SIGNED_THIS_SEASON');

  // Reputation gate: player's current rating must be achievable for the club's rep level.
  // Potential is NOT gated — wonderkids can still develop at any club.
  if (!canClubSignPlayer(userTeam, player)) throw new Error('REP_TOO_LOW');

  // Capture BEFORE any writes
  const fromTeamId = player.teamId;
  const fromTeam   = await getTeam(fromTeamId);

  const threshold = minimumOffer(player);
  if (offerAmount < threshold) throw new Error('OFFER_REJECTED');
  if (offerAmount < formAdjustedValue(player) && Math.random() < 0.10) throw new Error('OFFER_REJECTED');

  await putTeam({ ...userTeam, budget: userTeam.budget - offerAmount });
  if (fromTeam) await putTeam({ ...fromTeam, budget: fromTeam.budget + offerAmount });
  const updated = { ...player, teamId: save.userTeamId, signedThisSeason: true };
  await putPlayer(updated);
  await addTransfer({ playerId, playerName: player.name, fromTeamId, toTeamId: save.userTeamId, fee: offerAmount, type: 'buy', date: save.currentDate });
  return { success: true, player: updated, fee: offerAmount };
}

// ─── Reputation-weighted team picker ─────────────────────────
// Higher-rep clubs are more likely to buy expensive/high-rated players.
// This means PL clubs realistically poach stars from Championship etc.
function _pickBuyerWeighted(teams, playerValue, playerRating) {
  // Weight = reputation^2 * budget-adequacy bonus
  // High-value players attract higher-rep clubs disproportionately
  const valueTier = Math.min(1, playerValue / 50_000_000); // 0-1, 1 at £50M+
  const ratingTier = Math.min(1, Math.max(0, (playerRating - 55) / 30)); // 0-1, peaks at 85+
  const attractiveness = Math.max(valueTier, ratingTier); // how "big" is this signing

  const weights = teams.map(t => {
    const rep = t.reputation ?? 60;
    const canAfford = t.budget >= playerValue * 0.8 ? 1.5 : (t.budget >= playerValue * 0.5 ? 0.8 : 0.2);
    // Base weight from reputation — higher rep clubs much more likely for attractive players
    const repWeight = attractiveness > 0.4
      ? Math.pow(rep / 60, 2.5)   // big signings: top clubs dominate
      : Math.pow(rep / 60, 1.2);  // modest signings: more even spread
    return repWeight * canAfford;
  });

  const total = weights.reduce((s, w) => s + w, 0);
  if (total === 0) return teams[Math.floor(Math.random() * teams.length)];
  let r = Math.random() * total;
  for (let i = 0; i < teams.length; i++) {
    r -= weights[i];
    if (r <= 0) return teams[i];
  }
  return teams[teams.length - 1];
}

// ─── Sell a player ────────────────────────────────────────────
async function sellPlayer(playerId) {
  const save   = await getSave();
  if (!isTransferWindowOpen(save).open) throw new Error('WINDOW_CLOSED');
  const player = await getPlayer(playerId);
  if (!player || player.teamId !== save.userTeamId) throw new Error('PLAYER_NOT_IN_SQUAD');

  const allTeams  = await getAllTeams();
  const aiTeams   = allTeams.filter(t => t.id !== save.userTeamId);
  const fee       = Math.round(formAdjustedValue(player) * (0.9 + Math.random() * 0.22));
  const rating    = _fav_primaryRating(player);

  // Try up to 5 times to find a buyer that can afford the fee AND meets rep gate
  let buyerTeam = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = _pickBuyerWeighted(aiTeams, fee, rating);
    if (candidate && candidate.budget >= fee && canClubSignPlayer(candidate, player)) { buyerTeam = candidate; break; }
  }
  if (!buyerTeam) throw new Error('NO_BUYERS');

  const userTeam = await getTeam(save.userTeamId);
  await putTeam({ ...buyerTeam, budget: buyerTeam.budget - fee });
  await putTeam({ ...userTeam,  budget: userTeam.budget  + fee });
  await putPlayer({ ...player, teamId: buyerTeam.id, signedThisSeason: true });
  await addTransfer({ playerId, playerName: player.name, fromTeamId: save.userTeamId, toTeamId: buyerTeam.id, fee, type: 'sell', date: save.currentDate });
  return { success: true, fee, buyerName: buyerTeam.name };
}

// ─── Generate AI inbound offers ───────────────────────────────
/**
 * Each gameweek, AI clubs may bid on your players.
 * Stored in save.inboundOffers = [{playerId, clubId, clubName, fee, date, status}]
 */
async function generateAIOffers() {
  const save      = await getSave();
  // AI inbound offers only happen during transfer windows
  if (!isTransferWindowOpen(save).open) return [];
  const myPlayers = await getAllPlayers();
  const userSquad = myPlayers.filter(p => p.teamId === save.userTeamId);
  const allTeams  = await getAllTeams();
  const aiTeams   = allTeams.filter(t => t.id !== save.userTeamId);

  const existing = save.inboundOffers?.filter(o => o.status === 'pending') ?? [];

  // Deadline day = more frantic last-minute activity, higher chance of bids
  const onDeadline = typeof isDeadlineDay === 'function' && isDeadlineDay(save).isDeadline;
  const offerChance = onDeadline ? 0.50 : 0.25;
  const maxNewOffers = onDeadline ? 3 : 2;

  // Limit to maxNewOffers per call
  const newOffers = [];
  const shuffled  = [...userSquad].sort(() => Math.random() - 0.5);
  for (const player of shuffled.slice(0, 5)) {
    if (existing.find(o => o.playerId === player.id)) continue;
    if (Math.random() > offerChance) continue;
    const fav    = formAdjustedValue(player);
    const rating = _fav_primaryRating(player);
    const club   = _pickBuyerWeighted(aiTeams, fav, rating);
    const fee    = Math.round(fav * (0.85 + Math.random() * 0.35));
    if (club.budget < fee) continue;
    // Only clubs that meet the rep threshold can bid on the player
    if (!canClubSignPlayer(club, player)) continue;
    newOffers.push({ playerId: player.id, playerName: player.name, clubId: club.id, clubName: club.name, fee, date: save.currentDate, status: 'pending' });
    if (newOffers.length >= maxNewOffers) break;
  }

  const allOffers = [...existing, ...newOffers];
  await patchSave({ inboundOffers: allOffers });
  return newOffers;
}

// ─── Accept an inbound offer ──────────────────────────────────
async function acceptOffer(playerId) {
  const save   = await getSave();
  const offer  = save.inboundOffers?.find(o => o.playerId === playerId && o.status === 'pending');
  if (!offer) throw new Error('OFFER_NOT_FOUND');

  const player   = await getPlayer(playerId);
  const buyerTeam = await getTeam(offer.clubId);
  const userTeam  = await getTeam(save.userTeamId);
  if (!buyerTeam || buyerTeam.budget < offer.fee) throw new Error('BUYER_CANT_AFFORD');

  await putTeam({ ...buyerTeam, budget: buyerTeam.budget - offer.fee });
  await putTeam({ ...userTeam,  budget: userTeam.budget  + offer.fee });
  await putPlayer({ ...player, teamId: offer.clubId, signedThisSeason: true });
  await addTransfer({ playerId, playerName: player.name, fromTeamId: save.userTeamId, toTeamId: offer.clubId, fee: offer.fee, type: 'accepted_offer', date: save.currentDate });

  const updated = save.inboundOffers.map(o => o.playerId === playerId ? { ...o, status: 'accepted' } : o);
  await putSave({ ...save, inboundOffers: updated });
  return { success: true, fee: offer.fee, buyerName: offer.clubName };
}

// ─── Reject an offer ──────────────────────────────────────────
async function rejectOffer(playerId) {
  const save  = await getSave();
  const updated = (save.inboundOffers ?? []).map(o => o.playerId === playerId && o.status === 'pending' ? { ...o, status: 'rejected' } : o);
  await putSave({ ...save, inboundOffers: updated });
}

// ─── Counter an offer — instant negotiation ─────────────────
async function counterOffer(playerId, askingPrice) {
  const save   = await getSave();
  const player = await getPlayer(playerId);
  const fav    = player ? formAdjustedValue(player) : askingPrice;
  let result   = { outcome: 'rejected' };

  const updated = (save.inboundOffers ?? []).map(o => {
    if (o.playerId !== playerId || o.status !== 'pending') return o;

    // AI decision logic:
    // If asking <= 105% of their original offer, they just accept at your asking price
    if (askingPrice <= o.fee * 1.05) {
      result = { outcome: 'accepted', fee: askingPrice, clubName: o.clubName };
      return { ...o, fee: askingPrice, status: 'pending' };
    }

    // If asking is reasonable (within 130% of their offer), chance they meet in the middle
    const stretch = askingPrice / o.fee;
    if (stretch <= 1.30 && Math.random() < 0.55) {
      const meetFee = Math.round(o.fee + (askingPrice - o.fee) * (0.4 + Math.random() * 0.4));
      result = { outcome: 'accepted', fee: meetFee, clubName: o.clubName };
      return { ...o, fee: meetFee, status: 'pending' };
    }

    // Otherwise they come back with a revised (higher) counter, or walk away
    if (Math.random() < 0.6) {
      // AI bumps their offer up but not to your asking price
      const bump = Math.round(o.fee * (1.05 + Math.random() * 0.15));
      const newFee = Math.min(bump, askingPrice - 1);
      result = { outcome: 'counter', fee: newFee, clubName: o.clubName, originalFee: o.fee };
      return { ...o, fee: newFee, status: 'pending' };
    }

    // Walk away
    result = { outcome: 'rejected', clubName: o.clubName };
    return { ...o, counterAsking: askingPrice, status: 'counter_rejected' };
  });

  await putSave({ ...save, inboundOffers: updated });
  return result;
}

// ─── Transfer Window Logic ─────────────────────────────────────
// Real football windows:
//   Summer: 1 Aug – 1 Sep  (GW 1 is ~9 Aug, window closes after ~GW 3)
//   Winter: 1 Jan – 31 Jan  (roughly GW 21–24 depending on schedule)
//
// We derive window status from save.currentDate for accuracy rather
// than gameweek number, which can vary by league and start date.

function isTransferWindowOpen(save) {
  const d = new Date(save.currentDate);
  const month = d.getMonth(); // 0=Jan … 11=Dec
  const day   = d.getDate();

  // Summer window: 1 Aug (month 7) through 31 Aug (window closes 1 Sep)
  if (month === 7) return { open: true, window: 'summer' };
  // Winter window: 1 Jan through 31 Jan
  if (month === 0) return { open: true, window: 'winter' };
  // Shoulder days: Sep 1 and Feb 1 — deadline day, still open
  if (month === 8 && day === 1) return { open: true, window: 'summer' };
  if (month === 1 && day === 1) return { open: true, window: 'winter' };

  return { open: false, window: null };
}

// Returns { isDeadline, window } — true when the transfer window is open
// AND the next gameweek advance (+7 days) would cross or reach the deadline.
// This catches the case where the game date never lands exactly on Sep 1 / Feb 1.
function isDeadlineDay(save) {
  const d = new Date(save.currentDate);
  const month = d.getMonth();
  const day   = d.getDate();

  // Is the window currently open?
  let currentWindow = null;
  if (month === 7) currentWindow = 'summer';                    // Aug
  else if (month === 0) currentWindow = 'winter';               // Jan
  else if (month === 8 && day === 1) currentWindow = 'summer';  // Sep 1 itself
  else if (month === 1 && day === 1) currentWindow = 'winter';  // Feb 1 itself

  if (!currentWindow) return { isDeadline: false, window: null };

  // Compute the deadline date
  const deadline = currentWindow === 'summer'
    ? new Date(d.getFullYear(), 8, 1)   // Sep 1
    : new Date(d.getFullYear(), 1, 1);  // Feb 1

  // Deadline day = we're in the window AND the next 7-day advance would reach/cross it
  const nextAdvance = new Date(d);
  nextAdvance.setDate(nextAdvance.getDate() + 7);
  const wouldCross = nextAdvance >= deadline;

  return { isDeadline: wouldCross, window: currentWindow };
}

// Human-readable status string for UI
function transferWindowStatus(save) {
  const { open, window } = isTransferWindowOpen(save);
  if (open) {
    const d = new Date(save.currentDate);
    // Calculate deadline
    let deadline;
    if (window === 'summer') {
      deadline = new Date(d.getFullYear(), 8, 1); // Sep 1
    } else {
      deadline = new Date(d.getFullYear(), 1, 1);  // Feb 1
    }
    const msLeft = deadline - d;
    const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));
    const windowName = window === 'summer' ? 'Summer' : 'Winter';
    const onDeadline = typeof isDeadlineDay === 'function' && isDeadlineDay(save).isDeadline;
    const label = onDeadline
      ? `${windowName} Window Open — Deadline Day!`
      : `${windowName} window open — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`;
    return { open: true, window, label };
  }
  // Closed — find the next window opening date
  const d2 = new Date(save.currentDate);
  const yr  = d2.getFullYear();

  // Next Aug 1 (summer) — roll to next year if already passed
  let nextSummer = new Date(yr, 7, 1);
  if (nextSummer <= d2) nextSummer = new Date(yr + 1, 7, 1);

  // Next Jan 1 (winter) — roll to next year if already passed
  let nextWinter = new Date(yr, 0, 1);
  if (nextWinter <= d2) nextWinter = new Date(yr + 1, 0, 1);

  // Whichever comes first
  const nextOpen  = nextSummer <= nextWinter ? nextSummer : nextWinter;
  const nextLabel = nextOpen.getMonth() === 7 ? 'Summer' : 'Winter';

  const msUntil   = nextOpen - d2;
  const daysUntil = Math.max(1, Math.ceil(msUntil / 86_400_000));
  return { open: false, window: null, label: `Transfer window closed — ${nextLabel} window opens in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}` };
}

// ─── AI-to-AI Transfer Simulation ─────────────────────────────
// Runs each gameweek during a transfer window. AI teams with budget
// look for players to buy from other AI squads, respecting:
//  • Reputation gate (canClubSignPlayer)
//  • Budget adequacy
//  • Squad size limits (≤30)
//  • Clubs won't sell star players (top-2 by rating) unless offered ≥ 130% value
//  • Clubs won't drop below 16 players (squad safety floor)
//
// Returns array of completed deals for potential news feed use.
async function simulateAITransfers(save) {
  const { open } = isTransferWindowOpen(save);
  if (!open) return [];

  const allTeams   = await getAllTeams();
  const allPlayers = await getAllPlayers();
  const userTeamId = save.userTeamId;

  // Build mutable squad maps keyed by teamId
  const squadMap = new Map();
  for (const p of allPlayers) {
    if (!squadMap.has(p.teamId)) squadMap.set(p.teamId, []);
    squadMap.get(p.teamId).push({ ...p });
  }

  const aiTeams = allTeams.filter(t => t.id !== userTeamId);
  // Shuffle so no club always goes first
  const shuffledTeams = [...aiTeams].sort(() => Math.random() - 0.5);

  // Budget tracking (we'll write back at end)
  const budgetMap = new Map(allTeams.map(t => [t.id, t.budget ?? 0]));

  const deals = [];
  // Each team attempts 0–2 signings per window check (controlled by probability)
  for (const buyer of shuffledTeams) {
    const buyerBudget = budgetMap.get(buyer.id) ?? 0;
    if (buyerBudget < 1_000_000) continue; // broke, skip

    const buyerSquad = squadMap.get(buyer.id) ?? [];
    if (buyerSquad.length >= 28) continue; // squad full

    // Determine a target rating range the club should be looking at
    // Clubs aim to improve positions. Target rating: slightly above squad average
    const avgRating = buyerSquad.length
      ? buyerSquad.reduce((s, p) => s + _fav_primaryRating(p), 0) / buyerSquad.length
      : 60;
    const targetMin = Math.max(50, avgRating - 5);
    const targetMax = Math.min(99, avgRating + 18); // reach up modestly

    // Find available players from OTHER AI teams (not user, not same club)
    const candidates = allPlayers.filter(p => {
      if (p.teamId === userTeamId) return false;
      if (p.teamId === buyer.id)   return false;
      const r = _fav_primaryRating(p);
      if (r < targetMin || r > targetMax) return false;
      if (!canClubSignPlayer(buyer, p))   return false;
      const pValue = formAdjustedValue(p);
      if (buyerBudget < pValue * 0.75)    return false; // can't afford

      // Seller squad safety: won't drop below 16
      const sellerSquad = squadMap.get(p.teamId) ?? [];
      if (sellerSquad.length <= 16) return false;

      // Seller star protection: top 2 rated players in squad not for sale
      // unless buyer offers a premium (simulate transfer listed vs not)
      const sorted = [...sellerSquad].sort((a, b) => _fav_primaryRating(b) - _fav_primaryRating(a));
      const isTopStar = sorted[0]?.id === p.id || sorted[1]?.id === p.id;
      if (isTopStar) return false; // AI protects key players

      return true;
    });

    if (!candidates.length) continue;

    // Probability of making a move this GW — not every team buys every week
    // Higher rep / bigger budget = more active in window
    const activityChance = Math.min(0.35, 0.05 + (buyer.reputation ?? 60) / 300);
    if (Math.random() > activityChance) continue;

    // Pick best value candidate (highest rating within affordable range)
    const affordable = candidates.filter(p => budgetMap.get(buyer.id) >= formAdjustedValue(p) * 0.75);
    if (!affordable.length) continue;

    // Weighted pick — prefer higher rated within budget
    affordable.sort((a, b) => _fav_primaryRating(b) - _fav_primaryRating(a));
    // Small randomness: pick from top 5
    const pool    = affordable.slice(0, 5);
    const target  = pool[Math.floor(Math.random() * pool.length)];
    const fav     = formAdjustedValue(target);
    // AI pays between 90% and 110% of form value (realistic negotiation)
    const fee     = Math.round(fav * (0.90 + Math.random() * 0.20));
    const curBudget = budgetMap.get(buyer.id);
    if (curBudget < fee) continue;

    const sellerTeamId = target.teamId;

    // Execute transfer in memory
    budgetMap.set(buyer.id,     curBudget - fee);
    budgetMap.set(sellerTeamId, (budgetMap.get(sellerTeamId) ?? 0) + fee);

    // Update squad maps
    const oldSellerSquad = squadMap.get(sellerTeamId) ?? [];
    squadMap.set(sellerTeamId, oldSellerSquad.filter(p => p.id !== target.id));
    const buyerSquadNow = squadMap.get(buyer.id) ?? [];
    squadMap.set(buyer.id, [...buyerSquadNow, { ...target, teamId: buyer.id, signedThisSeason: true }]);

    // Update allPlayers array for subsequent iterations
    const pIdx = allPlayers.findIndex(p => p.id === target.id);
    if (pIdx !== -1) allPlayers[pIdx] = { ...allPlayers[pIdx], teamId: buyer.id, signedThisSeason: true };

    deals.push({
      playerId:      target.id,
      playerName:    target.name,
      fromTeamId:    sellerTeamId,
      fromTeamName:  allTeams.find(t => t.id === sellerTeamId)?.name ?? sellerTeamId,
      toTeamId:      buyer.id,
      toTeamName:    buyer.name,
      fee,
      date:          save.currentDate,
    });
  }

  if (!deals.length) return [];

  // Persist changed players and team budgets
  const movedPlayerIds = new Set(deals.map(d => d.playerId));
  const playersToWrite = allPlayers.filter(p => movedPlayerIds.has(p.id));
  if (playersToWrite.length) await bulkPut('players', playersToWrite);

  const teamsToWrite = [];
  for (const t of allTeams) {
    if (budgetMap.has(t.id) && budgetMap.get(t.id) !== t.budget) {
      teamsToWrite.push({ ...t, budget: budgetMap.get(t.id) });
    }
  }
  if (teamsToWrite.length) await bulkPut('teams', teamsToWrite);

  // Log to transfer history
  for (const d of deals) {
    await addTransfer({ playerId: d.playerId, playerName: d.playerName, fromTeamId: d.fromTeamId, toTeamId: d.toTeamId, fee: d.fee, type: 'ai_transfer', date: d.date }).catch(() => {});
  }

  return deals;
}

// ─── Loan System ───────────────────────────────────────────────
//
// Season-long loans only (v1). Architecture is recall/cap-ready:
//   player.loanRecallable  — reserved for future recall clause support
//   save.loanCap           — reserved for future FIFA-style cap enforcement
//
// Financial model (upfront deduction at point of signing):
//   Loan club pays:   loanFee (10% base value) + (wage × gwsRemaining)
//   Parent club gets: loanFee credited to budget
//   User loans out:   budget += loanFee + (wage × gwsRemaining)  [full wage relief]
//
// Player schema additions:
//   onLoan              boolean — true while out on loan
//   loanedTo            teamId  — loan destination (set on parent-side player)
//   loanedFrom          teamId  — parent club (set on receiving-side player)
//   loanOriginalTeamId  teamId  — safety copy of parent teamId for season-end return
//   loanSeason          string  — season the loan was initiated (e.g. '2025/26')
//   loanRecallable      boolean — reserved: future mid-season recall support
//
// Loan returns are handled by processEndOfSeason (season.js).

function _loanFee(player) {
  return Math.round((player.value ?? 0) * 0.10);
}

function _loanWageCost(player, save) {
  const gwsRemaining = Math.max(0, (save.totalGameweeks ?? 38) - (save.currentGameweek ?? 1) + 1);
  return (player.wage ?? 0) * gwsRemaining;
}

// Total cost for the loan club: fee + projected wages
function loanTotalCost(player, save) {
  return _loanFee(player) + _loanWageCost(player, save);
}

// User loans OUT one of their own players to an AI club.
// Budget effect: user receives loanFee + projected wage cost back.
async function loanOutPlayer(playerId) {
  const save = await getSave();
  if (!isTransferWindowOpen(save).open) throw new Error('WINDOW_CLOSED');

  const player = await getPlayer(playerId);
  if (!player || player.teamId !== save.userTeamId) throw new Error('PLAYER_NOT_IN_SQUAD');
  if (player.onLoan || player.loanedFrom) throw new Error('ALREADY_ON_LOAN');
  if (player.signedThisSeason) throw new Error('SIGNED_THIS_SEASON');

  // Find an interested AI club (lower-rep clubs prefer cheaper/younger players)
  const allTeams = await getAllTeams();
  const userTeam = await getTeam(save.userTeamId);
  const userRep  = userTeam?.reputation ?? 60;
  const totalNeeded = loanTotalCost(player, save);
  const candidates = allTeams.filter(t =>
    t.id !== save.userTeamId &&
    (t.budget ?? 0) >= totalNeeded &&
    (t.reputation ?? 60) < userRep + 20
  );
  if (!candidates.length) throw new Error('NO_LOAN_TAKERS');

  const loanClub = candidates[Math.floor(Math.random() * candidates.length)];
  const fee = _loanFee(player);
  const wageCost = _loanWageCost(player, save);
  const totalCost = fee + wageCost;

  const loanTeam = allTeams.find(t => t.id === loanClub.id) ?? await getTeam(loanClub.id);

  // Loan club pays total cost; parent club (user) receives fee + wage relief
  await putTeam({ ...loanTeam, budget: loanTeam.budget - totalCost });
  await putTeam({ ...userTeam, budget: userTeam.budget + fee + wageCost });

  // Player moves to loan club with loan metadata
  const loanedPlayer = {
    ...player,
    teamId: loanClub.id,
    onLoan: true,
    loanedFrom: save.userTeamId,
    loanOriginalTeamId: save.userTeamId,
    loanSeason: save.season,
    loanRecallable: false, // reserved for future recall clause
    signedThisSeason: true,
  };
  await putPlayer(loanedPlayer);

  await addTransfer({
    playerId, playerName: player.name,
    fromTeamId: save.userTeamId, toTeamId: loanClub.id,
    fee, type: 'loan_out', date: save.currentDate,
  });

  return { success: true, fee, wageCost, totalCost, loanClubName: loanClub.name };
}

// User loans IN a player from an AI parent club.
// Budget effect: user pays loanFee + projected wages upfront.
async function loanInPlayer(playerId) {
  const save = await getSave();
  if (!isTransferWindowOpen(save).open) throw new Error('WINDOW_CLOSED');

  const player = await getPlayer(playerId);
  if (!player) throw new Error('PLAYER_NOT_FOUND');
  if (player.teamId === save.userTeamId) throw new Error('ALREADY_IN_SQUAD');
  if (player.onLoan || player.loanedFrom) throw new Error('ALREADY_ON_LOAN');
  if (player.signedThisSeason) throw new Error('SIGNED_THIS_SEASON');

  // Check the AI club is willing to loan this player (fringe/youth criteria)
  const parentTeam = await getTeam(player.teamId);
  if (!parentTeam) throw new Error('PARENT_CLUB_NOT_FOUND');
  if (!_aiWillingToLoanOut(player, parentTeam)) throw new Error('CLUB_WONT_LOAN');

  const userTeam = await getTeam(save.userTeamId);
  const fee = _loanFee(player);
  const wageCost = _loanWageCost(player, save);
  const totalCost = fee + wageCost;

  if ((userTeam?.budget ?? 0) < totalCost) throw new Error('INSUFFICIENT_FUNDS');

  // User pays; parent club receives loan fee
  await putTeam({ ...userTeam, budget: userTeam.budget - totalCost });
  await putTeam({ ...parentTeam, budget: (parentTeam.budget ?? 0) + fee });

  const loanedPlayer = {
    ...player,
    teamId: save.userTeamId,
    onLoan: true,
    loanedFrom: parentTeam.id,
    loanOriginalTeamId: parentTeam.id,
    loanSeason: save.season,
    loanRecallable: false, // reserved for future recall clause
    signedThisSeason: true,
  };
  await putPlayer(loanedPlayer);

  await addTransfer({
    playerId, playerName: player.name,
    fromTeamId: parentTeam.id, toTeamId: save.userTeamId,
    fee, type: 'loan_in', date: save.currentDate,
  });

  return { success: true, fee, wageCost, totalCost, parentClubName: parentTeam.name };
}

// Determines if an AI club would loan out a given player.
// Logic: only loan out genuine fringe/youth — not first-team starters.
// Future: could be extended with min-play-time clauses, etc.
function _aiWillingToLoanOut(player, parentTeam) {
  // Never loan on-loan players
  if (player.onLoan || player.loanedFrom) return false;
  // Never loan players already moved this season
  if (player.signedThisSeason) return false;
  // Primary target: young players (≤22) who need development
  const age = player.age ?? 25;
  const isYoung = age <= 22;
  const isYouth = !!player.isYouth;
  // Must not be a top-3 rated player at the club (protect key assets)
  // (Full squad check done in simulateAILoans; here we just check age/youth flags)
  if (!isYoung && !isYouth) return false;
  return true;
}

// Returns all players available for the user to loan in from AI clubs.
// Filtered to: fringe youth (age ≤22 or isYouth), not already loaned,
// parent club must be willing, and not from user's own club.
async function getLoanableInPlayers(save) {
  const allPlayers = await getAllPlayers();
  const allTeams = await getAllTeams();
  const teamById = new Map(allTeams.map(t => [t.id, t]));
  const userTeam = teamById.get(save.userTeamId);

  return allPlayers.filter(p => {
    if (p.teamId === save.userTeamId) return false;
    if (p.onLoan || p.loanedFrom) return false;
    if (p.signedThisSeason) return false;
    const parentTeam = teamById.get(p.teamId);
    if (!parentTeam) return false;
    if (!_aiWillingToLoanOut(p, parentTeam)) return false;
    // Only allow loaning from clubs with equal or higher reputation
    // (players loan down, not up — realistic)
    if ((parentTeam.reputation ?? 60) < (userTeam?.reputation ?? 60) - 5) return false;
    return true;
  });
}

// ─── AI-to-AI Loan Simulation ─────────────────────────────────
// Called each gameweek during open transfer windows (alongside simulateAITransfers).
// Each call, a random subset of lending clubs ATTEMPT one loan deal — low per-GW
// probability so the market fills gradually and the user gets a chance to browse
// before all good loan targets are gone.
//
// Activity rate: ~15% chance per lending club per GW call.
// Over a 4-GW summer window this gives each club ~50% chance of executing one deal.
//
// Future extension points:
//   save.loanCap           — per-club loan limit (not enforced in v1)
//   player.loanRecallable  — mid-season recall clause (not wired in v1)
async function simulateAILoans(save) {
  // Loans only happen during transfer windows (same gate as simulateAITransfers)
  const { open } = isTransferWindowOpen(save);
  if (!open) return [];

  const allTeams   = await getAllTeams();
  const allPlayers = await getAllPlayers();
  const userTeamId = save.userTeamId;

  // Build mutable squad maps keyed by teamId
  const squadMap = new Map();
  for (const p of allPlayers) {
    if (!squadMap.has(p.teamId)) squadMap.set(p.teamId, []);
    squadMap.get(p.teamId).push({ ...p });
  }

  const aiTeams  = allTeams.filter(t => t.id !== userTeamId);
  const budgetMap = new Map(allTeams.map(t => [t.id, t.budget ?? 0]));
  const deals    = [];

  // Lending pool: AI clubs with enough rep (≥70) and squad depth (≥20) to spare a player
  const lendingClubs = aiTeams.filter(t => {
    const squad = squadMap.get(t.id) ?? [];
    return (t.reputation ?? 60) >= 70 && squad.length >= 20;
  });

  // Shuffle so no club always acts first
  const shuffled = [...lendingClubs].sort(() => Math.random() - 0.5);

  for (const lender of shuffled) {
    // Per-GW activity gate — keeps market gradual, preserves loan targets for user
    const activityChance = 0.15;
    if (Math.random() > activityChance) continue;

    const lenderSquad = squadMap.get(lender.id) ?? [];

    // Top 11 are protected — only consider players outside the first team
    const sorted = [...lenderSquad].sort((a, b) => _fav_primaryRating(b) - _fav_primaryRating(a));
    const fringePool = sorted.slice(11).filter(p =>
      (p.age ?? 25) <= 22 &&
      !p.onLoan &&
      !p.loanedFrom &&
      !p.signedThisSeason
    );
    if (!fringePool.length) continue;

    // Pick one fringe player to loan out this GW
    const loanPlayer = fringePool[Math.floor(Math.random() * fringePool.length)];
    const totalCost  = loanTotalCost(loanPlayer, save);
    const fee        = _loanFee(loanPlayer);

    // Find a willing receiving club: lower rep, can afford, not full
    const receivers = aiTeams.filter(t => {
      if (t.id === lender.id) return false;
      const squad = squadMap.get(t.id) ?? [];
      if (squad.length >= 28) return false;
      if ((t.reputation ?? 60) >= (lender.reputation ?? 60)) return false; // must loan DOWN
      if ((budgetMap.get(t.id) ?? 0) < totalCost) return false;
      return true;
    });
    if (!receivers.length) continue;

    const receiver = receivers[Math.floor(Math.random() * receivers.length)];

    // Execute budget changes
    budgetMap.set(receiver.id, (budgetMap.get(receiver.id) ?? 0) - totalCost);
    budgetMap.set(lender.id,   (budgetMap.get(lender.id)   ?? 0) + fee);

    // Move player in squad maps
    squadMap.set(lender.id, (squadMap.get(lender.id) ?? []).filter(p => p.id !== loanPlayer.id));
    const loanedCopy = {
      ...loanPlayer,
      teamId:             receiver.id,
      onLoan:             true,
      loanedFrom:         lender.id,
      loanOriginalTeamId: lender.id,
      loanSeason:         save.season,
      loanRecallable:     false,
      signedThisSeason:   true,
    };
    (squadMap.get(receiver.id) ?? []).push(loanedCopy);
    squadMap.set(receiver.id, squadMap.get(receiver.id) ?? [loanedCopy]);

    // Update allPlayers in memory for subsequent iterations
    const pIdx = allPlayers.findIndex(p => p.id === loanPlayer.id);
    if (pIdx !== -1) allPlayers[pIdx] = loanedCopy;

    deals.push({
      playerId:     loanPlayer.id,
      playerName:   loanPlayer.name,
      fromTeamId:   lender.id,
      fromTeamName: lender.name,
      toTeamId:     receiver.id,
      toTeamName:   receiver.name,
      fee,
      date:         save.currentDate,
    });
  }

  if (!deals.length) return [];

  // Persist changed players
  const movedIds = new Set(deals.map(d => d.playerId));
  const playersToWrite = allPlayers.filter(p => movedIds.has(p.id));
  if (playersToWrite.length) await bulkPut('players', playersToWrite);

  // Persist changed budgets
  const teamsToWrite = [];
  for (const t of allTeams) {
    if (budgetMap.has(t.id) && budgetMap.get(t.id) !== t.budget) {
      teamsToWrite.push({ ...t, budget: budgetMap.get(t.id) });
    }
  }
  if (teamsToWrite.length) await bulkPut('teams', teamsToWrite);

  return deals;
}

// ─── Buy-side counter: club comes back with price after rejection ──
function generateBuyCounter(player, offerAmount) {
  const fav       = formAdjustedValue(player);
  const threshold = minimumOffer(player);

  // If offer was way too low, they don't negotiate
  if (offerAmount < threshold * 0.7) return null;

  // Club counters at somewhere between form value and 115% of form value
  const counterFee = Math.round(fav * (1.0 + Math.random() * 0.15));
  // Small chance they just won't sell at all
  if (Math.random() < 0.15) return null;

  return { fee: counterFee, playerName: player.name, playerId: player.id };
}

