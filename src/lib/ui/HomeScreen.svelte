<script>
  import { getSave, getTeam, getPlayersByTeam, getAllTeams, getAllPlayers, openDB } from '../../modules/db.js';
  import { getTableSliceAroundTeam } from '../../modules/standings.js';
  import { getLastResultForTeam, getNextFixtureForTeam } from '../../modules/fixtures.js';
  import { isDeadlineDay, generateAIOffers, simulateAITransfers } from '../../modules/transfers.js';
  import { patchSave } from '../../modules/save.js';
  import { getEffectiveTotalGW } from '../../modules/gameweek.js';
  import { fmt, navigateTo, toast } from '../../ui/helpers.js';
  import { handleEndOfSeason } from '../../ui/home_transfers.js';
  import { _makeNewsItem, addNewsItem } from '../../ui/inbox.js';
  import { screenTicks } from '../state/screens.svelte.js';

  let loaded = $state(false);
  let save = $state(null);
  let team = $state(null);
  let squadSize = $state(0);
  let byId = $state(new Map());
  let prev = $state(null);
  let next = $state(null);
  let slice = $state([]);
  let topScorers = $state([]);
  let topAssists = $state([]);

  let isEnd = $state(false);
  let ddInfo = $state({ isDeadline: false, window: null });
  let onDeadlineDay = $state(false);
  let windowLabel = $state('');
  let hoursLeft = $state(10);
  let eoyBusy = $state(false);
  let deadlineBusy = $state(false);

  const myRow = $derived(slice.find(r => r.isUserTeam) ?? null);
  const form = $derived(myRow?.form ?? []);
  const morale = $derived((() => {
    const wr = myRow?.played > 0 ? myRow.won / myRow.played : 0;
    const label = wr > 0.7 ? 'Excellent' : wr > 0.5 ? 'High' : wr > 0.35 ? 'Good' : myRow?.played > 0 ? 'Low' : 'Neutral';
    const pct = Math.min(100, myRow?.points ? myRow.points * 3 : 50);
    return { label, pct };
  })());
  const board = $derived((() => {
    const js = save?.jobSecurity ?? 65;
    const pct = Math.max(0, Math.min(100, js));
    const label = pct >= 75 ? 'Secure' : pct >= 45 ? 'Under Scrutiny' : pct >= 20 ? 'On Notice' : 'Facing the Axe';
    const color = pct >= 60 ? 'var(--color-live)' : pct >= 30 ? 'var(--color-warn)' : 'var(--color-bad)';
    return { pct, label, color };
  })());

  async function closeWindow(dd) {
    const s = await getSave();
    const cur = new Date(s.currentDate);
    const afterDeadline = dd.window === 'summer'
      ? new Date(cur.getFullYear(), 8, 2)
      : new Date(cur.getFullYear(), 1, 2);
    const before = (s.inboundOffers ?? []).filter(o => o.status === 'expired').length;
    const expiredOffers = (s.inboundOffers ?? []).map(o => o.status === 'pending' ? { ...o, status: 'expired' } : o);
    const expiredCount = expiredOffers.filter(o => o.status === 'expired').length - before;
    await patchSave({ currentDate: afterDeadline.toISOString(), deadlineHoursUsed: null, inboundOffers: expiredOffers });
    if (expiredCount > 0) {
      toast(`⏰ Transfer window closed — ${expiredCount} pending offer${expiredCount > 1 ? 's' : ''} expired.`, 'info', 5000);
    } else {
      toast('⏰ Transfer window closed. Back to business!', 'info', 4000);
    }
    screenTicks.home++;
  }

  async function skipHour() {
    if (deadlineBusy) return;
    deadlineBusy = true;
    try {
      const sv = await getSave();
      const used = sv.deadlineHoursUsed || 0;
      const [deals, newOffers] = await Promise.all([
        simulateAITransfers(sv).catch(() => []),
        generateAIOffers().catch(() => []),
      ]);
      const newUsed = used + 1;
      await patchSave({ deadlineHoursUsed: newUsed });

      const parts = [];
      if (deals.length) parts.push(`${deals.length} AI deal${deals.length > 1 ? 's' : ''}`);
      if (newOffers.length) parts.push(`${newOffers.length} offer${newOffers.length > 1 ? 's' : ''} for your players`);
      if (parts.length) {
        toast(`⏰ Hour ${newUsed}: ${parts.join(' · ')}!`, 'success', 5000);
      } else {
        toast(`⏰ Hour ${newUsed}: Quiet on the market. (${10 - newUsed} left)`, 'info', 3500);
      }

      if (deals.length) {
        const dealList = deals.slice(0, 5).map(d => `${d.playerName}: ${d.fromTeamName} → ${d.toTeamName}`).join('\n');
        const extra = deals.length > 5 ? `\n…and ${deals.length - 5} more` : '';
        await addNewsItem(_makeNewsItem('transfer_in',
          `⏰ Deadline Day — Hour ${newUsed}`,
          `${deals.length} deal${deals.length > 1 ? 's' : ''} completed:\n${dealList}${extra}`,
          { gw: sv.currentGameweek, date: sv.currentDate, icon: '⏰' }));
      }

      if (newUsed >= 10) {
        toast('All deadline hours done. Closing transfer window…', 'info', 3000);
        await new Promise(r => window.setTimeout(r, 1200));
        await closeWindow(ddInfo);
      } else {
        screenTicks.home++;
      }
    } catch (err) {
      console.error('Deadline hour error:', err);
      toast('Error simulating deadline hour.', 'error');
    } finally {
      deadlineBusy = false;
    }
  }

  async function doEndOfSeason() {
    if (eoyBusy) return;
    eoyBusy = true;
    try {
      await handleEndOfSeason();
    } finally {
      eoyBusy = false;
    }
  }

  async function load() {
    // See LeagueScreen.svelte — openDB() is idempotent, safe to call again here.
    await openDB();
    const s = await getSave();
    if (!s || s._deleted) return;
    save = s;
    team = await getTeam(s.userTeamId);
    const players = await getPlayersByTeam(s.userTeamId);
    squadSize = players.length;
    const allTeams = await getAllTeams();
    byId = new Map(allTeams.map(t => [t.id, t]));
    [prev, next, slice] = await Promise.all([
      getLastResultForTeam(s.userTeamId),
      getNextFixtureForTeam(s.userTeamId),
      getTableSliceAroundTeam(s.userTeamId, 2),
    ]);

    const allPlayers = await getAllPlayers();
    topScorers = [...allPlayers].filter(p => (p.goals || 0) > 0).sort((a, b) => b.goals - a.goals).slice(0, 7);
    topAssists = [...allPlayers].filter(p => (p.assists || 0) > 0).sort((a, b) => b.assists - a.assists).slice(0, 7);

    const mgrName = s.managerName || 'The Manager';
    const mgrInitials = mgrName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const mgrAvEl = document.getElementById('mgr-av');
    if (mgrAvEl) mgrAvEl.textContent = mgrInitials;

    isEnd = s.currentGameweek > getEffectiveTotalGW(s);
    ddInfo = isDeadlineDay(s);
    onDeadlineDay = !isEnd && ddInfo.isDeadline;
    windowLabel = ddInfo.window === 'summer' ? 'Summer' : 'Winter';
    hoursLeft = 10 - (s.deadlineHoursUsed || 0);

    loaded = true;

    if (onDeadlineDay && hoursLeft <= 0) {
      // Already done all 10 hours — auto-close on next tick rather than
      // leaving a dead "0 left" button on screen.
      await closeWindow(ddInfo);
      return;
    }

    if (onDeadlineDay) {
      const notifyKey = `deadlineDayNotified_${windowLabel}_${s.season}`;
      if (!s[notifyKey]) {
        await patchSave({ [notifyKey]: true, deadlineHoursUsed: s.deadlineHoursUsed || 0 });
        toast(`⏰ Transfer Deadline Day! The ${windowLabel} window closes after 10 hours. Keep pressing "Skip One Hour" to simulate last-minute deals.`, 'info', 7000);
        await addNewsItem(_makeNewsItem('transfer_in',
          `⏰ ${windowLabel} Transfer Deadline Day`,
          `The ${windowLabel} transfer window is about to close. Press "Skip One Hour" up to 10 times to simulate last-minute AI activity — deals and inbound offers for your players. The window closes automatically after all 10 hours.`,
          { gw: s.currentGameweek, date: s.currentDate, icon: '⏰' }));
      }
    }
  }

  $effect(() => {
    // renderHome() (src/ui/home_transfers.js) is still called imperatively
    // from MatchScreen.svelte and squad_tactics_offers.js after a match, a
    // squad change, etc. — it now just bumps this tick, regardless of
    // whether Home is the visible screen, matching the old behaviour of
    // always writing into #screen-home's (always-mounted) DOM.
    void screenTicks.home;
    load();
  });

  function resultClass(f) {
    const isHome = f.homeTeamId === save.userTeamId;
    const ug = isHome ? f.homeGoals : f.awayGoals;
    const og = isHome ? f.awayGoals : f.homeGoals;
    return ug > og ? 'win' : ug < og ? 'loss' : 'draw';
  }
