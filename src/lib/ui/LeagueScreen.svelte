<script>
  import { flip } from 'svelte/animate';
  import { getAllFixtures, getAllTeams, getSave, openDB } from '../../modules/db.js';
  import { getLeagueTable } from '../../modules/standings.js';
  import { fmt } from '../../ui/helpers.js';
  import { screenTicks } from '../state/screens.svelte.js';

  let leagueName = $state('Premier League');
  let season = $state('2025/26');
  let userTeamId = $state(null);
  let rows = $state([]);
  let results = $state([]);
  let byId = $state(new Map());
  let loaded = $state(false);

  function zone(pos, total) {
    if (total === 20) {
      if (pos <= 4) return { cls: 'ucl', label: 'UCL' };
      if (pos <= 6) return { cls: 'uel', label: 'UEL' };
      if (pos === 7) return { cls: 'uecl', label: 'UECL' };
      if (pos >= 18) return { cls: 'rel', label: 'REL' };
    } else if (total === 24) {
      if (pos <= 2) return { cls: 'ucl', label: 'UP' };
      if (pos <= 6) return { cls: 'uecl', label: 'P/O' };
      if (pos >= 22) return { cls: 'rel', label: 'REL' };
    } else if (total === 18) {
      if (pos <= 4) return { cls: 'ucl', label: 'UCL' };
      if (pos <= 6) return { cls: 'uel', label: 'UEL' };
      if (pos >= 16) return { cls: 'rel', label: 'REL' };
    }
    return null;
  }

  async function load() {
    // This island mounts as soon as main.js runs, which can be before
    // boot()'s own openDB() call resolves (ui/renderers.js) — openDB() is
    // idempotent, so calling it again here just awaits the same connection.
    await openDB();
    const save = await getSave();
    if (!save || save._deleted) return;
    userTeamId = save.userTeamId;
    leagueName = save.userLeague || 'Premier League';
    season = save.season || '2025/26';

    const table = await getLeagueTable();
    rows = table.every(r => r.position === 0)
      ? [...table].sort((a, b) => a.teamName.localeCompare(b.teamName)).map((r, i) => ({ ...r, position: i + 1 }))
      : table;

    const teams = await getAllTeams();
    byId = new Map(teams.map(t => [t.id, t]));

    const fixtures = await getAllFixtures();
    results = fixtures
      .filter(f => f.played && f.competition === 'league')
      .sort((a, b) => b.gameweek - a.gameweek)
      .slice(0, 20);

    loaded = true;
  }

  $effect(() => {
    // Read so this effect re-runs whenever helpers.js's navigateTo('competitions')
    // fires the legacy onEnter hook and bumps the tick.
    void screenTicks.competitions;
    load();
  });

  const totalTeams = $derived(rows.length);
</script>

