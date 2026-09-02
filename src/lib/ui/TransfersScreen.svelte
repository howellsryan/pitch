<script>
  import { getAllPlayers, getAllTeams, getPlayer, getPlayersByTeam, getSave, getTeam, openDB } from '../../modules/db.js';
  import { primaryRating } from '../../modules/matchEngine.js';
  import { counterMarketDeal, isUserClubDeal, reconcileManagedClubInboundOffers, submitContractTerms } from '../../modules/transferDealActions.js';
  import {
    _loanFee, _loanWageCost, acceptMarketDeal, canClubSignPlayer, contractYearsRemaining, createUserMarketDeal, formAdjustedValue,
    getLoanableInPlayers, loanOutPlayer, playerMinRepToSign, transferWindowStatus, withdrawMarketDeal,
    setManagedPlayerTransferListing,
  } from '../../modules/transfers.js';
  import { getPotentialLabel, getPotentialStars } from '../../modules/potential.js';
  import { projectScoutedPlayerView } from '../../modules/scoutingView.js';
  import { scoutingAssignmentIsCurrent } from '../../modules/scouting.js';
  import { scoutPlayerInFull } from '../../modules/p5Runtime.js';
  import { fmt, formLabel, playerNationality, posGroup, toast } from '../../ui/helpers.js';
  import { _updateOffersBadge } from '../../ui/squad_tactics_offers.js';
  import { screenTicks } from '../state/screens.svelte.js';

  const POT_COLORS = ['', '#8a9ab0', 'var(--color-live)', '#3b82f6', 'var(--color-warn)', 'var(--color-bad)'];
  const LEAGUE_NATION = { 'Premier League': 'ENG', 'Championship': 'ENG', 'League One': 'ENG', 'League Two': 'ENG', 'La Liga': 'ESP', 'Bundesliga': 'GER', 'Serie A': 'ITA', 'Ligue 1': 'FRA', 'Eredivisie': 'NED' };
  const BUY_MSGS = { INSUFFICIENT_FUNDS: 'Not enough budget.', ALREADY_IN_SQUAD: 'Already in your squad.', REP_TOO_LOW: "Your club's reputation is too low to attract this calibre of player.", WINDOW_CLOSED: 'The transfer window is closed. You can only sign players in the summer (Aug) or winter (Jan) windows.', SIGNED_THIS_SEASON: 'This player has already transferred once this season and cannot move again until next season.' };
  const SELL_MSGS = { WINDOW_CLOSED: 'The transfer window is closed. You can only sell players in the summer (Aug) or winter (Jan) windows.', NO_BUYERS: 'No clubs could be found willing to buy this player right now.', PLAYER_NOT_IN_SQUAD: 'Player not found in your squad.', SIGNED_THIS_SEASON: 'This player joined during the current season and cannot be sold again until next season.', ALREADY_ON_LOAN: 'A player on loan cannot be transfer listed.' };
  const LOAN_IN_MSGS = { WINDOW_CLOSED: 'Transfer window is closed.', ALREADY_ON_LOAN: 'Player is already out on loan.', SIGNED_THIS_SEASON: 'Player already moved this season.', INSUFFICIENT_FUNDS: 'Not enough budget.', CLUB_WONT_LOAN: "This club won't loan out this player." };
  const LOAN_OUT_MSGS = { WINDOW_CLOSED: 'Transfer window is closed.', ALREADY_ON_LOAN: 'Already on loan.', SIGNED_THIS_SEASON: 'Already moved this season.', NO_LOAN_TAKERS: 'No clubs interested in this player right now.' };
  const TERMINAL_DEAL_STATES = new Set(['completed','rejected','withdrawn','expired','hijacked']);

  const ROW_H = 68;
  const OVERSCAN = 6;

  // Search compares folded text on both sides: the roster is full of accented
  // names (Mbappé, Håland, Özil) and nobody types the diacritic on a phone.
  function searchKey(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  let loaded = $state(false);
  let save = $state(null);
  let team = $state(null);
  let byId = $state(new Map());
  let leagues = $state([]);
  let buyTargets = $state([]);
  let squadPlayers = $state([]);
  let freeAgents = $state([]);
  let winStatus = $state({ open: true, label: '' });

  let tab = $state('deals'); // 'deals' | 'buy' | 'sell' | 'loans' | 'free'
  let loanTab = $state('in'); // 'in' | 'out'
  let loanInList = $state([]);
  let loanOutList = $state([]);

  const filters = $state({
    pos: 'ALL', league: 'ALL', sort: 'rating',
    minAge: 15, maxAge: 40, minRat: 40, maxRat: 99,
    maxPrice: 0, minPot: 0, query: '', affordable: false, canSign: false,
  });

  function projectMarketPlayer(player) {
    return projectScoutedPlayerView(player, save?.scouting, {
      season:save?.season,
      gameweek:save?.currentGameweek,
      userTeam:team,
      teamsById:byId,
      valueFor:formAdjustedValue,
    });
  }

  // A completed dedicated scout reads exactly, so its figures are shown as one
  // number rather than a range that repeats itself ("77–77").
  function scoutedRange(range, format = (value) => String(value)) {
    if (!range) return null;
    const min = range.min ?? range.feeMin ?? range.wageMin;
    const max = range.max ?? range.feeMax ?? range.wageMax;
    if (min == null) return null;
    return min === max ? format(min) : `${format(min)}–${format(max)}`;
  }

  // Every player on these surfaces is a scouting projection whose `value` is
  // already the form-adjusted fee: the public path is handed formAdjustedValue
  // as its valueFor, and p5Runtime's weekly report uses the same basis, so both
  // agree with the engine's own minimumOffer. Running formAdjustedValue over
  // that again applies the multiplier twice — visible now that a fully scouted
  // player no longer shows a corrective range beside the figure.
  function scoutedValue(player) {
    if (!player) return 0;
    return player.scoutingView ? Math.round(Number(player.value) || 0) : formAdjustedValue(player);
  }

  function abilityLabel(player) {
    return scoutedRange(player?.scoutingReport?.current) ?? String(primaryRating(player));
  }

  async function load() {
    await openDB();
    let s = await getSave();
    if (!s || s._deleted) return;
    s = await reconcileManagedClubInboundOffers(s).catch(() => s);
    save = s;
    team = await getTeam(s.userTeamId);
    const allTeams = await getAllTeams();
    byId = new Map(allTeams.map(t => [t.id, t]));
    leagues = [...new Set(allTeams.map(t => t.league || 'Premier League'))].sort();
    const allPl = await getAllPlayers();
    buyTargets = allPl.filter(p => p.teamId !== s.userTeamId && p.teamId !== 'free_agents').map(projectMarketPlayer);
    freeAgents = allPl.filter(p => p.teamId === 'free_agents').map(projectMarketPlayer);
    squadPlayers = [...(await getPlayersByTeam(s.userTeamId))].sort((a, b) => primaryRating(b) - primaryRating(a));

    // Screens remain mounted while the manager moves around the app. If a
    // dedicated report lands during a gameweek, refresh an open profile from
    // the same canonical snapshot as the lists; otherwise the completed scout
    // disappears from the pending state while the sheet keeps its old estimate.
    const openDetailId = detailFresh?.id ?? detailPlayer?.id ?? null;
    if (openDetailId != null) {
      const canonicalDetail = allPl.find(player => String(player.id) === String(openDetailId));
      if (!canonicalDetail || String(canonicalDetail.teamId) === String(s.userTeamId)) closeDetail();
      else {
        const refreshedDetail = projectMarketPlayer(canonicalDetail);
        detailPlayer = refreshedDetail;
        detailFresh = refreshedDetail;
      }
    }

    winStatus = transferWindowStatus(s);
    if (tab === 'loans') await loadLoans();
    loaded = true;
    _updateOffersBadge();
  }

  async function loadLoans() {
    if (!save) return;
    if (winStatus.open === false) { loanInList = []; loanOutList = []; return; }
    loanInList = (await getLoanableInPlayers(save)).map(projectMarketPlayer);
    loanOutList = squadPlayers.filter(p => !p.onLoan && !p.loanedFrom && !p.signedThisSeason);
  }

  $effect(() => {
    void screenTicks.transfers;
    load();
  });

  function selectTab(t) {
    tab = t;
    if (t === 'loans') loadLoans();
  }

  const FREE_AGENT_MSGS = { REP_TOO_LOW: "Your club's reputation is too low to attract this player.", NOT_A_FREE_AGENT: 'This player has already been signed.' };
  async function signFree(p) {
    try {
      await createUserMarketDeal(p.id, { type:'free_agent', terms:{ contract:{ wage:Math.round((p.wage ?? 10_000) * 1.08), duration:3, squadRole:'rotation' } } });
      toast(`Contract talks opened with ${p.name}`, 'success', 3000);
      screenTicks.transfers++;
    } catch (e) {
      toast(FREE_AGENT_MSGS[e.message] || 'Could not sign this player.', 'error', 2800);
    }
  }

  // ── Buy list: filter, sort, virtualize ─────────────────────
  const leagueByTeam = $derived(new Map([...byId.values()].map(t => [t.id, t.league || 'Premier League'])));
  const userRep = $derived(team?.reputation ?? 60);
  const budget = $derived(team?.budget ?? 0);
  // Mirrors gameweek.js's payWeeklyWages: loaned-in players don't count
  // here since their wages were already prepaid in full at signing.
  const weeklyWageBill = $derived(squadPlayers.filter(p => !p.onLoan).reduce((sum, p) => sum + (p.wage ?? 0), 0));

  const filteredBuyList = $derived.by(() => {
    const f = filters;
    let fil = buyTargets;
    if (f.pos !== 'ALL') fil = fil.filter(p => posGroup(p.position) === f.pos);
    if (f.league !== 'ALL') fil = fil.filter(p => leagueByTeam.get(p.teamId) === f.league);
    fil = fil.filter(p => (p.age || 25) >= f.minAge && (p.age || 25) <= f.maxAge);
    fil = fil.filter(p => primaryRating(p) >= f.minRat && primaryRating(p) <= f.maxRat);
    if (f.maxPrice > 0) fil = fil.filter(p => scoutedValue(p) <= f.maxPrice);
    if (f.affordable) fil = fil.filter(p => Math.floor(scoutedValue(p) * 0.88) <= budget);
    if (f.canSign) fil = fil.filter(p => canClubSignPlayer({ reputation: userRep }, p));
    if (f.minPot > 0) fil = fil.filter(p => getPotentialStars(p) >= f.minPot);
    const q = searchKey(f.query).trim();
    if (q) fil = fil.filter(p => searchKey(p.name).includes(q) || searchKey(byId.get(p.teamId)?.name).includes(q));

    const sortFns = {
      rating: (a, b) => primaryRating(b) - primaryRating(a),
      value: (a, b) => scoutedValue(b) - scoutedValue(a),
      age: (a, b) => (a.age || 25) - (b.age || 25),
      potential: (a, b) => getPotentialStars(b) - getPotentialStars(a),
      goals: (a, b) => (b.goals || 0) - (a.goals || 0),
      assists: (a, b) => (b.assists || 0) - (a.assists || 0),
    };
    return [...fil].sort(sortFns[f.sort] || sortFns.rating);
  });

  function resetFilters() {
    Object.assign(filters, { pos: 'ALL', league: 'ALL', sort: 'rating', minAge: 15, maxAge: 40, minRat: 40, maxRat: 99, maxPrice: 0, minPot: 0, query: '', affordable: false, canSign: false });
  }

  // Virtualized scroll window over filteredBuyList.
  let buyScrollTop = $state(0);
  let buyContainerH = $state(600);
  const buyStart = $derived(Math.max(0, Math.floor(buyScrollTop / ROW_H) - OVERSCAN));
  const buyEnd = $derived(Math.min(filteredBuyList.length, Math.ceil((buyScrollTop + buyContainerH) / ROW_H) + OVERSCAN));
  const buyVisible = $derived(filteredBuyList.slice(buyStart, buyEnd).map((p, i) => ({ p, top: (buyStart + i) * ROW_H })));
  const buyTotalHeight = $derived(filteredBuyList.length * ROW_H);

  function onBuyScroll(e) { buyScrollTop = e.currentTarget.scrollTop; }

  function repInfo(p) {
    const minRep = playerMinRepToSign(p);
    const adjMin = p.transferListed ? Math.max(0, minRep - 4) : minRep;
    return { adjMin, blocked: adjMin > 0 && userRep < adjMin };
  }

  // ── Player detail sheet ─────────────────────────────────────
  let detailPlayer = $state(null);
  let detailFresh = $state(null); // projected fresh copy, canonical row stays in DB
  let offerAmount = $state(0);
  let offerInstallment = $state(0);
  let offerSellOn = $state(0);

  async function openDetail(p) {
    detailPlayer = p;
    const canonical = await getPlayer(p.id) ?? p;
    detailFresh = projectMarketPlayer(canonical);
    const fv = scoutedValue(detailFresh);
    offerAmount = Math.floor(fv * 0.95);
    offerInstallment = 0;
    offerSellOn = 0;
  }
  function closeDetail() { detailPlayer = null; detailFresh = null; }

  // ── Dedicated scout ─────────────────────────────────────────
  // One gameweek out, then an exact reading for the rest of this season.
  let scoutBusy = $state(false);
  const SCOUT_MSGS = {
    SCOUTING_ASSIGNMENT_CAP: 'All of your scouts are already out on assignment. Clear one from the Scouting drawer first.',
    SCOUTING_ALREADY_ASSIGNED: 'A scout is already watching this player.',
  };
  const detailScoutState = $derived.by(() => {
    if (!detailFresh) return { state: 'idle' };
    if (detailFresh.scoutingReport?.exact) return { state: 'complete' };
    // Only a scout from this season is still in the field; advanceScoutingState
    // retires the rest, so matching one of those would hide the button forever
    // waiting on a report that can never land.
    const assignments = save?.scouting?.assignments ?? [];
    const pending = assignments.find(item =>
      item.mode === 'full'
      && String(item.playerId) === String(detailFresh.id)
      && item.status === 'active'
      && scoutingAssignmentIsCurrent(item, save?.season));
    return pending ? { state: 'pending' } : { state: 'idle' };
  });

  async function scoutDetailPlayer() {
    if (scoutBusy || !detailFresh) return;
    scoutBusy = true;
    try {
      await scoutPlayerInFull(detailFresh.id, `${detailFresh.name} report`);
      toast(`Scout assigned to ${detailFresh.name}. Full report after the next gameweek.`, 'success', 3600);
      screenTicks.transfers++;
    } catch (error) {
      toast(SCOUT_MSGS[error.message] || 'Could not assign a scout to this player.', 'error', 3200);
    } finally {
      scoutBusy = false;
    }
  }

  // The offer controls stay on the scouted estimate. Pricing them off the
  // canonical row would hand every player's true valuation to the manager and
  // make the dedicated scout pointless — the fog is the feature. The engine's
  // real floor tracks live form, so a scouted offer can still be rejected; the
  // hint below says so rather than promising acceptance.
  const detailScoutedFv = $derived(scoutedValue(detailFresh));
  const detailFv = $derived(detailScoutedFv);
  const detailMinOffer = $derived(Math.floor(detailFv * 0.88));
  const detailIsCollapsed = $derived(detailFresh ? (save?.collapsedDeals || []).includes(detailFresh.id) : false);
  const detailSeasonLocked = $derived(!!detailFresh?.signedThisSeason);
  const detailRep = $derived(detailFresh ? repInfo(detailFresh) : { adjMin: 0, blocked: false });
  const offerLikelihood = $derived.by(() => {
    if (offerAmount >= detailFv) return { text: 'Above scouting estimate — strong opening offer', cls: 'good' };
    if (offerAmount >= detailMinOffer) return { text: 'Within scouting estimate — the club may still hold out', cls: 'good' };
    if (offerAmount >= detailMinOffer * 0.88) return { text: 'May be rejected or countered', cls: 'warn' };
    return { text: 'Likely below the seller’s expectations', cls: 'bad' };
  });

  // ── Offer confirm / counter-offer flow ──────────────────────
  let confirmOffer = $state(null); // { player, offer }

  function openConfirmOffer() {
    confirmOffer = { player: detailFresh, offer: offerAmount };
  }
  function closeConfirmOffer() { confirmOffer = null; }

  async function sendOffer() {
    const { player, offer } = confirmOffer;
    try {
      await createUserMarketDeal(player.id, { type:'transfer', terms:{ fee:{ upfront:offer, installments:offerInstallment > 0 ? [{ amount:offerInstallment, dueSeason:save.season, dueGameweek:(save.currentGameweek ?? 1) + 8 }]:[], sellOnPercentage:offerSellOn } } });
      toast(`Enquiry sent for ${player.name}. The club will respond at the next market update.`, 'success', 5000);
      confirmOffer = null;
      closeDetail();
      screenTicks.transfers++;
      load();
    } catch (err) {
      toast(BUY_MSGS[err.message] || err.message, 'error', 6000);
    }
  }


  // ── Sell tab ─────────────────────────────────────────────────
  let sellConfirm = $state(null); // { player, est }
  let sellBusy = $state(false);

  function openSellConfirm(p) {
    const fv = scoutedValue(p);
    const est = Math.round(fv * (0.92 + Math.random() * 0.2));
    sellConfirm = { player: p, est, fv };
  }
  function closeSellConfirm() { if (!sellBusy) sellConfirm = null; }

  async function confirmSell() {
    const { player } = sellConfirm;
    sellBusy = true;
    try {
      await setManagedPlayerTransferListing(player.id, true);
      toast(`${player.name} is transfer listed. Interested clubs can now submit staged bids.`, 'success', 5000);
      sellConfirm = null;
      screenTicks.squad++;
      load();
    } catch (err) {
      toast(SELL_MSGS[err.message] || err.message, 'error', 5000);
    } finally {
      sellBusy = false;
    }
  }

  // ── Loan tabs ────────────────────────────────────────────────
  let loanDetail = $state(null); // { mode: 'in'|'out', player }
  let loanBusy = $state(false);

  function loanCost(p) {
    const fee = _loanFee(p);
    const wageCost = _loanWageCost(p, save);
    return { fee, wageCost, total: fee + wageCost };
  }

  function openLoanDetail(mode, p) { loanDetail = { mode, player: p }; }
  function closeLoanDetail() { if (!loanBusy) loanDetail = null; }

  async function confirmLoanIn() {
    const { player } = loanDetail;
    loanBusy = true;
    try {
      const cost = loanCost(player);
      await createUserMarketDeal(player.id, { type:'loan', terms:{ loan:{ fee:cost.fee, wageContributionPercentage:100, recall:false, optionToBuy:Math.round(scoutedValue(player) * .9) }, contract:{ wage:player.wage ?? 10_000, duration:1, squadRole:'rotation' } } });
      toast(`Loan enquiry sent for ${player.name}`, 'success', 5000);
      loanDetail = null;
      screenTicks.transfers++;
      load();
    } catch (err) {
      toast(LOAN_IN_MSGS[err.message] || err.message, 'error', 5000);
    } finally {
      loanBusy = false;
    }
  }

  async function confirmLoanOut() {
    const { player } = loanDetail;
    loanBusy = true;
    try {
      const res = await loanOutPlayer(player.id);
      toast(`${player.name} loaned to ${res.loanClubName}! +${fmt.money(res.totalCost)} received.`, 'success', 5000);
      loanDetail = null;
      screenTicks.transfers++;
      load();
    } catch (err) {
      toast(LOAN_OUT_MSGS[err.message] || err.message, 'error', 5000);
    } finally {
      loanBusy = false;
    }
  }

  function fitnessColor(fit) {
    return fit >= 75 ? 'var(--color-live)' : fit >= 50 ? 'var(--color-warn)' : 'var(--color-bad)';
  }

  const activeDeals = $derived((save?.transferMarket?.activeDeals ?? []).filter(deal => isUserClubDeal(deal, save?.userTeamId) && !TERMINAL_DEAL_STATES.has(deal.state)));
  const dealHistory = $derived([...(save?.transferMarket?.terminalSummaries ?? []), ...(save?.transferMarket?.activeDeals ?? []).filter(deal => TERMINAL_DEAL_STATES.has(deal.state))].filter(deal => isUserClubDeal(deal, save?.userTeamId)).slice(-30).reverse());
  const stageLabel = state => ({ interest:'Interest', seller_terms:'Seller terms', club_negotiation:'Club negotiation', player_negotiation:'Player negotiation', agreed:'Agreed', completed:'Completed', rejected:'Rejected', withdrawn:'Withdrawn', expired:'Expired', hijacked:'Hijacked' })[state] ?? state;
  let counterDeal = $state(null);
  let counterAmount = $state(0);
  let counterBusy = $state(false);
  let contractSheet = $state(null); // { player, deal }
  let contractWage = $state(10_000);
  let contractDuration = $state(3);
  let contractRole = $state('rotation');
  let contractSigningBonus = $state(0);
  let contractReleaseClause = $state(0);
  let contractBusy = $state(false);

  async function acceptDeal(deal) {
    try {
      const result = await acceptMarketDeal(deal.id);
      screenTicks.transfers++;
      await load();
      if (result?.state === 'player_negotiation' && result.awaiting === 'user' && String(result.buyerTeamId) === String(save?.userTeamId)) {
        toast(`${deal.playerName}: fee agreed. Now negotiate the player's contract.`, 'success', 4000);
        await openContractDeal(result);
      } else toast(`${deal.playerName}: terms accepted`, 'success', 3200);
    }
    catch (error) { toast(error.message, 'error', 3500); }
  }
  function openCounterDeal(deal) {
    counterDeal = deal;
    counterAmount = Math.max(100_000, deal.terms?.fee?.upfront ?? 0);
  }
  function closeCounterDeal() { if (!counterBusy) counterDeal = null; }
  async function submitCounterDeal() {
    if (!counterDeal) return;
    counterBusy = true;
    try {
      const result = await counterMarketDeal(counterDeal.id, counterAmount);
      const lastReason = result.decisionLog?.at(-1)?.reasonCode;
      const buyerName = byId.get(result.buyerTeamId)?.name || 'The buying club';
      const message = lastReason === 'buyer_counter'
        ? `${result.playerName}: ${buyerName} countered at ${fmt.money(result.terms.fee.upfront)}.`
        : lastReason === 'buyer_accepts_counter'
          ? `${result.playerName}: your counter was accepted.`
          : lastReason === 'buyer_walks_away'
            ? `${result.playerName}: ${buyerName} walked away.`
            : `${result.playerName}: counter offer sent.`;
      toast(message, lastReason === 'buyer_walks_away' ? 'error' : 'success', 4000);
      counterDeal = null;
      screenTicks.transfers++;
      await load();
    } catch (error) {
      const message = error.message === 'INSUFFICIENT_FUNDS' ? 'That counter is above your available transfer budget.' : error.message;
      toast(message, 'error', 3500);
    } finally {
      counterBusy = false;
    }
  }

  function isInitialContractStep(deal) {
    if (!deal || deal.state !== 'player_negotiation' || deal.awaiting !== 'user') return false;
    return ['seller_accepts','release_clause_met','club_terms_accepted'].includes(deal.decisionLog?.at(-1)?.reasonCode);
  }

  function fillContractSheet(player, deal = null) {
    const terms = deal && !isInitialContractStep(deal) ? deal.terms?.contract ?? {} : {};
    contractSheet = { player, deal };
    contractWage = Math.max(1_000, terms.wage ?? Math.round((player.wage ?? 10_000) * 1.1));
    contractDuration = terms.duration ?? 3;
    contractRole = terms.squadRole ?? player.squadRole ?? 'rotation';
    contractSigningBonus = terms.signingBonus ?? Math.round((player.wage ?? 10_000) * 4);
    contractReleaseClause = terms.releaseClause ?? 0;
  }

  async function openContractDeal(deal) {
    const player = await getPlayer(deal.playerId);
    if (!player) { toast('Player not found.', 'error', 3000); return; }
    fillContractSheet(player, deal);
  }

  function openRenewal(p) {
    const existing = activeDeals.find(deal => deal.type === 'renewal' && deal.playerId === String(p.id));
    if (existing) {
      if (existing.awaiting === 'user') void openContractDeal(existing);
      else {
        tab = 'deals';
        toast(`${p.name}: waiting for the player's response.`, 'info', 3000);
      }
      return;
    }
    fillContractSheet(p, null);
  }

  function closeContractSheet() { if (!contractBusy) contractSheet = null; }

  async function submitContractOffer() {
    if (!contractSheet) return;
    contractBusy = true;
    try {
      const result = await submitContractTerms({
        playerId:contractSheet.player.id,
        dealId:contractSheet.deal?.id ?? null,
        contract:{
          wage:contractWage,
          duration:contractDuration,
          squadRole:contractRole,
          signingBonus:contractSigningBonus,
          releaseClause:contractReleaseClause,
        },
      });
      const deal = result.deal;
      screenTicks.transfers++;
      await load();
      if (result.settlement?.success || deal.state === 'agreed') {
        toast(`${deal.playerName}: contract agreed.`, 'success', 4000);
        contractSheet = null;
      } else if (deal.state === 'rejected') {
        toast(`${deal.playerName} rejected the contract offer. ${deal.interest?.strongestConcern ?? ''}`.trim(), 'error', 5000);
        contractSheet = null;
      } else if (deal.awaiting === 'user') {
        const player = await getPlayer(deal.playerId) ?? contractSheet.player;
        fillContractSheet(player, deal);
        toast(`${deal.playerName} has countered your contract offer.`, 'info', 4000);
      } else {
        toast(`${deal.playerName}: revised contract terms sent.`, 'success', 3200);
        contractSheet = null;
      }
    } catch (error) {
      const message = error.message === 'INSUFFICIENT_FUNDS' ? 'The signing bonus is above your available transfer budget.' : error.message;
      toast(message, 'error', 3500);
    } finally {
      contractBusy = false;
    }
  }

  async function withdrawDeal(deal) {
    try { await withdrawMarketDeal(deal.id); toast(`${deal.playerName}: negotiation withdrawn`, 'success', 2600); screenTicks.transfers++; }
    catch (error) { toast(error.message, 'error', 3500); }
  }
</script>

<div class="transfers-screen">
  <div class="tr-hdr">
    <div>
      <div class="tr-eyebrow">Transfer Market</div>
      <div class="tr-title">Transfers</div>
    </div>
    {#if team}
      <div class="tr-budget">
        <span class="tr-budget-lbl">Budget</span><span class="tr-budget-val">{fmt.money(team.budget)}</span>
        <span class="tr-wage-lbl">Wages / wk: {fmt.money(weeklyWageBill)}</span>
      </div>
    {/if}
  </div>

  {#if loaded && !winStatus.open}
    <div class="tr-window-banner">{winStatus.label}</div>
  {/if}

  {#if !loaded}
    <div class="tr-empty">Loading…</div>
  {:else}
    <div class="tr-tabs">
      <button class="tr-tab {tab === 'deals' ? 'on' : ''}" onclick={() => selectTab('deals')}>Deals{#if activeDeals.length}<span class="offers-badge">{activeDeals.length}</span>{/if}</button>
      <button class="tr-tab {tab === 'buy' ? 'on' : ''}" onclick={() => selectTab('buy')}>Buy</button>
      <button class="tr-tab {tab === 'sell' ? 'on' : ''}" onclick={() => selectTab('sell')}>Sell</button>
      <button class="tr-tab {tab === 'loans' ? 'on' : ''}" onclick={() => selectTab('loans')}>Loans</button>
      <button class="tr-tab {tab === 'contracts' ? 'on' : ''}" onclick={() => selectTab('contracts')}>Contracts</button>
      <button class="tr-tab {tab === 'free' ? 'on' : ''}" onclick={() => selectTab('free')}>Free Agents{#if freeAgents.length}<span class="offers-badge">{freeAgents.length}</span>{/if}</button>
    </div>

    {#if tab === 'deals'}
      <div class="tr-panel">
        <div class="tr-panel-title">Active Negotiations &amp; Offers</div>
        {#if !activeDeals.length}
          <div class="tr-empty-inline">No active deals.<br><span>Open an enquiry from Buy, list a player from Sell, or start contract talks from Contracts.</span></div>
        {:else}
          <div class="sell-scroll">
            {#each activeDeals as deal (deal.id)}
              <div class="sell-row deal-row">
                <div class="pl-flag-sm">{deal.userSide === 'seller' && deal.type === 'transfer' ? 'OF' : deal.type === 'loan' ? 'LN' : deal.type === 'renewal' ? 'CT' : 'TR'}</div>
                <div class="pl-info">
                  <div class="pl-name">{deal.playerName || deal.playerId}</div>
                  <div class="pl-meta">
                    <span class="pl-tag">{stageLabel(deal.state)}</span>
                    {#if deal.userSide === 'seller' && deal.type === 'transfer'}<span class="pl-tag">Offer from {byId.get(deal.buyerTeamId)?.shortName || byId.get(deal.buyerTeamId)?.name || deal.buyerTeamId}</span>{/if}
                    <span>{deal.awaiting === 'user' ? 'Your decision' : `Awaiting ${deal.awaiting || 'completion'}`}</span>
                    {#if deal.state === 'player_negotiation'}<span>{fmt.wage(deal.terms?.contract?.wage)} · {deal.terms?.contract?.duration ?? 3}y · {deal.terms?.contract?.squadRole ?? 'rotation'}</span>{/if}
                    {#if deal.competingOffers?.length}<span>{deal.competingOffers.length} rival bid{deal.competingOffers.length === 1 ? '' : 's'}</span>{/if}
                  </div>
                  {#if deal.interest?.strongestConcern}<div class="pl-meta">Concern: {deal.interest.strongestConcern}</div>{/if}
                </div>
                <div class="pl-right">
                  <div class="pl-val">
                    {deal.type === 'renewal' || deal.type === 'free_agent' ? fmt.wage(deal.terms?.contract?.wage) : fmt.money(deal.type === 'loan' ? deal.terms.loan.fee : deal.terms.fee.upfront)}
                  </div>
                </div>
                <div class="deal-actions">
                  {#if deal.awaiting === 'user'}
                    {#if deal.state === 'player_negotiation' && String(deal.buyerTeamId) === String(save?.userTeamId)}
                      {@const playerHasCountered = ['player_counter','player_contract_counter'].includes(deal.decisionLog?.at(-1)?.reasonCode)}
                      {#if playerHasCountered}<button class="sell-btn" onclick={() => acceptDeal(deal)}>Accept</button>{/if}
                      <button class="sell-btn btn-secondary" onclick={() => openContractDeal(deal)}>{playerHasCountered ? 'Counter Terms' : 'Negotiate Contract'}</button>
                    {:else}
                      <button class="sell-btn" onclick={() => acceptDeal(deal)}>Accept</button>
                    {/if}
                    {#if deal.state === 'club_negotiation' && deal.type === 'transfer'}
                      <button class="sell-btn btn-secondary" onclick={() => openCounterDeal(deal)}>Counter</button>
                    {/if}
                  {/if}
                  <button class="sell-btn btn-secondary" onclick={() => withdrawDeal(deal)}>Walk away</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
        <div class="tr-panel-title" style="margin-top:18px">Recent Market History</div>
        {#if !dealHistory.length}<div class="tr-empty-inline">Completed and collapsed negotiations will appear here.</div>{:else}
          <div class="sell-scroll">
            {#each dealHistory as deal (deal.id)}
              <div class="sell-row"><div class="pl-info"><div class="pl-name">{deal.playerName || deal.playerId}</div><div class="pl-meta"><span class="pl-tag">{stageLabel(deal.state)}</span><span>{deal.reasonCode || deal.type}</span></div></div><div class="pl-val">{fmt.money(deal.total ?? deal.terms?.fee?.upfront ?? 0)}</div></div>
            {/each}
          </div>
        {/if}
      </div>
    {:else if tab === 'buy'}
      <div class="tr-panel">
        <div class="tr-search-row">
          <input class="tr-search" type="text" placeholder="Search name or club…" bind:value={filters.query} />
          <span class="tr-count">{filteredBuyList.length} player{filteredBuyList.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="ftabs">
          {#each ['ALL', 'ATT', 'MID', 'DEF', 'GK'] as p (p)}
            <button class="ftab {filters.pos === p ? 'on' : ''}" onclick={() => filters.pos = p}>{p === 'ALL' ? 'All' : p}</button>
          {/each}
        </div>

        <details class="tr-adv">
          <summary>Filters &amp; sort</summary>
          <div class="tr-adv-body">
            <div class="tr-adv-row">
              <select bind:value={filters.sort}>
                <option value="rating">Scouted ability</option>
                <option value="value">Estimated value</option>
                <option value="age">Age</option>
                <option value="potential">Scouted future</option>
                <option value="goals">Goals</option>
                <option value="assists">Assists</option>
              </select>
              <select bind:value={filters.league}>
                <option value="ALL">All Leagues</option>
                {#each leagues as l (l)}<option value={l}>{l}</option>{/each}
              </select>
            </div>
            <div class="tr-adv-grid">
              <div>
                <div class="tr-adv-lbl"><span>Age</span><span>{filters.minAge}–{filters.maxAge}</span></div>
                <div class="tr-adv-sliders">
                  <input type="range" min="15" max="40" bind:value={filters.minAge} />
                  <input type="range" min="15" max="40" bind:value={filters.maxAge} />
                </div>
              </div>
              <div>
                <div class="tr-adv-lbl"><span>Scouted ability</span><span>{filters.minRat}–{filters.maxRat}</span></div>
                <div class="tr-adv-sliders">
                  <input type="range" min="40" max="99" bind:value={filters.minRat} />
                  <input type="range" min="40" max="99" bind:value={filters.maxRat} />
                </div>
              </div>
            </div>
            <div>
              <div class="tr-adv-lbl"><span>Max Est. Price</span><span>{filters.maxPrice > 0 ? fmt.money(filters.maxPrice) : 'No limit'}</span></div>
              <input type="range" min="0" max="300000000" step="500000" bind:value={filters.maxPrice} style="width:100%" />
            </div>
            <div class="tr-adv-row">
              <span class="tr-adv-lbl-inline">Min Scouted Pot</span>
              <div class="tr-pot-stars">
                {#each [1, 2, 3, 4, 5] as n (n)}
                  <button class="ftab tr-pot-btn {n <= filters.minPot ? 'on' : ''}" onclick={() => filters.minPot = filters.minPot === n ? 0 : n}>{'★'.repeat(n)}</button>
                {/each}
              </div>
            </div>
            <div class="tr-adv-row">
              <button class="ftab {filters.affordable ? 'on' : ''}" onclick={() => filters.affordable = !filters.affordable}>Probably affordable</button>
              <button id="tr-can-sign" class="ftab {filters.canSign ? 'on' : ''}" onclick={() => filters.canSign = !filters.canSign}>Likely signable</button>
              <button class="ftab tr-reset" onclick={resetFilters}>Reset</button>
            </div>
          </div>
        </details>

        <div class="buy-scroll" bind:clientHeight={buyContainerH} onscroll={onBuyScroll}>
          {#if !filteredBuyList.length}
            <div class="tr-empty-inline">No players match your filters.<br><span>Try adjusting the filters above.</span></div>
          {:else}
            <div class="buy-spacer" style="height:{buyTotalHeight}px">
              {#each buyVisible as { p, top } (p.id)}
                {@const g = posGroup(p.position)}
                {@const teamRec = byId.get(p.teamId)}
                {@const fv = scoutedValue(p)}
                {@const potStars = getPotentialStars(p)}
                {@const rep = repInfo(p)}
                {@const seasonLocked = !!p.signedThisSeason}
                <div
                  class="buy-row" style="top:{top}px" role="button" tabindex="0"
                  onclick={() => openDetail(p)}
                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(p); } }}
                >
                  <div class="pl-flag">{playerNationality(p, teamRec?.league)}</div>
                  <div class="pl-info">
                    <div class="pl-name">
                      {p.name}
                      {#if seasonLocked}<span class="lock-badge" title="Already transferred this season">TR</span>{:else if rep.blocked}<span class="lock-badge" title="Scouting suggests rep {rep.adjMin}+ required">REP</span>{/if}
                    </div>
                    <div class="pl-meta">
                      <span class="pos-badge pos-{g}">{p.position}</span>
                      <span class="pl-tag">{teamRec?.shortName || (teamRec?.name || '').slice(0, 3).toUpperCase()}</span>
                      <span class="pl-tag">{LEAGUE_NATION[teamRec?.league] || 'INT'}</span>
                      <span>Age {p.age}</span>
                      {#if potStars}<span style="color:{POT_COLORS[potStars]}">{'★'.repeat(potStars)}</span>{/if}
                    </div>
                  </div>
                  <div class="pl-right">
                    <div class="pl-val">~{fmt.money(fv)}</div>
                    <div class="pl-rat range-rating">{abilityLabel(p)}</div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {:else if tab === 'sell'}
      <div class="tr-panel">
        <div class="tr-panel-title">Your Squad</div>
        <div class="sell-scroll">
          {#each squadPlayers as p (p.id)}
            {@const g = posGroup(p.position)}
            {@const r = primaryRating(p)}
            {@const fv = scoutedValue(p)}
            {@const isListed = p.transferListed === true}
            <div class="sell-row">
              <div class="pl-flag-sm pos-{g}">{g}</div>
              <div class="pl-info">
                <div class="pl-name">{p.name}{#if isListed}<span class="sq-listed-badge">TL</span>{/if}</div>
                <div class="pl-meta"><span class="pos-badge pos-{g}">{p.position}</span><span>Age {p.age}</span></div>
              </div>
              <div class="pl-val">{fmt.money(fv)}</div>
              <div class="pl-rat">{r}</div>
              <button class="sell-btn" disabled={!winStatus.open} onclick={() => openSellConfirm(p)}>List</button>
            </div>
          {/each}
        </div>
      </div>
    {:else if tab === 'contracts'}
      <div class="tr-panel">
        <div class="tr-panel-title">Squad Contracts</div>
        <div class="sell-scroll">
          {#each [...squadPlayers].sort((a, b) => contractYearsRemaining(a, save) - contractYearsRemaining(b, save)) as p (p.id)}
            {@const years = contractYearsRemaining(p, save)}
            {@const renewal = activeDeals.find(deal => deal.type === 'renewal' && deal.playerId === String(p.id))}
            <div class="sell-row">
              <div class="pl-flag-sm">CT</div>
              <div class="pl-info"><div class="pl-name">{p.name}</div><div class="pl-meta"><span>{years} year{years === 1 ? '' : 's'} remaining</span><span>{fmt.wage(p.wage)}</span><span>{p.squadRole ?? 'rotation'}</span>{#if renewal}<span class="pl-tag">{renewal.awaiting === 'user' ? 'Counter received' : 'Negotiating'}</span>{/if}</div></div>
              <button class="sell-btn" disabled={p.onLoan} onclick={() => openRenewal(p)}>{renewal?.awaiting === 'user' ? 'Review' : renewal ? 'View' : 'Negotiate'}</button>
            </div>
          {/each}
        </div>
      </div>
    {:else if tab === 'loans'}
      <div class="tr-panel">
        <div class="tr-panel-title">Loan Market</div>
        <div class="ftabs">
          <button class="ftab {loanTab === 'in' ? 'on' : ''}" onclick={() => loanTab = 'in'}>Loan In</button>
          <button class="ftab {loanTab === 'out' ? 'on' : ''}" onclick={() => loanTab = 'out'}>Loan Out</button>
        </div>
        {#if !winStatus.open}
          <div class="tr-empty-inline">Loan market closed — loans can only be arranged during transfer windows</div>
        {:else if loanTab === 'in'}
          {#if !loanInList.length}
            <div class="tr-empty-inline">No loan players available right now.<br><span>Check back after the next gameweek as clubs release their fringe youth.</span></div>
          {:else}
            <div class="sell-scroll">
              {#each [...loanInList].sort((a, b) => (b.age <= 22 ? 1 : 0) - (a.age <= 22 ? 1 : 0) || (b.potentialRating ?? 70) - (a.potentialRating ?? 70)) as p (p.id)}
                {@const g = posGroup(p.position)}
                {@const cost = loanCost(p)}
                {@const canAfford = budget >= cost.total}
                {@const parentTeam = byId.get(p.teamId)}
                <div
                  class="sell-row {canAfford ? '' : 'is-locked'}" role="button" tabindex="0"
                  onclick={() => openLoanDetail('in', p)}
                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLoanDetail('in', p); } }}
                >
                  <div class="pl-flag-sm pos-{g}">{g}</div>
                  <div class="pl-info">
                    <div class="pl-name">{p.name}</div>
                    <div class="pl-meta"><span class="pos-badge pos-{g}">{p.position}</span><span class="pl-tag">{parentTeam?.shortName || ''}</span><span>Age {p.age}</span></div>
                  </div>
                  <div class="pl-right">
                    <div class="pl-val" style="color:{canAfford ? 'var(--color-live)' : 'var(--color-bad)'}">~{fmt.money(cost.total)}</div>
                    <div class="pl-rat range-rating">{abilityLabel(p)}</div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {:else if !loanOutList.length}
          <div class="tr-empty-inline">No players available to loan out.</div>
        {:else}
          <div class="sell-scroll">
            {#each [...loanOutList].sort((a, b) => primaryRating(b) - primaryRating(a)) as p (p.id)}
              {@const g = posGroup(p.position)}
              {@const r = primaryRating(p)}
              {@const cost = loanCost(p)}
              <div
                class="sell-row" role="button" tabindex="0"
                onclick={() => openLoanDetail('out', p)}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLoanDetail('out', p); } }}
              >
                <div class="pl-flag-sm pos-{g}">{g}</div>
                <div class="pl-info">
                  <div class="pl-name">{p.name}</div>
                  <div class="pl-meta"><span class="pos-badge pos-{g}">{p.position}</span><span>Age {p.age}</span><span>{fmt.wage(p.wage)}/wk</span></div>
                </div>
                <div class="pl-right">
                  <div class="pl-val" style="color:var(--color-live)">+{fmt.money(cost.total)}</div>
                  <div class="pl-rat">{r}</div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="tr-panel">
        <div class="tr-panel-title">Free Agents</div>
        {#if !freeAgents.length}
          <div class="tr-empty-inline">No free agents on the market right now.<br><span>Players who leave a club at the end of their contract show up here.</span></div>
        {:else}
          <div class="sell-scroll">
            {#each [...freeAgents].sort((a, b) => primaryRating(b) - primaryRating(a)) as p (p.id)}
              {@const g = posGroup(p.position)}
              {@const blocked = !canClubSignPlayer(team, p)}
              <div class="sell-row {blocked ? 'is-locked' : ''}">
                <div class="pl-flag-sm pos-{g}">{g}</div>
                <div class="pl-info">
                  <div class="pl-name">{p.name}</div>
                  <div class="pl-meta"><span class="pos-badge pos-{g}">{p.position}</span><span>Age {p.age}</span><span>~{fmt.wage(p.wage)}/wk</span></div>
                </div>
                <div class="pl-val range-rating">{abilityLabel(p)}</div>
                <button class="sell-btn" disabled={blocked} title={blocked ? "Scouting suggests your club's reputation may be too low" : ''} onclick={() => signFree(p)}>Sign</button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<!-- ── Player detail sheet (Buy) ────────────────────────────── -->
{#if detailPlayer && detailFresh}
  {@const p = detailFresh}
  {@const g = posGroup(p.position)}
  {@const r = primaryRating(p)}
  {@const teamRec = byId.get(p.teamId)}
  {@const fl = formLabel(p)}
  {@const potStars = getPotentialStars(p)}
  {@const potLabel = getPotentialLabel(p)}
  {@const report = p.scoutingReport}
  {@const approx = report?.exact ? '' : '~'}
  <button class="sheet-backdrop" onclick={closeDetail} aria-label="Close"></button>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div class="det-hero">
      <div class="det-rating" style="color:{r >= 80 ? 'var(--color-live)' : 'var(--color-club)'}">{abilityLabel(p)}</div>
      <div class="det-flag">{playerNationality(p, teamRec?.league)}</div>
      <div class="det-name">{p.name}</div>
      {#if p.isWonderkid}<div class="det-wk">HIGH UPSIDE</div>{/if}
      <div class="det-meta"><span class="pl-tag">{teamRec?.shortName || ''}</span><span>{teamRec?.name || ''}</span><span class="pos-badge pos-{g}">{p.position}</span><span>Age {p.age}</span></div>
      <div class="det-badges">
        <span class="form-badge form-{fl.cls}">{fl.text}</span>
        <span style="color:{fitnessColor(p.fitness ?? 100)}">{Math.round(p.fitness ?? 100)}% fit</span>
        {#if report}<span>{report.exact ? 'Fully scouted' : `${report.confidenceLabel} confidence`}</span>{/if}
      </div>
    </div>

    <div class="det-scout">
      {#if detailScoutState.state === 'complete'}
        <div class="det-scout-copy"><strong>Fully scouted</strong><small>Exact ability, potential and valuation until the end of {save?.season ?? 'this season'}.</small></div>
      {:else if detailScoutState.state === 'pending'}
        <div class="det-scout-copy"><strong>Scout on assignment</strong><small>The full report lands after the next completed gameweek.</small></div>
      {:else}
        <div class="det-scout-copy"><strong>Everything here is an estimate</strong><small>Send a scout for one gameweek to see this player exactly, for the rest of the season.</small></div>
        <button class="sell-btn det-scout-btn" disabled={scoutBusy} onclick={scoutDetailPlayer}>{scoutBusy ? 'Sending…' : 'Send scout'}</button>
      {/if}
    </div>

    <div class="det-pot">
      <div class="det-pot-top"><span>{report?.exact ? 'Potential' : 'Scouted future'}</span><span style="color:{POT_COLORS[potStars]}">{scoutedRange(report?.future) ?? potLabel}</span></div>
      <div class="det-pot-bar-row">
        <span style="color:{POT_COLORS[potStars]}">{'★'.repeat(potStars)}{'☆'.repeat(5 - potStars)}</span>
        <div class="det-pot-track"><div class="det-pot-fill" style="width:{(potStars / 5) * 100}%;background:{POT_COLORS[potStars]}"></div></div>
      </div>
    </div>

    <div class="det-facts">
      <div class="fact"><span>Estimated Value</span><strong>~{fmt.money(detailScoutedFv)}</strong>{#if report?.exact}<small>as scouted, GW{report.observedGameweek}</small>{:else if report}<small>{fmt.money(report.financial.feeMin)}–{fmt.money(report.financial.feeMax)}</small>{/if}</div>
      <div class="fact"><span>Estimated Wage</span><strong>~{fmt.wage(p.wage)}</strong>{#if report?.exact}<small>as scouted, GW{report.observedGameweek}</small>{:else if report}<small>{fmt.wage(report.financial.wageMin)}–{fmt.wage(report.financial.wageMax)}</small>{/if}</div>
    </div>

    <div class="det-attrs">
      <div class="attr-row"><div class="attr-lbl">Attack</div><div class="attr-bar-track"><div class="attr-bar" class:primary={g === 'ATT'} style="width:{Math.round((p.attack / 99) * 100)}%"></div></div><div class="attr-val">{approx}{p.attack}</div></div>
      <div class="attr-row"><div class="attr-lbl">Midfield</div><div class="attr-bar-track"><div class="attr-bar" class:primary={g === 'MID'} style="width:{Math.round((p.midfield / 99) * 100)}%"></div></div><div class="attr-val">{approx}{p.midfield}</div></div>
      <div class="attr-row"><div class="attr-lbl">Defence</div><div class="attr-bar-track"><div class="attr-bar" class:primary={g === 'DEF'} style="width:{Math.round((p.defence / 99) * 100)}%"></div></div><div class="attr-val">{approx}{p.defence}</div></div>
      <div class="attr-row"><div class="attr-lbl">GK</div><div class="attr-bar-track"><div class="attr-bar" class:primary={g === 'GK'} style="width:{Math.round((p.goalkeeping / 99) * 100)}%"></div></div><div class="attr-val">{approx}{p.goalkeeping}</div></div>
    </div>

    <div class="det-offer">
      {#if detailIsCollapsed}
        <div class="offer-blocked">
          <div class="offer-blocked-title">Deal Collapsed</div>
          <div class="offer-blocked-text">Negotiations broke down earlier this window. You cannot make another offer until the next transfer window.</div>
        </div>
      {:else if detailSeasonLocked}
        <div class="offer-blocked warn">
          <div class="offer-blocked-title">Already Transferred</div>
          <div class="offer-blocked-text">This player has already moved clubs this season and cannot transfer again until next season.</div>
        </div>
      {:else if detailRep.blocked}
        <div class="offer-blocked">
          <div class="offer-blocked-title">Likely Reputation Required: {detailRep.adjMin}+</div>
          <div class="offer-blocked-text">Your club (rep {userRep}) may not currently be attractive enough for this player. Better scouting improves the assessment.</div>
        </div>
      {:else if !winStatus.open}
        <div class="offer-blocked">
          <div class="offer-blocked-title">Window Closed</div>
          <div class="offer-blocked-text">{winStatus.label || 'Transfer window is currently closed.'}</div>
        </div>
      {:else}
        <div class="offer-lbl-row"><span>Your Offer</span><span class="offer-min">Scouted floor ~{fmt.money(detailMinOffer)}</span></div>
        <div class="offer-slider-row">
          <input type="range" min={Math.floor(detailMinOffer * 0.7)} max={Math.floor(detailFv * 1.6)} step="100000" bind:value={offerAmount} />
          <div class="offer-val">{fmt.money(offerAmount)}</div>
        </div>
        <div class="offer-hint {offerLikelihood.cls}">{offerLikelihood.text}</div>
        <details class="tr-adv">
          <summary>Structure fee</summary>
          <div class="tr-adv-body">
            <div class="tr-adv-grid">
              <label><span class="tr-adv-lbl-inline">Installment</span><input type="number" min="0" step="100000" bind:value={offerInstallment} /></label>
              <label><span class="tr-adv-lbl-inline">Sell-on %</span><input type="number" min="0" max="50" bind:value={offerSellOn} /></label>
            </div>
          </div>
        </details>
        <button class="btn-full btn-primary" onclick={openConfirmOffer}>Make Offer</button>
      {/if}
    </div>
  </div>
{/if}

<!-- ── Confirm offer sheet ──────────────────────────────────── -->
{#if confirmOffer}
  {@const p = confirmOffer.player}
  {@const g = posGroup(p.position)}
  {@const teamRec = byId.get(p.teamId)}
  <button class="sheet-backdrop" onclick={closeConfirmOffer} aria-label="Close"></button>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div class="sheet-title">Confirm Offer</div>
    <div class="confirm-body">
      <div class="confirm-row"><span>{p.name}</span><span class="pos-badge pos-{g}">{p.position}</span></div>
      <div class="confirm-row"><span>From</span><strong>{teamRec?.name || ''}</strong></div>
      <div class="confirm-row"><span>Scouted ability</span><strong>{abilityLabel(p)}</strong></div>
      <div class="confirm-row"><span>Offer</span><strong style="color:var(--color-warn)">{fmt.money(confirmOffer.offer)}</strong></div>
      <div class="confirm-row"><span>Estimated Value</span><strong>~{fmt.money(scoutedValue(p))}</strong></div>
      <div class="confirm-row"><span>Scouted floor</span><strong>~{fmt.money(detailMinOffer)}</strong></div>
      <div class="confirm-row"><span>Estimated Wage</span><strong>~{fmt.wage(p.wage)}</strong></div>
    </div>
    <div class="sheet-actions">
      <button class="btn-full btn-primary" onclick={sendOffer}>Send Offer</button>
      <button class="btn-full btn-secondary" onclick={closeConfirmOffer}>Cancel</button>
    </div>
  </div>
{/if}

<!-- ── Deal counter sheet ───────────────────────────────────── -->
{#if counterDeal}
  {@const otherClubId = String(counterDeal.sellerTeamId) === String(save?.userTeamId) ? counterDeal.buyerTeamId : counterDeal.sellerTeamId}
  {@const otherClub = byId.get(otherClubId)}
  <button class="sheet-backdrop" onclick={closeCounterDeal} aria-label="Close"></button>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div class="sheet-title">Counter Offer</div>
    <div class="confirm-body">
      <div class="confirm-row"><span>Player</span><strong>{counterDeal.playerName || counterDeal.playerId}</strong></div>
      <div class="confirm-row"><span>Club</span><strong>{otherClub?.name || otherClubId}</strong></div>
      <div class="confirm-row"><span>Current offer</span><strong>{fmt.money(counterDeal.terms?.fee?.upfront ?? 0)}</strong></div>
      <label class="counter-field">
        <span>Counter fee</span>
        <input class="tr-search" type="number" min="100000" step="100000" bind:value={counterAmount} />
      </label>
    </div>
    <div class="sheet-actions">
      <button class="btn-full btn-primary" disabled={counterBusy || counterAmount <= 0} onclick={submitCounterDeal}>{counterBusy ? 'Sending…' : 'Send Counter'}</button>
      <button class="btn-full btn-secondary" disabled={counterBusy} onclick={closeCounterDeal}>Cancel</button>
    </div>
  </div>
{/if}

<!-- ── Contract negotiation sheet ───────────────────────────── -->
{#if contractSheet}
  {@const p = contractSheet.player}
  {@const initialContract = isInitialContractStep(contractSheet.deal)}
  <button class="sheet-backdrop" onclick={closeContractSheet} aria-label="Close"></button>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div class="sheet-title">{contractSheet.deal ? initialContract ? `Negotiate with ${p.name}` : 'Contract Counter' : `Renew ${p.name}`}</div>
    <div class="confirm-body">
      <div class="confirm-row"><span>Player</span><strong>{p.name}</strong></div>
      <div class="confirm-row"><span>Current wage</span><strong>{fmt.wage(p.wage)}</strong></div>
      {#if contractSheet.deal?.interest?.strongestConcern}<div class="contract-concern">{contractSheet.deal.interest.strongestConcern}</div>{/if}
      <div class="contract-grid">
        <label><span>Weekly wage</span><input type="number" min="1000" step="1000" bind:value={contractWage} /></label>
        <label><span>Length</span><select bind:value={contractDuration}><option value={1}>1 year</option><option value={2}>2 years</option><option value={3}>3 years</option><option value={4}>4 years</option><option value={5}>5 years</option></select></label>
        <label><span>Squad role</span><select bind:value={contractRole}><option value="crucial">Crucial</option><option value="important">Important</option><option value="rotation">Rotation</option><option value="squad">Squad</option><option value="prospect">Prospect</option></select></label>
        <label><span>Signing bonus</span><input type="number" min="0" step="10000" bind:value={contractSigningBonus} /></label>
        <label class="contract-wide"><span>Release clause</span><input type="number" min="0" step="100000" bind:value={contractReleaseClause} /></label>
      </div>
    </div>
    <div class="sheet-actions">
      <button class="btn-full btn-primary" disabled={contractBusy || contractWage <= 0} onclick={submitContractOffer}>{contractBusy ? 'Sending…' : contractSheet.deal && !initialContract ? 'Send Revised Terms' : 'Make Contract Offer'}</button>
      <button class="btn-full btn-secondary" disabled={contractBusy} onclick={closeContractSheet}>Cancel</button>
    </div>
  </div>
{/if}

<!-- ── Sell confirm sheet ───────────────────────────────────── -->
{#if sellConfirm}
  {@const p = sellConfirm.player}
  {@const g = posGroup(p.position)}
  <button class="sheet-backdrop" onclick={closeSellConfirm} aria-label="Close"></button>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div class="sheet-title">Sell {p.name}</div>
    <div class="confirm-body">
      <div class="confirm-row"><span>{p.name}</span><span class="pos-badge pos-{g}">{p.position}</span></div>
      <div class="confirm-row"><span>Est. Fee</span><strong style="color:var(--color-warn)">~{fmt.money(sellConfirm.est)}</strong></div>
      <div class="confirm-row"><span>Form Value</span><strong>{fmt.money(sellConfirm.fv)}</strong></div>
    </div>
    <div class="sheet-actions">
      <button class="btn-full btn-primary" disabled={sellBusy} onclick={confirmSell}>{sellBusy ? 'Listing…' : 'List Player'}</button>
      <button class="btn-full btn-secondary" disabled={sellBusy} onclick={closeSellConfirm}>Cancel</button>
    </div>
  </div>
{/if}

<!-- ── Loan detail sheet (in or out) ────────────────────────── -->
{#if loanDetail}
  {@const p = loanDetail.player}
  {@const g = posGroup(p.position)}
  {@const r = primaryRating(p)}
  {@const cost = loanCost(p)}
  {@const gwsLeft = Math.max(0, (save?.totalGameweeks ?? 38) - (save?.currentGameweek ?? 1) + 1)}
  <button class="sheet-backdrop" onclick={closeLoanDetail} aria-label="Close"></button>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div class="sheet-title">{loanDetail.mode === 'in' ? 'Loan' : 'Loan Out'} {p.name}</div>
    <div class="confirm-body">
      <div class="confirm-row"><span>{p.name}</span><span class="pos-badge pos-{g}">{p.position}</span></div>
      {#if loanDetail.mode === 'in'}<div class="confirm-row"><span>Parent Club</span><strong>{byId.get(p.teamId)?.name || ''}</strong></div>{/if}
      <div class="confirm-row"><span>Age</span><strong>{p.age}</strong></div>
      <div class="confirm-row"><span>{loanDetail.mode === 'in' ? 'Scouted ability' : 'Rating'}</span><strong>{loanDetail.mode === 'in' ? abilityLabel(p) : r}</strong></div>
      <div class="confirm-row"><span>{loanDetail.mode === 'in' ? 'Estimated Wage' : 'Weekly Wage'}</span><strong>{loanDetail.mode === 'in' ? '~' : ''}{fmt.wage(p.wage)}</strong></div>
      <div class="loan-breakdown">
        <div class="loan-breakdown-title">{loanDetail.mode === 'in' ? 'Estimated Cost' : 'Budget Relief'}</div>
        <div class="confirm-row"><span>{loanDetail.mode === 'in' ? 'Estimated loan fee' : 'Loan Fee received'}</span><strong>{fmt.money(cost.fee)}</strong></div>
        <div class="confirm-row"><span>{loanDetail.mode === 'in' ? `Estimated wages × ${gwsLeft} GWs` : `Wages saved × ${gwsLeft} GWs`}</span><strong>{fmt.money(cost.wageCost)}</strong></div>
        <div class="confirm-row loan-total"><span>{loanDetail.mode === 'in' ? 'Estimated Upfront Cost' : 'Total Budget Gain'}</span><strong>{loanDetail.mode === 'out' ? '+' : ''}{fmt.money(cost.total)}</strong></div>
      </div>
      {#if loanDetail.mode === 'in'}<div class="confirm-row"><span>Your Budget</span><strong style="color:{budget >= cost.total ? 'var(--color-live)' : 'var(--color-bad)'}">{fmt.money(budget)}</strong></div>{/if}
    </div>
    <div class="sheet-actions">
      {#if loanDetail.mode === 'in'}
        <button class="btn-full btn-primary" disabled={loanBusy || budget < cost.total} onclick={confirmLoanIn}>{loanBusy ? 'Loading…' : 'Open Loan Talks'}</button>
      {:else}
        <button class="btn-full btn-primary" disabled={loanBusy} onclick={confirmLoanOut}>{loanBusy ? 'Loading…' : 'Loan Out'}</button>
      {/if}
      <button class="btn-full btn-secondary" disabled={loanBusy} onclick={closeLoanDetail}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .transfers-screen {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    font-family: var(--font-body);
    color: var(--color-tx);
  }

  .tr-hdr { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 18px 16px 12px; flex-shrink: 0; }
  .tr-eyebrow { font-family: var(--font-mono); font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: var(--color-club); margin-bottom: 3px; }
  .tr-title { font-family: var(--font-display); font-size: clamp(22px, 5vw, 28px); letter-spacing: 1px; line-height: 1; }
  .tr-budget { text-align: right; }
  .tr-budget-lbl { display: block; font-size: 10px; color: var(--color-tx-3); }
  .tr-budget-val { font-family: var(--font-display); font-size: 20px; color: var(--color-live); }
  .tr-wage-lbl { display: block; font-size: 10px; color: var(--color-tx-3); margin-top: 2px; }

  .tr-window-banner {
    margin: 0 16px 10px; padding: 6px 14px; border-radius: 8px; text-align: center;
    font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
    background: color-mix(in oklch, var(--color-bad) 12%, transparent); color: var(--color-bad);
  }

  .tr-empty { color: var(--color-tx-3); font-size: 12px; padding: 24px; text-align: center; }
  .tr-empty-inline { color: var(--color-tx-3); font-size: 12px; padding: 24px; text-align: center; }
  .tr-empty-inline span { font-size: 11px; color: var(--color-tx-3); }

  .tr-tabs { display: flex; align-items: center; gap: 6px; padding: 0 16px 10px; flex-shrink: 0; overflow-x: auto; scrollbar-width: none; }
  .tr-tabs::-webkit-scrollbar { display: none; }
  .tr-tab {
    padding: 7px 16px; border-radius: 8px; border: 1px solid var(--color-line);
    background: var(--color-surface); color: var(--color-tx-2); font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .tr-tab.on { background: var(--color-club); color: var(--color-on-club, #fff); border-color: transparent; }
  .tr-tabs-spacer { flex: 1; }
  .tr-tab-offers {
    padding: 7px 14px; border-radius: 8px; border: 1px solid var(--color-line);
    background: var(--color-raised); color: var(--color-warn); font-size: 11px; font-weight: 600; cursor: pointer;
    display: flex; align-items: center; gap: 6px;
  }
  .offers-badge { background: var(--color-bad); color: #fff; font-size: 9px; padding: 1px 6px; border-radius: 99px; font-family: var(--font-mono); }

  .tr-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 0 16px 16px; gap: 8px; }
  .tr-panel-title { font-family: var(--font-display); font-size: 15px; letter-spacing: 0.5px; flex-shrink: 0; }

  .tr-search-row { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .tr-search {
    flex: 1; min-height: 40px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--color-line);
    background: var(--color-surface); color: var(--color-tx); font-size: 13px; font-family: var(--font-body);
  }
  .tr-count { font-family: var(--font-mono); font-size: 10px; color: var(--color-tx-3); white-space: nowrap; }

  .ftabs { display: flex; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }
  .ftab {
    padding: 5px 11px; border-radius: 7px; border: 1px solid var(--color-line);
    background: var(--color-raised); color: var(--color-tx-2); font-size: 11px; font-weight: 600; cursor: pointer;
    min-height: 30px;
  }
  .ftab.on { background: var(--color-club); color: var(--color-on-club, #fff); border-color: transparent; }
  .tr-reset { color: var(--color-bad); }

  .tr-adv { flex-shrink: 0; background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 10px; }
  .tr-adv summary { padding: 8px 12px; font-size: 11px; font-family: var(--font-mono); letter-spacing: 0.5px; text-transform: uppercase; color: var(--color-tx-2); cursor: pointer; }
  .tr-adv-body { padding: 4px 12px 12px; display: flex; flex-direction: column; gap: 10px; }
  .tr-adv-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .tr-adv-row select {
    flex: 1; min-width: 100px; background: var(--color-raised); border: 1px solid var(--color-line);
    color: var(--color-tx); border-radius: 7px; padding: 6px 8px; font-size: 11px;
  }
  .tr-adv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .tr-adv-grid label { display: grid; gap: 5px; min-width: 0; }
  .tr-adv-grid input { width: 100%; min-width: 0; }
  .tr-adv-lbl { display: flex; justify-content: space-between; font-size: 10px; color: var(--color-tx-2); font-family: var(--font-mono); margin-bottom: 3px; }
  .tr-adv-lbl-inline { font-size: 10px; color: var(--color-tx-2); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.5px; }
  .tr-adv-sliders { display: flex; gap: 6px; align-items: center; }
  .tr-adv-sliders input, .tr-adv-body > div > input[type="range"] { flex: 1; }
  .tr-pot-stars { display: flex; gap: 3px; }
  .tr-pot-btn { padding: 3px 7px; font-size: 10px; color: var(--color-warn); }

  .buy-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; position: relative; }
  .buy-spacer { position: relative; }
  .buy-row {
    position: absolute; left: 0; right: 0; display: flex; align-items: center; gap: 10px;
    background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 10px;
    padding: 8px 10px; cursor: pointer; box-sizing: border-box; height: 62px; margin-top: 3px;
  }
  .buy-row:hover { background: var(--color-raised); }

  .sell-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 6px; }
  .sell-row {
    display: flex; align-items: center; gap: 10px;
    background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 10px;
    padding: 8px 10px; cursor: pointer;
  }
  .sell-row.is-locked { opacity: 0.5; }
  .deal-row { cursor: default; flex-wrap: wrap; }
  .deal-actions { width: 100%; display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }

  .pl-flag { display: grid; place-items: center; flex-shrink: 0; width: 26px; height: 22px; color: var(--color-tx-3); font: 700 8px/1 var(--font-mono); letter-spacing: .06em; }
  .pl-flag-sm {
    width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    font-family: var(--font-mono); font-size: 9px; font-weight: 700; border: 1px solid;
  }
  .pl-flag-sm.pos-GK { color: #7c83e8; border-color: #7c83e8; }
  .pl-flag-sm.pos-DEF { color: var(--color-live); border-color: var(--color-live); }
  .pl-flag-sm.pos-MID { color: var(--color-warn); border-color: var(--color-warn); }
  .pl-flag-sm.pos-ATT { color: var(--color-bad); border-color: var(--color-bad); }

  .pl-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .pl-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
  .pl-meta { display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--color-tx-2); font-family: var(--font-mono); flex-wrap: wrap; }
  .pl-tag { background: var(--color-raised); border: 1px solid var(--color-line); padding: 0 4px; border-radius: 4px; }
  .lock-badge { font-size: 8px; font-family: var(--font-mono); font-weight: 700; padding: 1px 4px; border-radius: 4px; background: color-mix(in oklch, var(--color-bad) 20%, transparent); color: var(--color-bad); }

  .pl-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
  .pl-val { font-family: var(--font-mono); font-size: 11px; color: var(--color-tx-2); }
  .pl-rat { font-family: var(--font-display); font-size: 16px; color: var(--color-club); }
  .range-rating { min-width:44px; white-space:nowrap; text-align:right; }

  .pos-badge {
    font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.5px;
    padding: 1px 5px; border-radius: 4px; flex-shrink: 0;
    background: var(--color-raised); color: var(--color-tx-2); border: 1px solid var(--color-line);
  }
  .pos-badge.pos-GK { color: #7c83e8; }
  .pos-badge.pos-DEF { color: var(--color-live); }
  .pos-badge.pos-MID { color: var(--color-warn); }
  .pos-badge.pos-ATT { color: var(--color-bad); }

  .sell-btn {
    min-height: 34px; padding: 0 14px; border-radius: 8px; border: none;
    background: var(--color-club); color: var(--color-on-club, #fff); font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .sell-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .sq-listed-badge {
    font-size: 9px; font-family: var(--font-mono); font-weight: 700; padding: 1px 5px; border-radius: 4px;
    background: color-mix(in oklch, var(--color-warn) 20%, transparent); color: var(--color-warn);
  }

  /* ── Bottom sheets ────────────────────────────────────────── */
  .sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 900; animation: fade-in 0.2s ease; border: none; padding: 0; cursor: default; }
  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 901;
    max-height: 88dvh; overflow-y: auto; overscroll-behavior: contain;
    background: var(--color-surface); border: 1px solid var(--color-line); border-bottom: none;
    border-radius: 18px 18px 0 0; padding: 10px 18px calc(20px + env(safe-area-inset-bottom));
    animation: slide-up 0.22s ease; font-family: var(--font-body); color: var(--color-tx);
  }
  @media (prefers-reduced-motion: reduce) { .sheet-backdrop, .sheet { animation: none; } }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--color-line); margin: 4px auto 14px; }
  .sheet-title { font-family: var(--font-display); font-size: 19px; letter-spacing: 0.5px; margin-bottom: 10px; }

  .det-hero { text-align: center; padding-bottom: 14px; border-bottom: 1px solid var(--color-line); }
  .det-rating { font-family: var(--font-display); font-size: 40px; line-height: 1; }
  .det-flag { font-size: 26px; margin-top: 2px; }
  .det-name { font-family: var(--font-display); font-size: 19px; letter-spacing: 0.5px; margin-top: 4px; }
  .det-wk { display: inline-block; margin-top: 4px; font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 4px; letter-spacing: 1px; background: linear-gradient(135deg, var(--color-warn), #f97316); color: #14171c; }
  .det-meta { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 11px; color: var(--color-tx-2); margin-top: 6px; flex-wrap: wrap; }
  .det-badges { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 8px; font-size: 11px; font-family: var(--font-mono); flex-wrap:wrap; }
  .form-badge { font-size: 10px; font-family: var(--font-mono); padding: 1px 6px; border-radius: 5px; }
  .form-badge.form-hot { background: color-mix(in oklch, var(--color-bad) 18%, transparent); color: var(--color-bad); }
  .form-badge.form-good { background: color-mix(in oklch, var(--color-live) 18%, transparent); color: var(--color-live); }
  .form-badge.form-avg { background: var(--color-raised); color: var(--color-tx-2); }

  .det-pot { padding: 12px 0; border-bottom: 1px solid var(--color-line); }
  .det-pot-top { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
  .det-pot-bar-row { display: flex; align-items: center; gap: 8px; }
  .det-pot-track { flex: 1; height: 5px; background: var(--color-raised); border-radius: 3px; overflow: hidden; }
  .det-pot-fill { height: 100%; border-radius: 3px; }

  .det-facts { display: flex; gap: 20px; padding: 10px 0; border-bottom: 1px solid var(--color-line); }
  .fact { font-size: 11px; color: var(--color-tx-2); display: flex; flex-direction: column; gap: 2px; }
  .fact strong { color: var(--color-tx); font-size: 14px; }
  .fact small { color:var(--color-tx-3); font:9px var(--font-mono); }

  .det-attrs { padding: 12px 0; border-bottom: 1px solid var(--color-line); }
  .attr-row { display: grid; grid-template-columns: 70px 1fr 34px; align-items: center; gap: 8px; margin-bottom: 7px; }
  .attr-lbl { font-size: 11px; color: var(--color-tx-2); }
  .attr-bar-track { height: 6px; border-radius: 3px; background: var(--color-raised); overflow: hidden; }
  .attr-bar { height: 100%; border-radius: 3px; background: var(--color-tx-2); }
  .attr-bar.primary { background: linear-gradient(90deg, var(--color-club), var(--color-live)); }
  .attr-val { font-family: var(--font-mono); font-size: 11px; text-align: right; }

  .det-scout { display: flex; align-items: center; gap: 10px; padding: 11px 12px; margin-top: 12px; border: 1px solid var(--color-line); border-radius: 10px; background: var(--color-raised); }
  .det-scout-copy { min-width: 0; flex: 1; }
  .det-scout-copy strong { display: block; font-size: 12px; color: var(--color-tx); }
  .det-scout-copy small { display: block; margin-top: 3px; color: var(--color-tx-3); font-size: 10px; line-height: 1.45; }
  .det-scout-btn { flex-shrink: 0; min-height: 44px; }

  .det-offer { padding-top: 12px; }
  .det-offer .btn-full { margin-top: 12px; }
  .offer-blocked { background: var(--color-raised); border: 1px solid var(--color-line); border-radius: 10px; padding: 14px; text-align: center; }
  .offer-blocked-title { font-size: 13px; font-weight: 700; color: var(--color-bad); margin-bottom: 4px; }
  .offer-blocked.warn .offer-blocked-title { color: var(--color-warn); }
  .offer-blocked-text { font-size: 11px; color: var(--color-tx-2); }
  .offer-lbl-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 12px; }
  .offer-min { font-size: 10px; color: var(--color-tx-3); font-family: var(--font-mono); }
  .offer-slider-row { display: flex; align-items: center; gap: 10px; }
  .offer-slider-row input { flex: 1; }
  .offer-val { font-family: var(--font-display); font-size: 16px; color: var(--color-warn); min-width: 74px; text-align: right; }
  .offer-hint { font-size: 11px; margin: 6px 0 12px; }
  .offer-hint.good { color: var(--color-live); }
  .offer-hint.warn { color: var(--color-warn); }
  .offer-hint.bad { color: var(--color-bad); }

  .confirm-body { display: flex; flex-direction: column; gap: 2px; margin-bottom: 14px; }
  .confirm-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--color-tx-2); padding: 4px 0; }
  .confirm-row strong { color: var(--color-tx); }
  .counter-field { display: grid; gap: 6px; padding-top: 8px; font-size: 11px; color: var(--color-tx-2); }
  .counter-field .tr-search { width: 100%; box-sizing: border-box; }
  .contract-concern { margin: 8px 0; padding: 9px 10px; border-radius: 8px; background: var(--color-raised); border: 1px solid var(--color-line); color: var(--color-warn); font-size: 11px; }
  .contract-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
  .contract-grid label { display: grid; gap: 5px; min-width: 0; font-size: 10px; color: var(--color-tx-2); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: .5px; }
  .contract-grid input, .contract-grid select { width: 100%; min-width: 0; box-sizing: border-box; min-height: 38px; border-radius: 8px; border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx); padding: 0 9px; font-family: var(--font-body); }
  .contract-wide { grid-column: 1 / -1; }
  .loan-breakdown { background: var(--color-raised); border: 1px solid var(--color-line); border-radius: 10px; padding: 10px 12px; margin: 8px 0; }
  .loan-breakdown-title { font-size: 9px; font-weight: 700; color: var(--color-tx-3); letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 6px; }
  .loan-total { border-top: 1px solid var(--color-line); margin-top: 4px; padding-top: 6px; }
  .loan-total strong { color: var(--color-live); font-size: 14px; }

  .sheet-actions { display: flex; flex-direction: column; gap: 8px; }
  .btn-full { display: block; width: 100%; min-height: 44px; padding: 0 14px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-body); }
  .btn-full:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-primary { border: none; background: var(--color-club); color: var(--color-on-club, #fff); }
  .btn-secondary { border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx-2); }

  @media (min-width: 720px) {
    .deal-row { flex-wrap: nowrap; }
    .deal-actions { width: auto; flex-wrap: nowrap; flex-shrink: 0; }
  }
  @media (min-width: 900px) {
    .sheet { left: auto; width: 420px; right: 0; border-radius: 18px 0 0 0; }
  }
</style>
