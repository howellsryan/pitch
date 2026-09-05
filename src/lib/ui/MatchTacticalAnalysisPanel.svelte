<script>
  let {
    analysis = null,
    userTeamId = null,
    homeTeamName = 'Home',
    awayTeamName = 'Away',
  } = $props();

  const userSide = $derived(analysis?.home?.teamId === userTeamId ? analysis?.home : analysis?.away);
  const opponentSide = $derived(analysis?.home?.teamId === userTeamId ? analysis?.away : analysis?.home);
  const userName = $derived(analysis?.home?.teamId === userTeamId ? homeTeamName : awayTeamName);
  const opponentName = $derived(analysis?.home?.teamId === userTeamId ? awayTeamName : homeTeamName);
  const usedRoutes = $derived(
    [...(userSide?.routes ?? [])]
      .filter(route => route.attempts > 0)
      .sort((left, right) => right.attempts - left.attempts || right.chances - left.chances || left.label.localeCompare(right.label))
      .slice(0, 3),
  );
  const userObservation = $derived((analysis?.observations ?? []).find(item => item.teamId === userTeamId) ?? null);
  const opponentObservation = $derived((analysis?.observations ?? []).find(item => item.teamId === opponentSide?.teamId) ?? null);
</script>

{#if analysis && userSide}
  <section class="tactical-read" data-testid="match-tactical-analysis">
    <header>
      <div>
        <span>Tactical read</span>
        <strong>{userName}</strong>
      </div>
      <div class="tactical-scoreline">
        <span>{userSide.chances} chances</span>
        <span>{userSide.xG.toFixed(2)} xG</span>
      </div>
    </header>

    {#if usedRoutes.length}
      <div class="route-list">
        {#each usedRoutes as route (route.route)}
          <div class="route-row">
            <div>
              <strong>{route.label}</strong>
              <span>{route.successes}/{route.attempts} progressed</span>
            </div>
            <div class="route-output">
              {#if route.chances > 0}<b>{route.chances} {route.chances === 1 ? 'chance' : 'chances'}</b>{/if}
              <small>{route.successRate}%</small>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="tactical-metrics">
      <div><span>Shot quality</span><strong>{userSide.averageXG.toFixed(2)} xG / shot</strong></div>
      <div><span>Turnovers</span><strong>{userSide.turnoversLost}</strong></div>
      <div><span>Best route</span><strong>{userSide.bestRoute?.label ?? 'No clear route'}</strong></div>
    </div>

    {#if userObservation || opponentObservation}
      <div class="observations">
        {#if userObservation}<p><b>Your pattern</b><span>{userObservation.text}</span></p>{/if}
        {#if opponentObservation}<p><b>{opponentName}</b><span>{opponentObservation.text}</span></p>{/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .tactical-read { width:100%; max-width:760px; margin-inline:auto; display:grid; gap:10px; padding:11px 12px; border:1px solid var(--color-line); border-radius:10px; background:var(--color-surface); }
  header { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
  header span { display:block; color:var(--color-tx-3); font:700 8px var(--font-mono); text-transform:uppercase; letter-spacing:.08em; }
  header strong { display:block; margin-top:2px; font:15px var(--font-display); }
  .tactical-scoreline { display:flex; gap:5px; flex-wrap:wrap; justify-content:flex-end; }
  .tactical-scoreline span { padding:4px 6px; border:1px solid var(--color-line); border-radius:999px; color:var(--color-tx-2); font:700 8px var(--font-mono); letter-spacing:0; }
  .route-list { display:grid; gap:5px; }
  .route-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:7px 8px; border-radius:8px; background:var(--color-raised); }
  .route-row strong, .route-row span { display:block; }
  .route-row strong { font-size:10px; }
  .route-row span { margin-top:2px; color:var(--color-tx-3); font-size:9px; }
  .route-output { min-width:62px; text-align:right; }
  .route-output b { display:block; color:var(--color-club); font:700 9px var(--font-mono); }
  .route-output small { display:block; margin-top:2px; color:var(--color-tx-3); font:8px var(--font-mono); }
  .tactical-metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px; }
  .tactical-metrics div { min-width:0; padding:7px; border:1px solid var(--color-line); border-radius:8px; }
  .tactical-metrics span, .tactical-metrics strong { display:block; }
  .tactical-metrics span { color:var(--color-tx-3); font:700 7px var(--font-mono); text-transform:uppercase; letter-spacing:.04em; }
  .tactical-metrics strong { margin-top:3px; overflow:hidden; color:var(--color-tx); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
  .observations { display:grid; gap:6px; padding-top:8px; border-top:1px solid var(--color-line); }
  .observations p { display:grid; grid-template-columns:72px minmax(0,1fr); gap:8px; margin:0; color:var(--color-tx-2); font-size:9px; line-height:1.4; }
  .observations b { color:var(--color-club); font:700 8px var(--font-mono); text-transform:uppercase; letter-spacing:.04em; }
  @media (max-width:380px) {
    header { flex-direction:column; }
    .tactical-scoreline { justify-content:flex-start; }
    .tactical-metrics { grid-template-columns:1fr 1fr; }
    .tactical-metrics div:last-child { grid-column:1 / -1; }
    .observations p { grid-template-columns:1fr; gap:2px; }
  }
</style>
