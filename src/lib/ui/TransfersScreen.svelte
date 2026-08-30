<script>
  import { getAllPlayers, getAllTeams, getPlayer, getPlayersByTeam, getSave, getTeam, openDB, putSave } from '../../modules/db.js';
  import { primaryRating } from '../../modules/matchEngine.js';
  import {
    _loanFee, _loanWageCost, buyPlayer, canClubSignPlayer, formAdjustedValue, generateBuyCounter,
    getLoanableInPlayers, loanInPlayer, loanOutPlayer, playerMinRepToSign, sellPlayer, signFreeAgent, transferWindowStatus,
  } from '../../modules/transfers.js';
  import { getPotentialLabel, getPotentialStars } from '../../modules/potential.js';
  import { fmt, formLabel, playerNationality, posGroup, toast } from '../../ui/helpers.js';
  import { newsPlayerSigned, newsPlayerSold } from '../../ui/inbox.js';
  import { _updateOffersBadge, showOffersModal } from '../../ui/squad_tactics_offers.js';
  import { screenTicks } from '../state/screens.svelte.js';

  const POT_COLORS = ['', '#8a9ab0', 'var(--color-live)', '#3b82f6', 'var(--color-warn)', 'var(--color-bad)'];
  const LEAGUE_NATION = { 'Premier League': 'ENG', 'Championship': 'ENG', 'League One': 'ENG', 'League Two': 'ENG', 'La Liga': 'ESP', 'Bundesliga': 'GER', 'Serie A': 'ITA', 'Ligue 1': 'FRA', 'Eredivisie': 'NED' };
  const BUY_MSGS = { INSUFFICIENT_FUNDS: 'Not enough budget.', ALREADY_IN_SQUAD: 'Already in your squad.', REP_TOO_LOW: "Your club's reputation is too low to attract this calibre of player.", WINDOW_CLOSED: 'The transfer window is closed. You can only sign players in the summer (Aug) or winter (Jan) windows.', SIGNED_THIS_SEASON: 'This player has already transferred once this season and cannot move again until next season.' };
  const SELL_MSGS = { WINDOW_CLOSED: 'The transfer window is closed. You can only sell players in the summer (Aug) or winter (Jan) windows.', NO_BUYERS: 'No clubs could be found willing to buy this player right now.', PLAYER_NOT_IN_SQUAD: 'Player not found in your squad.' };
  const LOAN_IN_MSGS = { WINDOW_CLOSED: 'Transfer window is closed.', ALREADY_ON_LOAN: 'Player is already out on loan.', SIGNED_THIS_SEASON: 'Player already moved this season.', INSUFFICIENT_FUNDS: 'Not enough budget.', CLUB_WONT_LOAN: "This club won't loan out this player." };
  const LOAN_OUT_MSGS = { WINDOW_CLOSED: 'Transfer window is closed.', ALREADY_ON_LOAN: 'Already on loan.', SIGNED_THIS_SEASON: 'Already moved this season.', NO_LOAN_TAKERS: 'No clubs interested in this player right now.' };

  const ROW_H = 68;
  const OVERSCAN = 6;

  let loaded = $state(false);
  let save = $state(null);
  let team = $state(null);
  let byId = $state(new Map());
  let leagues = $state([]);
  let buyTargets = $state([]);
  let squadPlayers = $state([]);
  let freeAgents = $state([]);
  let winStatus = $state({ open: true, label: '' });

  let tab = $state('buy'); // 'buy' | 'sell' | 'loans' | 'free'
  let loanTab = $state('in'); // 'in' | 'out'
  let loanInList = $state([]);
  let loanOutList = $state([]);

  const filters = $state({
    pos: 'ALL', league: 'ALL', sort: 'rating',
    minAge: 15, maxAge: 40, minRat: 40, maxRat: 99,
    maxPrice: 0, minPot: 0, query: '', affordable: false, canSign: false,
  });

  async function load() {
    await openDB();
    const s = await getSave();
    if (!s || s._deleted) return;
    save = s;
    team = await getTeam(s.userTeamId);
    const allTeams = await getAllTeams();
    byId = new Map(allTeams.map(t => [t.id, t]));
    leagues = [...new Set(allTeams.map(t => t.league || 'Premier League'))].sort();
    const allPl = await getAllPlayers();
    buyTargets = allPl.filter(p => p.teamId !== s.userTeamId && p.teamId !== 'free_agents');
    freeAgents = allPl.filter(p => p.teamId === 'free_agents');
    squadPlayers = [...(await getPlayersByTeam(s.userTeamId))].sort((a, b) => primaryRating(b) - primaryRating(a));
    winStatus = transferWindowStatus(s);
    if (tab === 'loans') await loadLoans();
    loaded = true;
    _updateOffersBadge();
  }

  async function loadLoans() {
    if (!save) return;
    if (winStatus.open === false) { loanInList = []; loanOutList = []; return; }
    loanInList = await getLoanableInPlayers(save);
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
      await signFreeAgent(p.id);
      newsPlayerSigned(p, 0, save).catch(() => {});
      toast(`${p.name} signed on a free transfer`, 'success', 3000);
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
    if (f.maxPrice > 0) fil = fil.filter(p => formAdjustedValue(p) <= f.maxPrice);
    if (f.affordable) fil = fil.filter(p => Math.floor(formAdjustedValue(p) * 0.88) <= budget);
    if (f.canSign) fil = fil.filter(p => canClubSignPlayer({ reputation: userRep }, p));
    if (f.minPot > 0) fil = fil.filter(p => getPotentialStars(p) >= f.minPot);
    if (f.query) fil = fil.filter(p => p.name.toLowerCase().includes(f.query) || (byId.get(p.teamId)?.name || '').toLowerCase().includes(f.query));

    const sortFns = {
      rating: (a, b) => primaryRating(b) - primaryRating(a),
      value: (a, b) => formAdjustedValue(b) - formAdjustedValue(a),
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
  let detailFresh = $state(null); // re-fetched fresh copy, avoids stale closures
  let offerAmount = $state(0);

  async function openDetail(p) {
    detailPlayer = p;
    detailFresh = await getPlayer(p.id) ?? p;
    const fv = formAdjustedValue(detailFresh);
    offerAmount = Math.floor(fv * 0.95);
  }
  function closeDetail() { detailPlayer = null; detailFresh = null; }

  const detailFv = $derived(detailFresh ? formAdjustedValue(detailFresh) : 0);
  const detailMinOffer = $derived(Math.floor(detailFv * 0.88));
  const detailIsCollapsed = $derived(detailFresh ? (save?.collapsedDeals || []).includes(detailFresh.id) : false);
  const detailSeasonLocked = $derived(!!detailFresh?.signedThisSeason);
  const detailRep = $derived(detailFresh ? repInfo(detailFresh) : { adjMin: 0, blocked: false });
  const offerLikelihood = $derived.by(() => {
    if (offerAmount >= detailFv) return { text: 'Over value — very likely accepted', cls: 'good' };
    if (offerAmount >= detailMinOffer) return { text: 'Likely accepted', cls: 'good' };
    if (offerAmount >= detailMinOffer * 0.88) return { text: 'May be rejected', cls: 'warn' };
    return { text: 'Will be rejected', cls: 'bad' };
  });

  // ── Offer confirm / counter-offer flow ──────────────────────
  let confirmOffer = $state(null); // { player, offer }
  let counterState = $state(null); // { player, counter, revised }

  function openConfirmOffer() {
    confirmOffer = { player: detailFresh, offer: offerAmount };
  }
  function closeConfirmOffer() { confirmOffer = null; }

  async function sendOffer() {
    const { player, offer } = confirmOffer;
    try {
      await buyPlayer(player.id, offer);
      toast(`${player.name} signed for ${fmt.money(offer)}!`, 'success', 5000);
      newsPlayerSigned(player, offer, await getSave()).catch(() => {});
      confirmOffer = null;
      closeDetail();
      screenTicks.transfers++;
      load();
    } catch (err) {
      if (err.message === 'OFFER_REJECTED') {
        const counter = generateBuyCounter(player, offer);
        confirmOffer = null;
        if (counter) {
          const cMax = Math.min(budget, Math.floor(counter.fee * 1.3));
          counterState = { player, counter, revised: Math.min(budget, counter.fee), cMin: offer, cMax };
        } else {
          const sv = await getSave();
          await putSave({ ...sv, collapsedDeals: [...(sv.collapsedDeals || []), player.id] });
          toast(`${byId.get(player.teamId)?.name || 'The club'} rejected and won't negotiate further`, 'error', 5000);
          save = sv;
        }
      } else {
        toast(BUY_MSGS[err.message] || err.message, 'error', 6000);
      }
    }
  }

  const counterHint = $derived.by(() => {
    if (!counterState) return null;
    const { revised, counter } = counterState;
    const ratio = revised / counter.fee;
    if (ratio >= 1) return { text: 'Meets their asking price', cls: 'good' };
    if (ratio >= 0.95) return { text: 'Very close — likely accepted', cls: 'good' };
    if (ratio >= 0.85) return { text: 'Below asking — they may accept', cls: 'warn' };
    return { text: 'Too low — will probably be rejected', cls: 'bad' };
  });

  async function sendRevisedOffer() {
    const { player, revised } = counterState;
    try {
      await buyPlayer(player.id, revised);
      toast(`${player.name} signed for ${fmt.money(revised)}!`, 'success', 5000);
      newsPlayerSigned(player, revised, await getSave()).catch(() => {});
      counterState = null;
      closeDetail();
      screenTicks.transfers++;
      load();
    } catch (err) {
      if (err.message === 'OFFER_REJECTED') {
        const sv = await getSave();
        await putSave({ ...sv, collapsedDeals: [...(sv.collapsedDeals || []), player.id] });
        toast(`${byId.get(player.teamId)?.name || 'The club'} still not satisfied — deal collapsed`, 'error', 4000);
        save = sv;
        counterState = null;
      } else {
        toast(err.message, 'error', 4000);
      }
    }
  }
  function walkAway() { counterState = null; }

  // ── Sell tab ─────────────────────────────────────────────────
  let sellConfirm = $state(null); // { player, est }
  let sellBusy = $state(false);

  function openSellConfirm(p) {
    const fv = formAdjustedValue(p);
    const est = Math.round(fv * (0.92 + Math.random() * 0.2));
    sellConfirm = { player: p, est, fv };
  }
  function closeSellConfirm() { if (!sellBusy) sellConfirm = null; }

  async function confirmSell() {
    const { player } = sellConfirm;
    sellBusy = true;
    try {
      const { fee, buyerName } = await sellPlayer(player.id);
      toast(`${player.name} sold to ${buyerName} for ${fmt.money(fee)}!`, 'success', 5000);
      newsPlayerSold(player, fee, buyerName, await getSave()).catch(() => {});
      sellConfirm = null;
      screenTicks.transfers++;
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
      const res = await loanInPlayer(player.id);
      toast(`${player.name} joined on loan from ${res.parentClubName}!`, 'success', 5000);
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
      <button class="tr-tab {tab === 'buy' ? 'on' : ''}" onclick={() => selectTab('buy')}>Buy</button>
      <button class="tr-tab {tab === 'sell' ? 'on' : ''}" onclick={() => selectTab('sell')}>Sell</button>
      <button class="tr-tab {tab === 'loans' ? 'on' : ''}" onclick={() => selectTab('loans')}>Loans</button>
      <button class="tr-tab {tab === 'free' ? 'on' : ''}" onclick={() => selectTab('free')}>Free Agents{#if freeAgents.length}<span class="offers-badge">{freeAgents.length}</span>{/if}</button>
      <div class="tr-tabs-spacer"></div>
      <button class="tr-tab-offers" onclick={() => showOffersModal()}>
        Offers <span id="tt-offers-badge" class="offers-badge" style="display:none">0</span>
      </button>
    </div>

    {#if tab === 'buy'}
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
                <option value="rating">Rating</option>
                <option value="value">Value</option>
                <option value="age">Age</option>
                <option value="potential">Potential</option>
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
                <div class="tr-adv-lbl"><span>Rating</span><span>{filters.minRat}–{filters.maxRat}</span></div>
                <div class="tr-adv-sliders">
                  <input type="range" min="40" max="99" bind:value={filters.minRat} />
                  <input type="range" min="40" max="99" bind:value={filters.maxRat} />
                </div>
              </div>
            </div>
            <div>
              <div class="tr-adv-lbl"><span>Max Price</span><span>{filters.maxPrice > 0 ? fmt.money(filters.maxPrice) : 'No limit'}</span></div>
              <input type="range" min="0" max="300000000" step="500000" bind:value={filters.maxPrice} style="width:100%" />
            </div>
            <div class="tr-adv-row">
              <span class="tr-adv-lbl-inline">Min Pot</span>
              <div class="tr-pot-stars">
                {#each [1, 2, 3, 4, 5] as n (n)}
                  <button class="ftab tr-pot-btn {n <= filters.minPot ? 'on' : ''}" onclick={() => filters.minPot = filters.minPot === n ? 0 : n}>{'★'.repeat(n)}</button>
                {/each}
              </div>
            </div>
            <div class="tr-adv-row">
              <button class="ftab {filters.affordable ? 'on' : ''}" onclick={() => filters.affordable = !filters.affordable}>Affordable</button>
              <button id="tr-can-sign" class="ftab {filters.canSign ? 'on' : ''}" onclick={() => filters.canSign = !filters.canSign}>Can Sign</button>
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
                {@const r = primaryRating(p)}
                {@const teamRec = byId.get(p.teamId)}
                {@const fv = formAdjustedValue(p)}
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
                      {#if seasonLocked}<span class="lock-badge" title="Already transferred this season">TR</span>{:else if rep.blocked}<span class="lock-badge" title="Rep {rep.adjMin}+ required">REP</span>{/if}
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
                    <div class="pl-val">{fmt.money(fv)}</div>
                    <div class="pl-rat">{r}</div>
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
            {@const fv = formAdjustedValue(p)}
            {@const isListed = p.transferListed === true}
            <div class="sell-row">
              <div class="pl-flag-sm pos-{g}">{g}</div>
              <div class="pl-info">
                <div class="pl-name">{p.name}{#if isListed}<span class="sq-listed-badge">TL</span>{/if}</div>
                <div class="pl-meta"><span class="pos-badge pos-{g}">{p.position}</span><span>Age {p.age}</span></div>
              </div>
              <div class="pl-val">{fmt.money(fv)}</div>
              <div class="pl-rat">{r}</div>
              <button class="sell-btn" disabled={!winStatus.open} onclick={() => openSellConfirm(p)}>Sell</button>
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
                {@const r = primaryRating(p)}
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
                    <div class="pl-val" style="color:{canAfford ? 'var(--color-live)' : 'var(--color-bad)'}">{fmt.money(cost.total)}</div>
                    <div class="pl-rat">{r}</div>
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
              {@const r = primaryRating(p)}
              {@const blocked = !canClubSignPlayer(team, p)}
              <div class="sell-row {blocked ? 'is-locked' : ''}">
                <div class="pl-flag-sm pos-{g}">{g}</div>
                <div class="pl-info">
                  <div class="pl-name">{p.name}</div>
                  <div class="pl-meta"><span class="pos-badge pos-{g}">{p.position}</span><span>Age {p.age}</span><span>{fmt.wage(p.wage)}/wk</span></div>
                </div>
                <div class="pl-val">{r}</div>
                <button class="sell-btn" disabled={blocked} title={blocked ? "Your club's reputation is too low" : ''} onclick={() => signFree(p)}>Sign</button>
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
  <button class="sheet-backdrop" onclick={closeDetail} aria-label="Close"></button>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div class="det-hero">
      <div class="det-rating" style="color:{r >= 80 ? 'var(--color-live)' : 'var(--color-club)'}">{r}</div>
      <div class="det-flag">{playerNationality(p, teamRec?.league)}</div>
      <div class="det-name">{p.name}</div>
      {#if p.isWonderkid}<div class="det-wk">WONDERKID</div>{/if}
      <div class="det-meta"><span class="pl-tag">{teamRec?.shortName || ''}</span><span>{teamRec?.name || ''}</span><span class="pos-badge pos-{g}">{p.position}</span><span>Age {p.age}</span></div>
      <div class="det-badges">
        <span class="form-badge form-{fl.cls}">{fl.text}</span>
        <span style="color:{fitnessColor(p.fitness ?? 100)}">{Math.round(p.fitness ?? 100)}% fit</span>
      </div>
    </div>

    <div class="det-pot">
      <div class="det-pot-top"><span>Potential</span><span style="color:{POT_COLORS[potStars]}">{potLabel}</span></div>
      <div class="det-pot-bar-row">
        <span style="color:{POT_COLORS[potStars]}">{'★'.repeat(potStars)}{'☆'.repeat(5 - potStars)}</span>
        <div class="det-pot-track"><div class="det-pot-fill" style="width:{(potStars / 5) * 100}%;background:{POT_COLORS[potStars]}"></div></div>
      </div>
    </div>

    <div class="det-facts">
      <div class="fact"><span>Form Value</span><strong>{fmt.money(detailFv)}</strong></div>
      <div class="fact"><span>Weekly Wage</span><strong>{fmt.wage(p.wage)}</strong></div>
    </div>

    <div class="det-attrs">
      <div class="attr-row"><div class="attr-lbl">Attack</div><div class="attr-bar-track"><div class="attr-bar" class:primary={g === 'ATT'} style="width:{Math.round((p.attack / 99) * 100)}%"></div></div><div class="attr-val">{p.attack}</div></div>
      <div class="attr-row"><div class="attr-lbl">Midfield</div><div class="attr-bar-track"><div class="attr-bar" class:primary={g === 'MID'} style="width:{Math.round((p.midfield / 99) * 100)}%"></div></div><div class="attr-val">{p.midfield}</div></div>
      <div class="attr-row"><div class="attr-lbl">Defence</div><div class="attr-bar-track"><div class="attr-bar" class:primary={g === 'DEF'} style="width:{Math.round((p.defence / 99) * 100)}%"></div></div><div class="attr-val">{p.defence}</div></div>
      <div class="attr-row"><div class="attr-lbl">GK</div><div class="attr-bar-track"><div class="attr-bar" class:primary={g === 'GK'} style="width:{Math.round((p.goalkeeping / 99) * 100)}%"></div></div><div class="attr-val">{p.goalkeeping}</div></div>
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
          <div class="offer-blocked-title">Reputation Required: {detailRep.adjMin}+</div>
          <div class="offer-blocked-text">Your club (rep {userRep}) isn't attractive enough for a {r}-rated player.</div>
        </div>
      {:else if !winStatus.open}
        <div class="offer-blocked">
          <div class="offer-blocked-title">Window Closed</div>
          <div class="offer-blocked-text">{winStatus.label || 'Transfer window is currently closed.'}</div>
        </div>
      {:else}
        <div class="offer-lbl-row"><span>Your Offer</span><span class="offer-min">Min ~{fmt.money(detailMinOffer)}</span></div>
        <div class="offer-slider-row">
          <input type="range" min={Math.floor(detailMinOffer * 0.7)} max={Math.floor(detailFv * 1.6)} step="100000" bind:value={offerAmount} />
          <div class="offer-val">{fmt.money(offerAmount)}</div>
        </div>
        <div class="offer-hint {offerLikelihood.cls}">{offerLikelihood.text}</div>
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
      <div class="confirm-row"><span>Rating</span><strong>{primaryRating(p)}</strong></div>
      <div class="confirm-row"><span>Offer</span><strong style="color:var(--color-warn)">{fmt.money(confirmOffer.offer)}</strong></div>
      <div class="confirm-row"><span>Form Value</span><strong>{fmt.money(formAdjustedValue(p))}</strong></div>
      <div class="confirm-row"><span>Weekly Wage</span><strong>{fmt.wage(p.wage)}</strong></div>
    </div>
    <div class="sheet-actions">
      <button class="btn-full btn-primary" onclick={sendOffer}>Send Offer</button>
      <button class="btn-full btn-secondary" onclick={closeConfirmOffer}>Cancel</button>
    </div>
  </div>
{/if}

<!-- ── Counter-offer sheet ──────────────────────────────────── -->
{#if counterState}
  {@const p = counterState.player}
  {@const g = posGroup(p.position)}
  {@const teamRec = byId.get(p.teamId)}
  <button class="sheet-backdrop" onclick={walkAway} aria-label="Close"></button>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div class="sheet-title">{teamRec?.name || 'Club'} Counter-Offer</div>
    <div class="confirm-body">
      <div class="confirm-row"><span>{p.name}</span><span class="pos-badge pos-{g}">{p.position}</span></div>
      <div class="confirm-row"><span>Your Offer</span><strong style="color:var(--color-bad)">{fmt.money(counterState.cMin)}</strong></div>
      <div class="confirm-row"><span>They Want</span><strong style="color:var(--color-warn)">{fmt.money(counterState.counter.fee)}</strong></div>
      <div class="confirm-row"><span>Budget</span><strong>{fmt.money(budget)}</strong></div>
    </div>
    <div class="offer-lbl-row" style="margin-top:8px"><span>Your Revised Offer</span></div>
    <div class="offer-slider-row">
      <input type="range" min={counterState.cMin} max={counterState.cMax} step="100000" bind:value={counterState.revised} />
      <div class="offer-val">{fmt.money(counterState.revised)}</div>
    </div>
    {#if counterHint}<div class="offer-hint {counterHint.cls}">{counterHint.text}</div>{/if}
    <div class="sheet-actions">
      <button class="btn-full btn-primary" onclick={sendRevisedOffer}>Send Revised Offer</button>
      <button class="btn-full btn-secondary" onclick={walkAway}>Walk Away</button>
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
      <button class="btn-full btn-primary" disabled={sellBusy} onclick={confirmSell}>{sellBusy ? 'Selling…' : 'Accept Best Offer'}</button>
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
      <div class="confirm-row"><span>Rating</span><strong>{r}</strong></div>
      <div class="confirm-row"><span>Weekly Wage</span><strong>{fmt.wage(p.wage)}</strong></div>
      <div class="loan-breakdown">
        <div class="loan-breakdown-title">{loanDetail.mode === 'in' ? 'Cost Breakdown' : 'Budget Relief'}</div>
        <div class="confirm-row"><span>{loanDetail.mode === 'in' ? 'Loan Fee (10% value)' : 'Loan Fee received'}</span><strong>{fmt.money(cost.fee)}</strong></div>
        <div class="confirm-row"><span>{loanDetail.mode === 'in' ? `Wages × ${gwsLeft} GWs` : `Wages saved × ${gwsLeft} GWs`}</span><strong>{fmt.money(cost.wageCost)}</strong></div>
        <div class="confirm-row loan-total"><span>{loanDetail.mode === 'in' ? 'Total Upfront Cost' : 'Total Budget Gain'}</span><strong>{loanDetail.mode === 'out' ? '+' : ''}{fmt.money(cost.total)}</strong></div>
      </div>
      {#if loanDetail.mode === 'in'}<div class="confirm-row"><span>Your Budget</span><strong style="color:{budget >= cost.total ? 'var(--color-live)' : 'var(--color-bad)'}">{fmt.money(budget)}</strong></div>{/if}
    </div>
    <div class="sheet-actions">
      {#if loanDetail.mode === 'in'}
        <button class="btn-full btn-primary" disabled={loanBusy || budget < cost.total} onclick={confirmLoanIn}>{loanBusy ? 'Loading…' : 'Confirm Loan'}</button>
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

  .tr-tabs { display: flex; align-items: center; gap: 6px; padding: 0 16px 10px; flex-shrink: 0; }
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
  .det-badges { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 8px; font-size: 11px; font-family: var(--font-mono); }
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

  .det-attrs { padding: 12px 0; border-bottom: 1px solid var(--color-line); }
  .attr-row { display: grid; grid-template-columns: 70px 1fr 26px; align-items: center; gap: 8px; margin-bottom: 7px; }
  .attr-lbl { font-size: 11px; color: var(--color-tx-2); }
  .attr-bar-track { height: 6px; border-radius: 3px; background: var(--color-raised); overflow: hidden; }
  .attr-bar { height: 100%; border-radius: 3px; background: var(--color-tx-2); }
  .attr-bar.primary { background: linear-gradient(90deg, var(--color-club), var(--color-live)); }
  .attr-val { font-family: var(--font-mono); font-size: 11px; text-align: right; }

  .det-offer { padding-top: 12px; }
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
  .loan-breakdown { background: var(--color-raised); border: 1px solid var(--color-line); border-radius: 10px; padding: 10px 12px; margin: 8px 0; }
  .loan-breakdown-title { font-size: 9px; font-weight: 700; color: var(--color-tx-3); letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 6px; }
  .loan-total { border-top: 1px solid var(--color-line); margin-top: 4px; padding-top: 6px; }
  .loan-total strong { color: var(--color-live); font-size: 14px; }

  .sheet-actions { display: flex; flex-direction: column; gap: 8px; }
  .btn-full { min-height: 44px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-body); }
  .btn-full:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-primary { border: none; background: var(--color-club); color: var(--color-on-club, #fff); }
  .btn-secondary { border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx-2); }

  @media (min-width: 900px) {
    .sheet { left: auto; width: 420px; right: 0; border-radius: 18px 0 0 0; }
  }
</style>
