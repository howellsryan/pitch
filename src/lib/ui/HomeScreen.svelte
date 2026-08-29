<script>
  import { tick } from 'svelte';
  import { getAllFixtures, getAllPlayers, getAllTeams, getPlayersByTeam, getSave, getTeam, openDB } from '../../modules/db.js';
  import { getUpcomingForTeam } from '../../modules/fixtures.js';
  import { getTableSliceAroundTeam } from '../../modules/standings.js';
  import { isDeadlineDay, generateAIOffers, simulateAITransfers } from '../../modules/transfers.js';
  import { patchSave } from '../../modules/save.js';
  import { getEffectiveTotalGW } from '../../modules/gameweek.js';
  import { fmt, navigateTo, toast } from '../../ui/helpers.js';
  import { handleEndOfSeason } from '../../ui/home_transfers.js';
  import { _makeNewsItem, addNewsItem } from '../../ui/inbox.js';
  import { screenTicks } from '../state/screens.svelte.js';
  import { isSignedIn, startGoogleLogin } from '../../cloud/api.js';
  import Button from './kit/Button.svelte';
  import Crest from './kit/Crest.svelte';
  import FormGuide from './kit/FormGuide.svelte';
  import Money from './kit/Money.svelte';

  let loaded = $state(false);
  let cloudSignedIn = $state(false);
  let save = $state(null);
  let team = $state(null);
  let squadSize = $state(0);
  let byId = $state(new Map());
  let playerById = $state(new Map());
  let past = $state([]);
  let upcoming = $state([]);
  let slice = $state([]);
  let railEl = $state(null);
  let activeCardEl = $state(null);

  let isEnd = $state(false);
  let ddInfo = $state({ isDeadline: false, window: null });
  let onDeadlineDay = $state(false);
  let windowLabel = $state('');
  let hoursLeft = $state(10);
  let eoyBusy = $state(false);
  let deadlineBusy = $state(false);

  const next = $derived(upcoming[0] ?? null);
  const future = $derived(upcoming.slice(1, 4));
  const myRow = $derived(slice.find((row) => row.isUserTeam) ?? null);
  const form = $derived(myRow?.form ?? []);
  const totalGameweeks = $derived(save ? getEffectiveTotalGW(save) : 38);
  const progress = $derived(save ? Math.min(100, Math.max(0, (save.currentGameweek / totalGameweeks) * 100)) : 0);
  const unread = $derived((save?.inbox ?? []).filter((item) => !item.read));
  const pendingOffers = $derived((save?.inboundOffers ?? []).filter((offer) => offer.status === 'pending'));
  const waitingItems = $derived.by(() => {
    const items = pendingOffers.slice(0, 2).map((offer) => ({
      id: `offer-${offer.playerId}`,
      tone: 'good',
      label: `${offer.clubName} bid ${fmt.money(offer.fee)} for ${playerById.get(offer.playerId)?.name ?? 'your player'}`,
      destination: 'transfers',
    }));
    if (unread.length > 0) items.push({ id: `news-${unread[0].id}`, tone: 'neutral', label: unread[0].title, destination: 'inbox' });
    if (!cloudSignedIn) items.push({ id: 'cloud-save', tone: 'warn', label: 'Progress is local-only on this browser', action: startGoogleLogin });
    return items;
  });
  const board = $derived((() => {
    const pct = Math.max(0, Math.min(100, save?.jobSecurity ?? 65));
    const label = pct >= 75 ? 'Secure' : pct >= 45 ? 'Under scrutiny' : pct >= 20 ? 'On notice' : 'Facing the axe';
    return { pct, label };
  })());
  const morale = $derived((() => {
    const pct = Math.max(0, Math.min(100, team?.morale ?? 50));
    return pct >= 75 ? 'Excellent' : pct >= 55 ? 'High' : pct >= 40 ? 'Good' : pct >= 20 ? 'Low' : 'Very low';
  })());

  function opponent(fixture) {
    if (!fixture || !save) return null;
    return byId.get(fixture.homeTeamId === save.userTeamId ? fixture.awayTeamId : fixture.homeTeamId);
  }

  function isHome(fixture) { return fixture?.homeTeamId === save?.userTeamId; }

  function resultFor(fixture) {
    const userGoals = isHome(fixture) ? fixture.homeGoals : fixture.awayGoals;
    const opponentGoals = isHome(fixture) ? fixture.awayGoals : fixture.homeGoals;
    return { score: `${userGoals}—${opponentGoals}`, tone: userGoals > opponentGoals ? 'win' : userGoals < opponentGoals ? 'loss' : 'draw' };
  }

  function openWaiting(item) {
    if (item.action) item.action();
    else navigateTo(item.destination);
  }

  async function centreRail() {
    await tick();
    if (!railEl || !activeCardEl) return;
    railEl.scrollLeft = Math.max(0, activeCardEl.offsetLeft - (railEl.clientWidth - activeCardEl.offsetWidth) / 2);
  }

  async function closeWindow(dd) {
    const s = await getSave();
    const cur = new Date(s.currentDate);
    const afterDeadline = dd.window === 'summer' ? new Date(cur.getFullYear(), 8, 2) : new Date(cur.getFullYear(), 1, 2);
    const before = (s.inboundOffers ?? []).filter((offer) => offer.status === 'expired').length;
    const expiredOffers = (s.inboundOffers ?? []).map((offer) => offer.status === 'pending' ? { ...offer, status: 'expired' } : offer);
    const expiredCount = expiredOffers.filter((offer) => offer.status === 'expired').length - before;
    await patchSave({ currentDate: afterDeadline.toISOString(), deadlineHoursUsed: null, inboundOffers: expiredOffers });
    toast(expiredCount > 0 ? `Transfer window closed — ${expiredCount} pending offer${expiredCount > 1 ? 's' : ''} expired.` : 'Transfer window closed. Back to business!', 'info', 5000);
    screenTicks.home++;
  }

  async function skipHour() {
    if (deadlineBusy) return;
    deadlineBusy = true;
    try {
      const s = await getSave();
      const used = s.deadlineHoursUsed || 0;
      const [deals, newOffers] = await Promise.all([simulateAITransfers(s).catch(() => []), generateAIOffers().catch(() => [])]);
      const newUsed = used + 1;
      await patchSave({ deadlineHoursUsed: newUsed });
      const parts = [];
      if (deals.length) parts.push(`${deals.length} AI deal${deals.length > 1 ? 's' : ''}`);
      if (newOffers.length) parts.push(`${newOffers.length} offer${newOffers.length > 1 ? 's' : ''} for your players`);
      toast(parts.length ? `Hour ${newUsed}: ${parts.join(' · ')}!` : `Hour ${newUsed}: Quiet on the market. (${10 - newUsed} left)`, parts.length ? 'success' : 'info', 5000);
      if (deals.length) {
        const dealList = deals.slice(0, 5).map((deal) => `${deal.playerName}: ${deal.fromTeamName} → ${deal.toTeamName}`).join('\n');
        const extra = deals.length > 5 ? `\n…and ${deals.length - 5} more` : '';
        await addNewsItem(_makeNewsItem('transfer_in', `Deadline Day — Hour ${newUsed}`, `${deals.length} deal${deals.length > 1 ? 's' : ''} completed:\n${dealList}${extra}`, { gw: s.currentGameweek, date: s.currentDate, icon: '↔' }));
      }
      if (newUsed >= 10) await closeWindow(ddInfo);
      else screenTicks.home++;
    } catch (error) {
      console.error('Deadline hour error:', error);
      toast('Error simulating deadline hour.', 'error');
    } finally {
      deadlineBusy = false;
    }
  }

  async function doEndOfSeason() {
    if (eoyBusy) return;
    eoyBusy = true;
    try { await handleEndOfSeason(); }
    finally { eoyBusy = false; }
  }

  async function load() {
    await openDB();
    const s = await getSave();
    if (!s || s._deleted) return;
    cloudSignedIn = isSignedIn();
    save = s;
    const [club, players, allTeams, allPlayers, allFixtures, nextFixtures, tableSlice] = await Promise.all([
      getTeam(s.userTeamId), getPlayersByTeam(s.userTeamId), getAllTeams(), getAllPlayers(), getAllFixtures(),
      getUpcomingForTeam(s.userTeamId), getTableSliceAroundTeam(s.userTeamId, 2),
    ]);
    team = club;
    squadSize = players.length;
    byId = new Map(allTeams.map((item) => [item.id, item]));
    playerById = new Map(allPlayers.map((item) => [item.id, item]));
    past = allFixtures.filter((fixture) => fixture.played && (fixture.homeTeamId === s.userTeamId || fixture.awayTeamId === s.userTeamId)).sort((a, b) => a.gameweek - b.gameweek).slice(-3);
    upcoming = nextFixtures;
    slice = tableSlice;

    const managerName = s.managerName || 'The Manager';
    const managerAvatar = document.getElementById('mgr-av');
    if (managerAvatar) managerAvatar.textContent = managerName.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase();

    isEnd = s.currentGameweek > getEffectiveTotalGW(s);
    ddInfo = isDeadlineDay(s);
    onDeadlineDay = !isEnd && ddInfo.isDeadline;
    windowLabel = ddInfo.window === 'summer' ? 'Summer' : 'Winter';
    hoursLeft = 10 - (s.deadlineHoursUsed || 0);
    loaded = true;
    await centreRail();
    if (onDeadlineDay && hoursLeft <= 0) { await closeWindow(ddInfo); return; }
    if (onDeadlineDay) {
      const notifyKey = `deadlineDayNotified_${windowLabel}_${s.season}`;
      if (!s[notifyKey]) {
        await patchSave({ [notifyKey]: true, deadlineHoursUsed: s.deadlineHoursUsed || 0 });
        toast(`Transfer Deadline Day! The ${windowLabel} window closes after 10 hours.`, 'info', 7000);
        await addNewsItem(_makeNewsItem('transfer_in', `${windowLabel} Transfer Deadline Day`, `The ${windowLabel} transfer window is about to close. Simulate up to 10 last-minute hours before it shuts.`, { gw: s.currentGameweek, date: s.currentDate, icon: '↔' }));
      }
    }
  }

  $effect(() => {
    // renderHome() remains an imperative bridge for match and squad events.
    void screenTicks.home;
    load();
  });