<div class="league-screen">
  <div class="league-hdr">
    <div class="league-eyebrow">Competitions</div>
    <div class="league-title">{leagueName} <span class="league-season">{season}</span></div>
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
            <div
              class="league-row {row.teamId === userTeamId ? 'is-user' : ''}"
              class:zone-ucl={zone(row.position, totalTeams)?.cls === 'ucl'}
              class:zone-uel={zone(row.position, totalTeams)?.cls === 'uel'}
              class:zone-uecl={zone(row.position, totalTeams)?.cls === 'uecl'}
              class:zone-rel={zone(row.position, totalTeams)?.cls === 'rel'}
              animate:flip={{ duration: 400 }}
            >
              <div class="rc">{row.position}</div>
              <div class="tc">{row.crest || ''} {row.teamName}</div>
              <div class="sc">{row.played}</div>
              <div class="sc">{row.won}</div>
              <div class="sc">{row.drawn}</div>
              <div class="sc">{row.lost}</div>
              <div class="sc gd" class:pos={row.goalDifference >= 0}>{row.goalDifference >= 0 ? '+' : ''}{row.goalDifference}</div>
              <div class="pc">{row.points}</div>
              <div class="form-col form-mini">
                {#each (row.form || []) as f, i (i)}<span class="fdot fd-{f}">{f}</span>{/each}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="league-results-card">
        <div class="league-results-hdr">Recent Results</div>
        <div class="league-results-list">
          {#if !results.length}
            <div class="league-empty">No matches played yet.</div>
          {:else}
            {#each results as f (f.id)}
              <div class="result-row" class:is-user={f.homeTeamId === userTeamId || f.awayTeamId === userTeamId}>
                <div class="result-gw">GW{f.gameweek}</div>
                <div class="result-teams">
                  <span class="rth">{byId.get(f.homeTeamId)?.name || f.homeTeamId}</span>
                  <span class="rsc">{f.homeGoals} – {f.awayGoals}</span>
                  <span class="rta">{byId.get(f.awayTeamId)?.name || f.awayTeamId}</span>
                </div>
                <div class="result-date">{fmt.dateShort(f.date)}</div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .league-screen {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px 16px 24px;
    font-family: var(--font-body);
    color: var(--color-tx);
  }
  .league-hdr { margin-bottom: 12px; flex-shrink: 0; }
  .league-eyebrow {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--color-club);
    margin-bottom: 3px;
  }
  .league-title {
    font-family: var(--font-display);
    font-size: clamp(24px, 5vw, 32px);
    letter-spacing: 1px;
    line-height: 1;
  }
  .league-season { color: var(--color-tx-2); font-size: 0.55em; margin-left: 6px; }

  .league-empty {
    color: var(--color-tx-3);
    font-size: 12px;
    padding: 24px;
    text-align: center;
  }

  .league-body { display: flex; flex-direction: column; gap: 14px; flex: 1; min-height: 0; }
  @media (min-width: 900px) {
    .league-body { display: grid; grid-template-columns: 1fr 320px; align-items: start; }
  }

  .league-table-card, .league-results-card {
    background: var(--color-surface);
    border: 1px solid var(--color-line);
    border-radius: 14px;
    overflow: hidden;
  }

  .league-table-hdr, .league-row {
    display: grid;
    grid-template-columns: 22px 1fr 22px 22px 22px 22px 34px 32px 70px;
    gap: 4px;
    align-items: center;
    padding: 7px 12px;
  }
  .league-table-hdr {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.5px;
    color: var(--color-tx-3);
    border-bottom: 1px solid var(--color-line);
  }
  .league-row {
    font-size: 12px;
    border-left: 3px solid transparent;
    transition: background 0.15s;
  }
  .league-row.is-user {
    background: color-mix(in oklch, var(--color-club) 12%, transparent);
    border-left-color: var(--color-club);
  }
  .league-row.is-user .tc { font-weight: 600; color: var(--color-tx); }
  .league-row.zone-ucl { box-shadow: inset 3px 0 0 #3b82f6; }
  .league-row.zone-uel { box-shadow: inset 3px 0 0 #f97316; }
  .league-row.zone-uecl { box-shadow: inset 3px 0 0 var(--color-live); }
  .league-row.zone-rel { box-shadow: inset 3px 0 0 var(--color-bad); }
  .league-row.is-user.zone-ucl, .league-row.is-user.zone-uel,
  .league-row.is-user.zone-uecl, .league-row.is-user.zone-rel { box-shadow: none; }

  .rc { color: var(--color-tx-3); font-family: var(--font-mono); font-size: 10px; }
  .tc { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sc { text-align: center; color: var(--color-tx-2); font-family: var(--font-mono); font-size: 10px; }
  .sc.gd { color: var(--color-bad); }
  .sc.gd.pos { color: var(--color-live); }
  .pc { text-align: center; font-weight: 700; font-family: var(--font-mono); font-size: 12px; }
  .form-col { display: flex; gap: 2px; justify-content: flex-end; }

  @media (max-width: 560px) {
    .league-table-hdr, .league-row { grid-template-columns: 20px 1fr 36px 32px; }
    .league-table-hdr > :nth-child(3), .league-table-hdr > :nth-child(4),
    .league-table-hdr > :nth-child(5), .league-table-hdr > :nth-child(6),
    .league-row > :nth-child(3), .league-row > :nth-child(4),
    .league-row > :nth-child(5), .league-row > :nth-child(6) { display: none; }
    .form-col { display: none; }
  }

  .form-mini { display: flex; gap: 2px; }
  .fdot {
    width: 15px; height: 15px; border-radius: 3px; font-size: 8px;
    font-family: var(--font-mono); font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }
  .fd-W { background: color-mix(in oklch, var(--color-live) 20%, transparent); color: var(--color-live); }
  .fd-D { background: color-mix(in oklch, var(--color-warn) 18%, transparent); color: var(--color-warn); }
  .fd-L { background: color-mix(in oklch, var(--color-bad) 18%, transparent); color: var(--color-bad); }

  .league-results-hdr {
    font-family: var(--font-display);
    font-size: 15px;
    letter-spacing: 0.5px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--color-line);
  }
  .league-results-list { max-height: 480px; overflow-y: auto; padding: 4px; }
  .result-row { padding: 8px 10px; border-radius: 8px; margin-bottom: 2px; }
  .result-row.is-user { background: color-mix(in oklch, var(--color-club) 10%, transparent); }
  .result-gw { font-size: 9px; color: var(--color-tx-3); font-family: var(--font-mono); margin-bottom: 2px; }
  .result-teams { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .rth { flex: 1; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rta { flex: 1; text-align: right; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rsc { font-family: var(--font-display); font-size: 14px; letter-spacing: 1px; min-width: 40px; text-align: center; flex-shrink: 0; }
  .result-date { font-size: 10px; color: var(--color-tx-3); font-family: var(--font-mono); margin-top: 2px; }
</style>