</script>

<div class="home-screen">
  <div class="home-hdr">
    <div class="home-hdr-top">
      <div>
        <div class="home-eyebrow">Dashboard</div>
        <div class="home-title">Overview</div>
      </div>
      <div class="home-hdr-meta">
        <div class="home-date">{save ? fmt.date(save.currentDate) : '—'}</div>
        <div class="home-season-badge">Season {save?.season ?? '—'}</div>
      </div>
    </div>
    <div class="home-hdr-actions">
      {#if loaded && !isEnd && !onDeadlineDay}
        <button id="btn-adv-header" class="action-btn play" onclick={() => navigateTo('match')}>▶ Play Next Match</button>
      {/if}
      {#if loaded && isEnd}
        <button id="btn-eoy-header" class="action-btn eoy" disabled={eoyBusy} onclick={doEndOfSeason}>🏆 Next Season →</button>
      {/if}
      {#if loaded && onDeadlineDay}
        <button id="btn-deadline-header" class="action-btn deadline" disabled={deadlineBusy} onclick={skipHour}>
          {deadlineBusy ? '⏳ Simulating…' : `⏰ Skip One Hour (${hoursLeft} left)`}
        </button>
      {/if}
      <button class="quick-btn" onclick={() => navigateTo('academy')}>Academy</button>
      <button class="quick-btn" onclick={() => navigateTo('trophies')}>Trophies</button>
      <button id="btn-inbox-header" class="icon-btn" aria-label="Inbox" onclick={() => navigateTo('inbox')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        <span id="h-inbox-badge" class="icon-badge" style="display:none"></span>
      </button>
      <button class="icon-btn" aria-label="Settings" onclick={() => navigateTo('settings')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
    </div>
  </div>

  {#if !loaded}
    <div class="home-empty">Loading…</div>
  {:else}
    <div class="home-body">
      <div class="hero-card">
        <div class="hero-crest">{team?.crest ?? ''}</div>
        <div class="hero-info">
          <div class="hero-name">{team?.name ?? ''}</div>
          <div class="hero-sub">
            <span>{team?.league || 'Premier League'}</span><span class="hero-dot"></span><span>{team?.stadium || ''}</span>
          </div>
        </div>
        <div class="mgr-chip">
          <div class="mgr-lbl">Manager</div>
          <div class="mgr-name">{save?.managerName || 'The Manager'}</div>
          <div class="mgr-since">Season {save?.season ?? ''}</div>
        </div>
      </div>

      <div class="fixtures-row">
        <div class="match-card">
          <div class="mc-lbl">Previous Result</div>
          {#if !prev}
            <div class="no-data">No matches played yet</div>
          {:else}
            <div class="mc-fix">
              <div class="mc-team">{byId.get(prev.homeTeamId)?.name || prev.homeTeamId}</div>
              <div class="mc-score {resultClass(prev)}">{prev.homeGoals}-{prev.awayGoals}</div>
              <div class="mc-team aw">{byId.get(prev.awayTeamId)?.name || prev.awayTeamId}</div>
            </div>
            <div class="mc-meta"><div class="mc-comp"><span class="mc-dot"></span>GW{prev.gameweek}</div><div>{fmt.dateShort(prev.date)}</div></div>
          {/if}
        </div>
        <div class="match-card">
          <div class="mc-lbl">Next Fixture</div>
          {#if !next}
            <div class="no-data live">Season Complete!</div>
          {:else}
            <div class="mc-fix">
              <div class="mc-team">{byId.get(next.homeTeamId)?.name || next.homeTeamId}</div>
              <div class="mc-score vs">vs</div>
              <div class="mc-team aw">{byId.get(next.awayTeamId)?.name || next.awayTeamId}</div>
            </div>
            <div class="mc-meta"><div class="mc-comp"><span class="mc-dot next"></span>GW{next.gameweek}</div><div>{fmt.dateShort(next.date)}</div></div>
          {/if}
        </div>
      </div>

      <div class="league-widget">
        <div class="wdg-hdr">
          <div class="wdg-title">League Table</div>
          <button class="wdg-link" onclick={() => navigateTo('competitions')}>Full →</button>
        </div>
        <div class="mini-tbl-hdr"><div>#</div><div>Club</div><div>W</div><div>D</div><div>L</div><div>PTS</div></div>
        <div class="mini-tbl-body">
          {#each slice as row (row.teamId)}
            <div class="mini-tbl-row" class:is-user={row.isUserTeam}>
              <div class="rc">{row.displayPosition ?? row.position}</div>
              <div class="tc">{row.teamName}</div>
              <div class="sc">{row.won}</div><div class="sc">{row.drawn}</div><div class="sc">{row.lost}</div>
              <div class="pc">{row.points}</div>
            </div>
          {/each}
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-tile"><div class="stl">Gameweek</div><div class="stv" style="color:var(--color-club)">{save.currentGameweek}</div><div class="sts">of {getEffectiveTotalGW(save)}</div></div>
        <div class="stat-tile"><div class="stl">Budget</div><div class="stv" style="color:#7c83e8">{fmt.money(team?.budget || 0)}</div><div class="sts">Transfer funds</div></div>
        <div class="stat-tile"><div class="stl">Squad</div><div class="stv" style="color:var(--color-live)">{squadSize}</div><div class="sts">players</div></div>
        <div class="stat-tile"><div class="stl">Season</div><div class="stv" style="color:var(--color-warn)">{save.season}</div><div class="sts">{team?.league || 'League'}</div></div>
      </div>

      <div class="form-card">
        <div class="form-title">Recent Form</div>
        <div class="form-pills">
          {#if form.length}
            {#each form as r, i (i)}<div class="form-pill {r}">{r}</div>{/each}
          {:else}
            <span class="form-empty">No matches played</span>
          {/if}
        </div>
        <div class="morale-block">
          <div class="morale-lbl">Morale</div>
          <div class="morale-track"><div class="morale-fill" style="width:{morale.pct}%"></div></div>
          <div class="morale-txt">{morale.label}</div>
        </div>
        {#if save?.boardObjective}
          <div class="morale-block">
            <div class="morale-lbl">Board</div>
            <div class="morale-track"><div class="morale-fill" style="width:{board.pct}%;background:{board.color}"></div></div>
            <div class="morale-txt">{board.label}</div>
          </div>
          <div class="board-objective-txt">Objective: {save.boardObjective.label}</div>
        {/if}
      </div>

      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-title">⚽ Top Scorers</div>
          {#if topScorers.length}
            {#each topScorers as p (p.id)}
              <div class="chart-row"><div class="chart-name">{p.name}</div><div class="chart-bar-track"><div class="chart-bar" style="width:{Math.round((p.goals / topScorers[0].goals) * 100)}%;background:linear-gradient(90deg,var(--color-live),#7fff9a)"></div></div><div class="chart-val">{p.goals}</div></div>
            {/each}
          {:else}
            <div class="chart-empty">Play matches to see stats</div>
          {/if}
        </div>
        <div class="chart-card">
          <div class="chart-title">🎯 Top Assists</div>
          {#if topAssists.length}
            {#each topAssists as p (p.id)}
              <div class="chart-row"><div class="chart-name">{p.name}</div><div class="chart-bar-track"><div class="chart-bar" style="width:{Math.round((p.assists / topAssists[0].assists) * 100)}%;background:linear-gradient(90deg,#7c83e8,#b8bcf7)"></div></div><div class="chart-val">{p.assists}</div></div>
            {/each}
          {:else}
            <div class="chart-empty">Play matches to see stats</div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .home-screen {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px 16px 24px;
    font-family: var(--font-body);
    color: var(--color-tx);
  }

  .home-hdr { flex-shrink: 0; margin-bottom: 16px; }
  .home-hdr-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .home-eyebrow {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--color-club);
    margin-bottom: 3px;
  }
  .home-title { font-family: var(--font-display); font-size: clamp(24px, 5vw, 32px); letter-spacing: 1px; line-height: 1; }
  .home-hdr-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
  .home-date { font-family: var(--font-mono); font-size: 11px; color: var(--color-tx-2); }
  .home-season-badge {
    background: var(--color-raised);
    border: 1px solid var(--color-line);
    padding: 3px 9px;
    border-radius: 14px;
    font-size: 10px;
    color: var(--color-tx-2);
    font-family: var(--font-mono);
  }

  .home-hdr-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
  .action-btn {
    padding: 10px 20px;
    min-height: 44px;
    border-radius: 9px;
    border: none;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .action-btn.play { background: var(--color-club); color: var(--color-on-club, #fff); }
  .action-btn.eoy { border: 2px solid var(--color-warn); background: transparent; color: var(--color-warn); }
  .action-btn.deadline { border: 2px solid #f97316; background: rgba(249,115,22,.12); color: #f97316; }
  .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .quick-btn {
    padding: 9px 14px;
    min-height: 44px;
    border-radius: 9px;
    border: 1px solid var(--color-line);
    background: var(--color-surface);
    color: var(--color-tx-2);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .quick-btn:hover { color: var(--color-tx); background: var(--color-raised); }

  .icon-btn {
    position: relative;
    width: 44px; height: 44px;
    border-radius: 9px;
    border: 1px solid var(--color-line);
    background: var(--color-surface);
    color: var(--color-tx-2);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }
  .icon-btn:hover { background: var(--color-raised); color: var(--color-tx); }
  .icon-badge {
    position: absolute; top: -4px; right: -4px;
    background: var(--color-warn);
    color: #14171c;
    font-size: 9px; font-family: var(--font-mono); font-weight: 700;
    min-width: 16px; height: 16px; border-radius: 99px;
    display: flex; align-items: center; justify-content: center;
    padding: 0 3px;
  }

  .home-empty { color: var(--color-tx-3); font-size: 12px; padding: 24px; text-align: center; }

  .home-body { display: grid; grid-template-columns: 1fr; gap: 14px; }
  @media (min-width: 900px) {
    .home-body { grid-template-columns: 1fr 1fr; }
    .hero-card, .fixtures-row, .stats-grid, .charts-grid { grid-column: 1 / -1; }
  }

  .hero-card {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    background: var(--color-surface);
    border: 1px solid var(--color-line);
    border-radius: 14px;
    padding: 16px;
  }
  .hero-crest { font-size: 40px; line-height: 1; }
  .hero-info { flex: 1; min-width: 140px; }
  .hero-name { font-family: var(--font-display); font-size: 22px; letter-spacing: 0.5px; }
  .hero-sub { display: flex; align-items: center; gap: 8px; color: var(--color-tx-2); font-size: 12px; margin-top: 2px; }
  .hero-dot { width: 3px; height: 3px; border-radius: 50%; background: var(--color-tx-3); }
  .mgr-chip {
    background: var(--color-raised);
    border: 1px solid var(--color-line);
    border-radius: 10px;
    padding: 8px 14px;
    text-align: right;
  }
  .mgr-lbl { font-size: 9px; color: var(--color-tx-3); text-transform: uppercase; letter-spacing: 1px; }
  .mgr-name { font-size: 13px; font-weight: 600; }
  .mgr-since { font-size: 10px; color: var(--color-tx-3); }

  .fixtures-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .match-card {
    background: var(--color-surface);
    border: 1px solid var(--color-line);
    border-radius: 14px;
    padding: 14px;
  }
  .mc-lbl { font-size: 10px; color: var(--color-tx-3); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .no-data { color: var(--color-tx-3); font-size: 12px; }
  .no-data.live { color: var(--color-live); }
  .mc-fix { display: flex; align-items: center; gap: 8px; }
  .mc-team { flex: 1; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mc-team.aw { text-align: right; }
  .mc-score { font-family: var(--font-display); font-size: 20px; letter-spacing: 1px; flex-shrink: 0; }
  .mc-score.vs { color: var(--color-tx-3); font-size: 14px; }
  .mc-score.win { color: var(--color-live); }
  .mc-score.loss { color: var(--color-bad); }
  .mc-meta { display: flex; justify-content: space-between; color: var(--color-tx-3); font-size: 10px; font-family: var(--font-mono); margin-top: 8px; }
  .mc-comp { display: flex; align-items: center; gap: 4px; }
  .mc-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--color-tx-3); }
  .mc-dot.next { background: var(--color-club); }

  .league-widget {
    background: var(--color-surface);
    border: 1px solid var(--color-line);
    border-radius: 14px;
    overflow: hidden;
  }
  .wdg-hdr { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--color-line); }
  .wdg-title { font-family: var(--font-display); font-size: 15px; letter-spacing: 0.5px; }
  .wdg-link { background: none; border: none; color: var(--color-club); font-size: 11px; font-weight: 600; cursor: pointer; padding: 0; }
  .mini-tbl-hdr, .mini-tbl-row {
    display: grid;
    grid-template-columns: 22px 1fr 22px 22px 22px 32px;
    gap: 4px;
    align-items: center;
    padding: 6px 14px;
  }
  .mini-tbl-hdr { font-family: var(--font-mono); font-size: 9px; color: var(--color-tx-3); }
  .mini-tbl-row { font-size: 12px; }
  .mini-tbl-row.is-user { background: color-mix(in oklch, var(--color-club) 12%, transparent); }
  .mini-tbl-row.is-user .tc { color: var(--color-tx); font-weight: 600; }
  .rc { color: var(--color-tx-3); font-family: var(--font-mono); font-size: 10px; }
  .tc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sc { text-align: center; color: var(--color-tx-2); font-family: var(--font-mono); font-size: 10px; }
  .pc { text-align: center; font-weight: 700; font-family: var(--font-mono); font-size: 12px; }

  .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  @media (min-width: 560px) { .stats-grid { grid-template-columns: repeat(4, 1fr); } }
  .stat-tile {
    background: var(--color-surface);
    border: 1px solid var(--color-line);
    border-radius: 12px;
    padding: 12px;
  }
  .stl { font-size: 10px; color: var(--color-tx-2); margin-bottom: 3px; }
  .stv { font-family: var(--font-display); font-size: clamp(18px, 3vw, 24px); line-height: 1; letter-spacing: 1px; }
  .sts { font-size: 9px; color: var(--color-tx-3); margin-top: 3px; }

  .form-card {
    background: var(--color-surface);
    border: 1px solid var(--color-line);
    border-radius: 14px;
    padding: 14px;
  }
  .form-title { font-size: 10px; color: var(--color-tx-3); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .form-pills { display: flex; gap: 5px; margin-bottom: 12px; }
  .form-empty { color: var(--color-tx-3); font-size: 12px; }
  .form-pill {
    width: 22px; height: 22px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; font-family: var(--font-mono);
  }
  .form-pill.W { background: color-mix(in oklch, var(--color-live) 20%, transparent); color: var(--color-live); }
  .form-pill.D { background: color-mix(in oklch, var(--color-warn) 18%, transparent); color: var(--color-warn); }
  .form-pill.L { background: color-mix(in oklch, var(--color-bad) 18%, transparent); color: var(--color-bad); }
  .morale-block { display: flex; align-items: center; gap: 10px; }
  .morale-lbl { font-size: 11px; color: var(--color-tx-2); flex-shrink: 0; }
  .morale-track { flex: 1; height: 6px; border-radius: 3px; background: var(--color-raised); overflow: hidden; }
  .morale-fill { height: 100%; background: var(--color-club); border-radius: 3px; }
  .morale-txt { font-size: 11px; font-weight: 600; flex-shrink: 0; }
  .board-objective-txt { font-size: 10px; color: var(--color-tx-3); margin-top: -4px; }

  .charts-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
  @media (min-width: 700px) { .charts-grid { grid-template-columns: 1fr 1fr; } }
  .chart-card {
    background: var(--color-surface);
    border: 1px solid var(--color-line);
    border-radius: 14px;
    padding: 14px;
  }
  .chart-title { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
  .chart-empty { color: var(--color-tx-3); font-size: 11px; padding: 8px 0; }
  .chart-row { display: grid; grid-template-columns: 90px 1fr 24px; align-items: center; gap: 8px; margin-bottom: 6px; }
  .chart-name { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chart-bar-track { height: 8px; border-radius: 4px; background: var(--color-raised); overflow: hidden; }
  .chart-bar { height: 100%; border-radius: 4px; }
  .chart-val { font-size: 11px; font-family: var(--font-mono); text-align: right; color: var(--color-tx-2); }
</style>
