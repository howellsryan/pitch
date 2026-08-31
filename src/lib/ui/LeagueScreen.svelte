<script>
  import { flip } from 'svelte/animate';
  import { getAllFixtures, getAllPlayers, getAllTeams, getSave, openDB } from '../../modules/db.js';
  import { getLeagueTable } from '../../modules/standings.js';
  import { fmt } from '../../ui/helpers.js';
  import { screenTicks } from '../state/screens.svelte.js';
  import Crest from './kit/Crest.svelte';

  let leagueName = $state('Premier League');
  let season = $state('2025/26');
  let userTeamId = $state(null);
  let rows = $state([]);
  let results = $state([]);
  let byId = $state(new Map());
  let allPlayers = $state([]);
  let allFixtures = $state([]);
  let leagues = $state([]);
  let selectedTeamId = $state(null);
  let loaded = $state(false);

  function zone(pos, total) {
    if (total === 20) {
      if (pos <= 4) return { cls:'ucl', label:'UCL' };
      if (pos <= 6) return { cls:'uel', label:'UEL' };
      if (pos === 7) return { cls:'uecl', label:'UECL' };
      if (pos >= 18) return { cls:'rel', label:'REL' };
    } else if (total === 24) {
      if (pos <= 2) return { cls:'ucl', label:'UP' };
      if (pos <= 6) return { cls:'uecl', label:'P/O' };
      if (pos >= 22) return { cls:'rel', label:'REL' };
    } else if (total === 18) {
      if (pos <= 4) return { cls:'ucl', label:'UCL' };
      if (pos <= 6) return { cls:'uel', label:'UEL' };
      if (pos >= 16) return { cls:'rel', label:'REL' };
    }
    return null;
  }

  function leagueForFixture(fixture) {
    return fixture.league
      ?? byId.get(fixture.homeTeamId)?.league
      ?? byId.get(fixture.awayTeamId)?.league
      ?? null;
  }

  async function loadLeague(nextLeague, preferredTeamId = null) {
    leagueName = nextLeague;
    const table = await getLeagueTable(nextLeague);
    rows = table.every(row => row.position === 0)
      ? [...table].sort((a, b) => a.teamName.localeCompare(b.teamName)).map((row, index) => ({ ...row, position:index + 1 }))
      : table;
    results = allFixtures
      .filter(fixture => fixture.played && fixture.competition === 'league' && leagueForFixture(fixture) === nextLeague)
      .sort((a, b) => b.gameweek - a.gameweek)
      .slice(0, 20);

    const preferredIsHere = preferredTeamId && rows.some(row => row.teamId === preferredTeamId);
    const currentIsHere = selectedTeamId && rows.some(row => row.teamId === selectedTeamId);
    selectedTeamId = preferredIsHere ? preferredTeamId : currentIsHere ? selectedTeamId : rows[0]?.teamId ?? null;
  }

  async function chooseLeague(nextLeague) {
    if (nextLeague === leagueName) return;
    await loadLeague(nextLeague);
  }

  async function load() {
    await openDB();
    const save = await getSave();
    if (!save || save._deleted) return;
    userTeamId = save.userTeamId;
    season = save.season || '2025/26';

    const [teams, players, fixtures] = await Promise.all([
      getAllTeams(), getAllPlayers(), getAllFixtures(),
    ]);
    byId = new Map(teams.map(team => [team.id, team]));
    allPlayers = players;
    allFixtures = fixtures;
    leagues = [...new Set(teams.map(team => team.league ?? 'Premier League'))]
      .sort((a, b) => {
        const priority = ['Premier League','Championship','League One','League Two','La Liga','Bundesliga','Serie A','Ligue 1','Eredivisie'];
        const ai = priority.indexOf(a), bi = priority.indexOf(b);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        return a.localeCompare(b);
      });

    await loadLeague(save.userLeague || 'Premier League', save.userTeamId);
    loaded = true;
  }

  $effect(() => {
    void screenTicks.competitions;
    load();
  });

  const totalTeams = $derived(rows.length);
  const selectedTeam = $derived(selectedTeamId ? byId.get(selectedTeamId) ?? null : null);
  const selectedRow = $derived(selectedTeamId ? rows.find(row => row.teamId === selectedTeamId) ?? null : null);
  const selectedPlayers = $derived.by(() => allPlayers
    .filter(player => player.teamId === selectedTeamId && player.inSquad !== false)
    .sort((a, b) =>
      (b.appearances ?? 0) - (a.appearances ?? 0)
      || (b.averageRating ?? 0) - (a.averageRating ?? 0)
      || (b.goals ?? 0) - (a.goals ?? 0)
      || a.name.localeCompare(b.name)
    ));
  const topPlayers = $derived(selectedPlayers.slice(0, 8));
  const clubResults = $derived(allFixtures
    .filter(fixture => fixture.played && (fixture.homeTeamId === selectedTeamId || fixture.awayTeamId === selectedTeamId))
    .sort((a, b) => b.gameweek - a.gameweek)
    .slice(0, 5));