</script>

<div class="home-screen">
  {#if !loaded}
    <div class="loading">Loading your season…</div>
  {:else}
    <header class="club-bar">
      <Crest size={28} label={`${team?.name ?? 'Club'} crest`} />
      <div class="club-copy">
        <strong>{team?.name}</strong>
        <span>{myRow?.displayPosition ?? myRow?.position ?? '—'}{myRow ? positionSuffix(myRow.displayPosition ?? myRow.position) : ''} · {myRow?.points ?? 0} pts · <Money value={team?.budget ?? 0} size="sm" tone="muted" /></span>
      </div>
      <button id="btn-inbox-header" class="icon-button" aria-label="Inbox" onclick={() => navigateTo('inbox')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 5h16v14H4zM4 7l8 6 8-6" /></svg>
        <span id="h-inbox-badge" class="badge" style:display={unread.length ? 'grid' : 'none'}>{unread.length > 9 ? '9+' : unread.length}</span>
      </button>
    </header>

    <main>
      <section class="season-stage" aria-labelledby="season-title">
        <div class="section-label" id="season-title">The season · swipe to move through it</div>
        <div class="season-rail" bind:this={railEl}>
          {#each past as fixture (fixture.id)}
            {@const result = resultFor(fixture)}
            <article class="rail-card result-card">
              <span>GW{fixture.gameweek}</span><strong class={result.tone}>{result.score}</strong><small>{opponent(fixture)?.name ?? 'Opponent'}</small>
            </article>
          {/each}
          {#if next}
            <article class="rail-card active-card" bind:this={activeCardEl}>
              <div class="next-meta"><span>Gameweek {next.gameweek}</span><span>{fmt.dateShort(next.date)}</span></div>
              <strong>{opponent(next)?.name ?? 'Opponent'}</strong>
              <p>{isHome(next) ? team?.stadium ?? 'Home' : 'Away'} · {isHome(next) ? 'Home' : 'Away'}</p>
              <FormGuide form={form} />
            </article>
          {:else}
            <article class="rail-card active-card complete" bind:this={activeCardEl}>
              <span>Season complete</span><strong>Full time.</strong><p>Your final position is {myRow?.displayPosition ?? myRow?.position ?? '—'}.</p>
            </article>
          {/if}
          {#each future as fixture (fixture.id)}
            <article class="rail-card future-card"><span>GW{fixture.gameweek}</span><strong>{opponent(fixture)?.name ?? 'Opponent'}</strong><small>{isHome(fixture) ? 'H' : 'A'} · {fmt.dateShort(fixture.date)}</small></article>
          {/each}
        </div>
        <div class="season-progress"><div class="track"><span style:width={`${progress}%`}></span><i style:left={`${progress}%`}></i></div><span>{Math.min(save.currentGameweek, totalGameweeks)} / {totalGameweeks}</span></div>
      </section>

      <section class="primary-action" aria-label="Next action">
        {#if !isEnd && !onDeadlineDay}
          <Button id="btn-adv-header" size="lg" full onclick={() => navigateTo('match')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7z" /></svg>Play gameweek {save.currentGameweek}</Button>
        {:else if isEnd}
          <Button id="btn-eoy-header" size="lg" full disabled={eoyBusy} onclick={doEndOfSeason}>{eoyBusy ? 'Preparing next season…' : 'Start next season'}</Button>
        {:else}
          <Button id="btn-deadline-header" size="lg" full disabled={deadlineBusy} onclick={skipHour}>{deadlineBusy ? 'Simulating…' : `Skip one hour · ${hoursLeft} left`}</Button>
        {/if}
      </section>

      <section class="pulse-grid" aria-label="Club pulse">
        <div><span>Form</span><FormGuide form={form} size="sm" /></div><div><span>Morale</span><strong>{morale}</strong></div><div><span>Board</span><strong>{board.label}</strong></div><div><span>Squad</span><strong>{squadSize} players</strong></div>
      </section>
      {#if save?.boardObjective}
        <button class="objective" onclick={() => navigateTo('competitions')}><span>Board objective</span><strong>{save.boardObjective.label}</strong><i><b style:width={`${board.pct}%`}></b></i></button>
      {/if}
      <nav class="club-links" aria-label="Club areas"><button onclick={() => navigateTo('academy')}>Academy</button><button onclick={() => navigateTo('trophies')}>Trophies</button><button onclick={() => navigateTo('settings')}>Settings</button></nav>
    </main>

    <section class="waiting-sheet" aria-labelledby="waiting-title">
      <div class="grabber"></div><div class="waiting-heading"><span id="waiting-title">Waiting on you</span><b>{waitingItems.length}</b></div>
      {#if waitingItems.length}
        <div class="waiting-list">
          {#each waitingItems as item (item.id)}
            <button onclick={() => openWaiting(item)}><span class="waiting-icon {item.tone}">{#if item.tone === 'good'}↔{:else if item.tone === 'warn'}!{:else}●{/if}</span><strong>{item.label}</strong><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
          {/each}
        </div>
      {:else}<p class="all-clear">Nothing needs a decision. Your next match is ready.</p>{/if}
    </section>
  {/if}
</div>

<script module>
  function positionSuffix(position) {
    const n = Number(position);
    if (n % 100 >= 11 && n % 100 <= 13) return 'th';
    return n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  }
</script>

<style>
  .home-screen { position: relative; min-height: 100%; display: flex; flex-direction: column; color: var(--color-tx); background: radial-gradient(circle at 50% 34%, color-mix(in oklch, var(--color-club) 11%, transparent), transparent 34rem), var(--color-ground); font-family: var(--font-body); }
  .loading { min-height: 100dvh; display: grid; place-items: center; color: var(--color-tx-3); font-size: 13px; }
  .club-bar { display: flex; align-items: center; gap: 11px; padding: 18px 20px 0; }
  .club-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; }
  .club-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
  .club-copy span { margin-top: 2px; color: var(--color-tx-3); font: 600 10px/1.4 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; }
  .icon-button { position: relative; width: 44px; height: 44px; display: grid; place-items: center; color: var(--color-tx-2); background: transparent; border: 1px solid var(--color-line); border-radius: 50%; cursor: pointer; }
  .icon-button svg { width: 18px; }
  .badge { position: absolute; top: -2px; right: -2px; min-width: 17px; height: 17px; padding: 0 4px; place-items: center; color: var(--color-on-accent); background: var(--color-accent); border: 2px solid var(--color-ground); border-radius: 999px; font: 700 8px/1 var(--font-mono); }
  main { width: 100%; max-width: 1040px; margin: 0 auto; padding: 26px 0 24px; }
  .section-label, .waiting-heading { color: var(--color-tx-3); font: 600 10px/1 var(--font-mono); letter-spacing: .16em; text-transform: uppercase; }
  .section-label { padding: 0 20px 11px; }
  .season-rail { display: flex; align-items: stretch; gap: 9px; padding: 0 max(20px, calc((100vw - 1040px) / 2)); overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-inline: contain; scrollbar-width: none; }
  .season-rail::-webkit-scrollbar { display: none; }
  .rail-card { flex: 0 0 78px; min-height: 116px; scroll-snap-align: center; display: flex; flex-direction: column; justify-content: center; gap: 5px; padding: 10px; border-left: 1px solid var(--color-line); }
  .rail-card > span, .rail-card small { color: var(--color-tx-3); font: 600 9px/1.25 var(--font-mono); letter-spacing: .07em; text-transform: uppercase; }
  .result-card strong { font: 700 19px/1 var(--font-display); }
  .result-card small, .future-card strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .win { color: var(--color-live); } .loss { color: var(--color-bad); } .draw { color: var(--color-tx-2); }
  .active-card { position: relative; flex-basis: min(64vw, 320px); min-height: 174px; justify-content: flex-start; padding: 17px; overflow: hidden; background: linear-gradient(155deg, color-mix(in oklch, var(--color-club) 17%, transparent), color-mix(in oklch, var(--color-surface) 92%, transparent)); border: 1px solid color-mix(in oklch, var(--color-club) 45%, var(--color-line)); border-radius: var(--radius-card); box-shadow: 0 18px 52px rgba(0,0,0,.28); }
  .active-card::after { content: ''; position: absolute; inset: 0 auto 0 -45%; width: 42%; background: linear-gradient(90deg, transparent, color-mix(in oklch, var(--color-tx) 6%, transparent), transparent); animation: sweep 4.2s var(--ease-in-out) infinite; pointer-events: none; }
  .next-meta { display: flex; justify-content: space-between; color: var(--color-tx-2); font: 600 9px/1 var(--font-mono); letter-spacing: .1em; text-transform: uppercase; }
  .next-meta span:first-child { color: color-mix(in oklch, var(--color-club) 65%, var(--color-tx)); }
  .active-card > strong { margin-top: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 800 clamp(28px, 7vw, 42px)/.95 var(--font-display); letter-spacing: -.025em; }
  .active-card p { color: var(--color-tx-2); font-size: 12px; }
  .active-card :global(.form) { margin-top: auto; }
  .active-card.complete > span { color: var(--color-accent); }
  .future-card { justify-content: center; }
  .future-card strong { font-size: 12px; }
  .season-progress { display: flex; align-items: center; gap: 10px; padding: 15px 20px 0; color: var(--color-tx-3); font: 600 10px/1 var(--font-mono); }
  .track { position: relative; flex: 1; height: 2px; background: var(--color-line); }
  .track span { display: block; height: 100%; background: var(--color-club); }
  .track i { position: absolute; top: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px; background: var(--color-tx); border-radius: 50%; }
  .primary-action { padding: 24px 20px 0; }
  .primary-action :global(button) { border-radius: var(--radius-card); text-transform: uppercase; font-family: var(--font-display); font-size: 17px; font-weight: 800; letter-spacing: .04em; box-shadow: 0 14px 40px color-mix(in oklch, var(--color-accent) 19%, transparent); }
  .primary-action svg { width: 18px; fill: currentColor; }
  .pulse-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin: 24px 20px 0; overflow: hidden; background: var(--color-line); border: 1px solid var(--color-line); border-radius: var(--radius-card); }
  .pulse-grid > div { min-height: 62px; display: flex; flex-direction: column; justify-content: center; gap: 7px; padding: 11px 13px; background: color-mix(in oklch, var(--color-surface) 92%, transparent); }
  .pulse-grid span, .objective span { color: var(--color-tx-3); font: 600 9px/1 var(--font-mono); letter-spacing: .1em; text-transform: uppercase; }
  .pulse-grid strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .objective { width: calc(100% - 40px); display: grid; grid-template-columns: 1fr auto; gap: 7px 12px; margin: 12px 20px 0; padding: 13px; text-align: left; color: var(--color-tx); background: var(--color-surface); border: 1px solid var(--color-line); border-radius: var(--radius-card); cursor: pointer; }
  .objective strong { font-size: 12px; }
  .objective i { grid-column: 1 / -1; height: 3px; overflow: hidden; background: var(--color-raised); border-radius: 2px; }
  .objective b { display: block; height: 100%; background: var(--color-club); }
  .club-links { display: flex; gap: 8px; padding: 12px 20px 0; }
  .club-links button { min-height: 44px; flex: 1; color: var(--color-tx-2); background: transparent; border: 1px solid var(--color-line); border-radius: var(--radius-bug); font: 600 12px/1 var(--font-body); cursor: pointer; }
  .waiting-sheet { width: min(100% - 24px, 1016px); margin: auto auto 0; padding: 12px 16px calc(92px + env(safe-area-inset-bottom, 0px)); background: linear-gradient(180deg, var(--color-raised), var(--color-surface)); border: 1px solid var(--color-line); border-bottom: 0; border-radius: var(--radius-sheet) var(--radius-sheet) 0 0; box-shadow: 0 -18px 48px rgba(0,0,0,.24); }
  .grabber { width: 38px; height: 4px; margin: 0 auto 14px; background: color-mix(in oklch, var(--color-tx) 22%, transparent); border-radius: 3px; }
  .waiting-heading { display: flex; align-items: center; gap: 7px; padding-bottom: 9px; }
  .waiting-heading b { display: grid; min-width: 17px; height: 17px; place-items: center; color: var(--color-on-accent); background: var(--color-accent); border-radius: 99px; font-size: 9px; }
  .waiting-list { max-height: 122px; overflow-y: auto; }
  .waiting-list button { width: 100%; min-height: 54px; display: flex; align-items: center; gap: 11px; padding: 7px 0; text-align: left; color: var(--color-tx); background: transparent; border: 0; border-top: 1px solid var(--color-line); cursor: pointer; }
  .waiting-list button:first-child { border-top: 0; }
  .waiting-icon { width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 10px; font: 700 14px/1 var(--font-mono); }
  .waiting-icon.good { color: var(--color-live); background: color-mix(in oklch, var(--color-live) 12%, transparent); }
  .waiting-icon.warn { color: var(--color-warn); background: color-mix(in oklch, var(--color-warn) 12%, transparent); }
  .waiting-icon.neutral { color: var(--color-tx-2); background: var(--color-raised-2); }
  .waiting-list strong { min-width: 0; flex: 1; font-size: 13px; font-weight: 500; }
  .waiting-list svg { width: 16px; flex: 0 0 auto; fill: none; stroke: var(--color-tx-3); stroke-width: 2; }
  .all-clear { padding: 7px 0 12px; color: var(--color-tx-2); font-size: 13px; }
  button:focus-visible { outline: 3px solid var(--color-accent); outline-offset: 3px; }
  @keyframes sweep { from { transform: translateX(0); } to { transform: translateX(360%); } }
  @media (min-width: 769px) { .club-bar { max-width: 1040px; width: 100%; margin: 0 auto; padding-top: 24px; } .season-rail { padding-inline: 20px; } .active-card { flex-basis: 360px; } .pulse-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } .waiting-sheet { padding-bottom: 24px; } }
  @media (max-width: 420px) { main { padding-top: 22px; } .active-card { flex-basis: 68vw; } .waiting-sheet { width: calc(100% - 16px); } }
</style>