</script>

<div class="league-screen">
  <div class="league-hdr">
    <div class="league-eyebrow">Competitions · Living World</div>
    <div class="league-title">{leagueName} <span class="league-season">{season}</span></div>
    <div class="league-switcher" aria-label="Choose competition">
      {#each leagues as league (league)}
        <button class:active={league === leagueName} onclick={() => chooseLeague(league)}>{league}</button>
      {/each}
    </div>
  </div>

  {#if !loaded}
    <div class="league-empty">Loading…</div>
  {:else}
    <div class="league-body">
      <div class="league-table-card">
        <div class="league-table-hdr">
          <div>#</div><div>Club</div><div>P</div><div>W</div><div>D</div><div>L</div>
          <div>GD</div><div>PTS</div><div class="form-col">Form</div>
        </div>
        <div class="league-table-rows">
          {#each rows as row (row.teamId)}
            <button
              class="league-row {row.teamId === userTeamId ? 'is-user' : ''} {row.teamId === selectedTeamId ? 'is-selected' : ''}"
              class:zone-ucl={zone(row.position, totalTeams)?.cls === 'ucl'}
              class:zone-uel={zone(row.position, totalTeams)?.cls === 'uel'}
              class:zone-uecl={zone(row.position, totalTeams)?.cls === 'uecl'}
              class:zone-rel={zone(row.position, totalTeams)?.cls === 'rel'}
              onclick={() => selectedTeamId = row.teamId}
              aria-label={`Inspect ${row.teamName}`}
              animate:flip={{ duration:400 }}
            >
              <div class="rc">{row.position}</div>
              <div class="tc"><span class="league-crest"><Crest team={byId.get(row.teamId)} size={20} label={`${row.teamName} crest`} /></span><span>{row.teamName}</span></div>
              <div class="sc">{row.played}</div>
              <div class="sc">{row.won}</div>
              <div class="sc">{row.drawn}</div>
              <div class="sc">{row.lost}</div>
              <div class="sc gd" class:pos={row.goalDifference >= 0}>{row.goalDifference >= 0 ? '+' : ''}{row.goalDifference}</div>
              <div class="pc">{row.points}</div>
              <div class="form-col form-mini">
                {#each (row.form || []) as form, index (index)}<span class="fdot fd-{form}">{form}</span>{/each}
              </div>
            </button>
          {/each}
        </div>
      </div>

      <div class="league-side">
        {#if selectedTeam}
          <section class="club-card" aria-label={`${selectedTeam.name} world profile`}>
            <div class="club-head">
              <Crest team={selectedTeam} size={38} label={`${selectedTeam.name} crest`} />
              <div class="club-title-wrap">
                <div class="club-kicker">Club snapshot</div>
                <div class="club-name">{selectedTeam.name}</div>
                <div class="club-meta">{selectedTeam.league} · Rep {selectedTeam.reputation ?? '—'}</div>
              </div>
            </div>

            <div class="club-metrics">
              <div><span>Position</span><strong>{selectedRow?.position ?? '—'}</strong></div>
              <div><span>Points</span><strong>{selectedRow?.points ?? 0}</strong></div>
              <div><span>GD</span><strong>{selectedRow ? `${selectedRow.goalDifference >= 0 ? '+' : ''}${selectedRow.goalDifference}` : '—'}</strong></div>
              <div><span>Budget</span><strong>{fmt.money(selectedTeam.budget ?? 0)}</strong></div>
            </div>

            <div class="club-form">
              <span>League form</span>
              <div class="form-mini">
                {#if !(selectedRow?.form?.length)}<em>No results yet</em>{/if}
                {#each (selectedRow?.form || []) as form, index (index)}<span class="fdot fd-{form}">{form}</span>{/each}
              </div>
            </div>

            <div class="club-section-title">Season leaders</div>
            <div class="player-leaders">
              {#if !topPlayers.length}
                <div class="league-empty compact">No squad data.</div>
              {:else}
                {#each topPlayers as player (player.id)}
                  <div class="player-leader">
                    <div class="player-main"><strong>{player.name}</strong><span>{player.position} · {player.appearances ?? 0} apps</span></div>
                    <div class="player-stats">
                      {#if player.position === 'GK'}<span>{player.cleanSheets ?? 0} CS</span>{:else}<span>{player.goals ?? 0} G</span><span>{player.assists ?? 0} A</span>{/if}
                      <b>{player.averageRating ? player.averageRating.toFixed(2) : '—'}</b>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>

            <div class="club-section-title">Last 5</div>
            <div class="club-last-five">
              {#if !clubResults.length}<span>No matches played yet.</span>{/if}
              {#each clubResults as fixture (fixture.id)}
                <div>
                  <span>GW{fixture.gameweek}</span>
                  <strong>{byId.get(fixture.homeTeamId)?.shortName || byId.get(fixture.homeTeamId)?.name || fixture.homeTeamId} {fixture.homeGoals}–{fixture.awayGoals} {byId.get(fixture.awayTeamId)?.shortName || byId.get(fixture.awayTeamId)?.name || fixture.awayTeamId}</strong>
                </div>
              {/each}
            </div>
          </section>
        {/if}

        <div class="league-results-card">
          <div class="league-results-hdr">{leagueName} · Recent Results</div>
          <div class="league-results-list">
            {#if !results.length}
              <div class="league-empty">No matches played yet.</div>
            {:else}
              {#each results as fixture (fixture.id)}
                <div class="result-row" class:is-user={fixture.homeTeamId === userTeamId || fixture.awayTeamId === userTeamId}>
                  <div class="result-gw">GW{fixture.gameweek}</div>
                  <div class="result-teams">
                    <span class="rth">{byId.get(fixture.homeTeamId)?.name || fixture.homeTeamId}</span>
                    <span class="rsc">{fixture.homeGoals} – {fixture.awayGoals}</span>
                    <span class="rta">{byId.get(fixture.awayTeamId)?.name || fixture.awayTeamId}</span>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .league-screen { display:flex; flex-direction:column; flex:1; min-height:0; overflow-y:auto; padding:18px 16px 24px; font-family:var(--font-body); color:var(--color-tx); }
  .league-hdr { margin-bottom:12px; flex-shrink:0; }
  .league-eyebrow { font-family:var(--font-mono); font-size:10px; letter-spacing:3px; text-transform:uppercase; color:var(--color-club); margin-bottom:3px; }
  .league-title { font-family:var(--font-display); font-size:clamp(24px,5vw,32px); letter-spacing:1px; line-height:1; }
  .league-season { color:var(--color-tx-2); font-size:.55em; margin-left:6px; }
  .league-switcher { display:flex; gap:6px; overflow-x:auto; padding:12px 0 2px; scrollbar-width:none; }
  .league-switcher::-webkit-scrollbar { display:none; }
  .league-switcher button { flex:0 0 auto; border:1px solid var(--color-line); background:var(--color-surface); color:var(--color-tx-2); border-radius:999px; padding:7px 10px; font:600 10px var(--font-mono); cursor:pointer; }
  .league-switcher button.active { border-color:color-mix(in oklch,var(--color-club) 55%,var(--color-line)); background:color-mix(in oklch,var(--color-club) 14%,var(--color-surface)); color:var(--color-tx); }
  .league-empty { color:var(--color-tx-3); font-size:12px; padding:24px; text-align:center; }
  .league-empty.compact { padding:10px; }
  .league-body { display:flex; flex-direction:column; gap:14px; flex:1; min-height:0; }
  .league-side { display:flex; flex-direction:column; gap:14px; min-width:0; }
  @media (min-width:900px) { .league-body { display:grid; grid-template-columns:minmax(0,1fr) 360px; align-items:start; } }

  .league-table-card, .league-results-card, .club-card { background:var(--color-surface); border:1px solid var(--color-line); border-radius:14px; overflow:hidden; }
  .league-table-hdr, .league-row { display:grid; grid-template-columns:22px 1fr 22px 22px 22px 22px 34px 32px 70px; gap:4px; align-items:center; padding:7px 12px; }
  .league-table-hdr { font-family:var(--font-mono); font-size:9px; letter-spacing:.5px; color:var(--color-tx-3); border-bottom:1px solid var(--color-line); }
  .league-row { width:100%; appearance:none; text-align:left; color:inherit; background:transparent; border:0; border-left:3px solid transparent; font:inherit; font-size:12px; cursor:pointer; transition:background .15s; }
  .league-row:hover, .league-row.is-selected { background:color-mix(in oklch,var(--color-tx) 5%,transparent); }
  .league-row.is-user { background:color-mix(in oklch,var(--color-club) 12%,transparent); border-left-color:var(--color-club); }
  .league-row.is-selected { outline:1px solid color-mix(in oklch,var(--color-club) 35%,transparent); outline-offset:-1px; }
  .league-row.is-user .tc { font-weight:600; color:var(--color-tx); }
  .league-row.zone-ucl { box-shadow:inset 3px 0 0 #3b82f6; }
  .league-row.zone-uel { box-shadow:inset 3px 0 0 #f97316; }
  .league-row.zone-uecl { box-shadow:inset 3px 0 0 var(--color-live); }
  .league-row.zone-rel { box-shadow:inset 3px 0 0 var(--color-bad); }
  .league-row.is-user.zone-ucl, .league-row.is-user.zone-uel, .league-row.is-user.zone-uecl, .league-row.is-user.zone-rel { box-shadow:none; }
  .rc { color:var(--color-tx-3); font-family:var(--font-mono); font-size:10px; }
  .tc { min-width:0; display:flex; align-items:center; gap:7px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tc > span:last-child { min-width:0; overflow:hidden; text-overflow:ellipsis; }
  .league-crest { width:20px; height:20px; flex:0 0 20px; display:grid; place-items:center; }
  .sc { text-align:center; color:var(--color-tx-2); font-family:var(--font-mono); font-size:10px; }
  .sc.gd { color:var(--color-bad); }
  .sc.gd.pos { color:var(--color-live); }
  .pc { text-align:center; font-weight:700; font-family:var(--font-mono); font-size:12px; }
  .form-col { display:flex; gap:2px; justify-content:flex-end; }

  .form-mini { display:flex; gap:2px; align-items:center; }
  .form-mini em { color:var(--color-tx-3); font:10px var(--font-mono); }
  .fdot { width:15px; height:15px; border-radius:3px; font-size:8px; font-family:var(--font-mono); font-weight:700; display:flex; align-items:center; justify-content:center; }
  .fd-W { background:color-mix(in oklch,var(--color-live) 20%,transparent); color:var(--color-live); }
  .fd-D { background:color-mix(in oklch,var(--color-warn) 18%,transparent); color:var(--color-warn); }
  .fd-L { background:color-mix(in oklch,var(--color-bad) 18%,transparent); color:var(--color-bad); }

  .club-card { padding:14px; }
  .club-head { display:flex; gap:11px; align-items:center; padding-bottom:12px; border-bottom:1px solid var(--color-line); }
  .club-title-wrap { min-width:0; }
  .club-kicker { color:var(--color-club); text-transform:uppercase; letter-spacing:1.4px; font:9px var(--font-mono); }
  .club-name { margin-top:2px; font:18px var(--font-display); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .club-meta { margin-top:2px; color:var(--color-tx-3); font:10px var(--font-mono); }
  .club-metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; padding:12px 0; }
  .club-metrics div { min-width:0; background:var(--color-surface-2); border-radius:8px; padding:8px 6px; }
  .club-metrics span { display:block; color:var(--color-tx-3); text-transform:uppercase; font:8px var(--font-mono); }
  .club-metrics strong { display:block; margin-top:3px; overflow:hidden; text-overflow:ellipsis; font:12px var(--font-mono); }
  .club-form { display:flex; justify-content:space-between; align-items:center; gap:10px; padding-bottom:12px; border-bottom:1px solid var(--color-line); color:var(--color-tx-2); font-size:11px; }
  .club-section-title { margin:13px 0 7px; color:var(--color-tx-3); text-transform:uppercase; letter-spacing:1px; font:9px var(--font-mono); }
  .player-leaders { display:flex; flex-direction:column; gap:2px; }
  .player-leader { display:flex; align-items:center; justify-content:space-between; gap:8px; border-radius:7px; padding:7px 8px; background:var(--color-surface-2); }
  .player-main { min-width:0; }
  .player-main strong { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:11px; }
  .player-main span { display:block; margin-top:1px; color:var(--color-tx-3); font:9px var(--font-mono); }
  .player-stats { flex:0 0 auto; display:flex; gap:7px; align-items:center; color:var(--color-tx-2); font:9px var(--font-mono); }
  .player-stats b { min-width:26px; text-align:right; color:var(--color-club); }
  .club-last-five { display:flex; flex-direction:column; gap:4px; }
  .club-last-five > span { color:var(--color-tx-3); font-size:10px; }
  .club-last-five div { display:flex; justify-content:space-between; gap:8px; color:var(--color-tx-3); font:9px var(--font-mono); }
  .club-last-five strong { color:var(--color-tx-2); font-weight:600; text-align:right; }

  .league-results-hdr { font-family:var(--font-display); font-size:15px; letter-spacing:.5px; padding:12px 14px; border-bottom:1px solid var(--color-line); }
  .league-results-list { max-height:480px; overflow-y:auto; padding:4px; }
  .result-row { padding:8px 10px; border-radius:8px; margin-bottom:2px; }
  .result-row.is-user { background:color-mix(in oklch,var(--color-club) 10%,transparent); }
  .result-gw { font-size:9px; color:var(--color-tx-3); font-family:var(--font-mono); margin-bottom:2px; }
  .result-teams { display:flex; align-items:center; gap:6px; font-size:12px; }
  .rth { flex:1; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .rta { flex:1; text-align:right; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .rsc { font-family:var(--font-display); font-size:14px; letter-spacing:1px; min-width:40px; text-align:center; flex-shrink:0; }

  @media (max-width:560px) {
    .league-screen { padding-inline:10px; }
    .league-table-hdr, .league-row { grid-template-columns:20px minmax(0,1fr) 36px 32px; padding-inline:8px; }
    .league-table-hdr > :nth-child(3), .league-table-hdr > :nth-child(4), .league-table-hdr > :nth-child(5), .league-table-hdr > :nth-child(6),
    .league-row > :nth-child(3), .league-row > :nth-child(4), .league-row > :nth-child(5), .league-row > :nth-child(6) { display:none; }
    .league-table-hdr .form-col, .league-row .form-col { display:none; }
    .club-metrics { grid-template-columns:repeat(2,1fr); }
  }
</style>
