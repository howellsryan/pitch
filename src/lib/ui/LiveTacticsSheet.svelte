<script>
  import { positionGroup, primaryRating } from '../../modules/matchEngine.js';
  import TeamInstructionsPanel from './TeamInstructionsPanel.svelte';

  let {
    teamName = 'Your Team',
    formation = '4-3-3',
    formations = [],
    mentalities = [],
    mentality = 'balanced',
    slots = [],
    assignment = [],
    activePlayers = [],
    bench = [],
    subsLeft = 0,
    subInId = null,
    subOutId = null,
    subOutOptions = [],
    instructions = {},
    rolesById = {},
    onclose = () => {},
    onformation = () => {},
    onmentality = () => {},
    oninstruction = () => {},
    onstarter = () => {},
    onbench = () => {},
  } = $props();

  let tab = $state('shape');

  const selectedIn = $derived(bench.find(player => player.id === subInId) ?? null);
  const selectedOut = $derived(activePlayers.find(player => player.id === subOutId) ?? null);

  function chooseBench(player) {
    tab = 'subs';
    onbench(player);
  }

  function chooseStarter(player) {
    tab = 'subs';
    onstarter(player);
  }
</script>

<section class="live-tactics" aria-label="Live match tactics">
  <header class="lt-header">
    <div>
      <span>LIVE · PAUSED</span>
      <strong>{teamName}</strong>
    </div>
    <button type="button" class="lt-close" onclick={onclose} aria-label="Back to match">Back to match</button>
  </header>

  <nav class="lt-tabs" aria-label="Tactics sections">
    <button type="button" class:active={tab === 'shape'} onclick={() => { tab = 'shape'; }}>Shape</button>
    <button type="button" class:active={tab === 'subs'} onclick={() => { tab = 'subs'; }}>Subs <span>{subsLeft}</span></button>
    <button type="button" class:active={tab === 'instructions'} onclick={() => { tab = 'instructions'; }}>Instructions</button>
  </nav>

  <div class="lt-body">
    {#if tab === 'shape'}
      <section class="lt-section">
        <div class="lt-label">Formation</div>
        <div class="lt-chip-row" aria-label="Formation">
          {#each formations as item (item)}
            <button type="button" class:active={item === formation} onclick={() => onformation(item)}>{item}</button>
          {/each}
        </div>
      </section>

      <section class="lt-section">
        <div class="lt-label">Mentality</div>
        <div class="lt-chip-row mentality" aria-label="Mentality">
          {#each mentalities as item (item.id)}
            <button type="button" class:active={item.id === mentality} onclick={() => onmentality(item.id)}>{item.label}</button>
          {/each}
        </div>
      </section>

      <div class="lt-pitch-wrap">
        <div class="lt-pitch" aria-label="Current tactical shape">
          <div class="pitch-half"></div><div class="pitch-circle"></div>
          <div class="pitch-box top"></div><div class="pitch-box bottom"></div>
          {#each slots as slot, index (index)}
            {@const player = assignment[index]}
            {#if player}
              <div class="lt-player pos-{positionGroup(player.position)}" style="left:{slot.x}%;top:{slot.y}%">
                <strong>{primaryRating(player)}</strong>
                <span>{player.matchPosition ?? slot.p}</span>
                <small>{player.name.split(' ').pop()}</small>
              </div>
            {/if}
          {/each}
        </div>
      </div>

      <button type="button" class="lt-subs-cta" onclick={() => { tab = 'subs'; }}>Make a substitution · {subsLeft} left</button>

    {:else if tab === 'subs'}
      <div class="lt-sub-guide">
        <div>
          <span>1</span>
          <p><strong>Choose the player coming on</strong><small>{selectedIn ? selectedIn.name : 'Select from the bench below'}</small></p>
        </div>
        <div>
          <span>2</span>
          <p><strong>Choose exactly who comes off</strong><small>{selectedOut ? selectedOut.name : selectedIn ? 'Now tap the player on the pitch' : 'No automatic reshuffle'}</small></p>
        </div>
      </div>

      <div class="lt-pitch-wrap compact">
        <div class="lt-pitch" aria-label="Select player to replace">
          <div class="pitch-half"></div><div class="pitch-circle"></div>
          <div class="pitch-box top"></div><div class="pitch-box bottom"></div>
          {#each slots as slot, index (index)}
            {@const player = assignment[index]}
            {#if player}
              {@const eligible = !selectedIn || subOutOptions.some(option => option.id === player.id)}
              <button
                type="button"
                class="lt-player interactive pos-{positionGroup(player.position)}"
                class:selected={subOutId === player.id}
                class:unavailable={!eligible}
                style="left:{slot.x}%;top:{slot.y}%"
                onclick={() => chooseStarter(player)}
                aria-label={`Replace ${player.name}`}
              >
                <strong>{primaryRating(player)}</strong>
                <span>{player.matchPosition ?? slot.p}</span>
                <small>{player.name.split(' ').pop()}</small>
              </button>
            {/if}
          {/each}
        </div>
      </div>

      <section class="lt-bench">
        <div class="lt-bench-title"><strong>Bench</strong><span>{subsLeft} substitutions left</span></div>
        <div class="lt-bench-grid">
          {#each bench as player (player.id)}
            {@const fit = Math.round(player.fitness ?? 90)}
            <button type="button" class:selected={subInId === player.id} onclick={() => chooseBench(player)}>
              <span class="bench-pos">{player.position}</span>
              <strong>{player.name}</strong>
              <small>{primaryRating(player)} OVR · {fit}% fit</small>
            </button>
          {/each}
        </div>
      </section>

    {:else}
      <section class="lt-instructions">
        <div class="lt-label">Team instructions</div>
        <TeamInstructionsPanel
          compact
          {instructions}
          players={activePlayers}
          {rolesById}
          onchange={oninstruction}
        />
      </section>
    {/if}
  </div>
</section>

<style>
  .live-tactics { position:fixed; inset:0; z-index:1000; height:100dvh; display:flex; flex-direction:column; overflow:hidden; background:var(--color-ground); color:var(--color-tx); }
  .lt-header { flex:0 0 auto; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:max(10px, env(safe-area-inset-top)) 12px 9px; border-bottom:1px solid var(--color-line); background:var(--color-surface); }
  .lt-header span { display:block; color:var(--color-live); font:700 8px var(--font-mono); letter-spacing:1.3px; }
  .lt-header strong { display:block; margin-top:2px; font:700 17px var(--font-display); }
  .lt-close { min-height:38px; padding:0 12px; border:1px solid var(--color-line); border-radius:999px; background:var(--color-raised); color:var(--color-tx); font:700 10px var(--font-body); }
  .lt-tabs { flex:0 0 auto; display:grid; grid-template-columns:repeat(3,1fr); gap:5px; padding:7px 8px; border-bottom:1px solid var(--color-line); background:var(--color-ground); }
  .lt-tabs button { min-height:39px; border:1px solid transparent; border-radius:8px; background:transparent; color:var(--color-tx-2); font:700 10px var(--font-body); }
  .lt-tabs button.active { border-color:var(--color-line); background:var(--color-raised); color:var(--color-tx); }
  .lt-tabs span { display:inline-grid; place-items:center; min-width:17px; height:17px; margin-left:3px; border-radius:50%; background:var(--color-club); color:var(--color-on-club,#fff); font:700 8px var(--font-mono); }
  .lt-body { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:10px 10px calc(18px + env(safe-area-inset-bottom)); }
  .lt-section { margin-bottom:10px; }
  .lt-label { margin-bottom:6px; color:var(--color-tx-3); font:700 9px var(--font-mono); letter-spacing:.8px; text-transform:uppercase; }
  .lt-chip-row { display:flex; gap:5px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none; }
  .lt-chip-row::-webkit-scrollbar { display:none; }
  .lt-chip-row button { flex:0 0 auto; min-height:35px; padding:0 10px; border:1px solid var(--color-line); border-radius:8px; background:var(--color-raised); color:var(--color-tx-2); font:600 10px var(--font-mono); }
  .lt-chip-row.mentality button { border-radius:999px; font-family:var(--font-body); }
  .lt-chip-row button.active { border-color:var(--color-club); background:var(--color-club); color:var(--color-on-club,#fff); }
  .lt-pitch-wrap { width:min(100%, 310px); margin:8px auto 10px; }
  .lt-pitch-wrap.compact { width:min(100%, 285px); }
  .lt-pitch { position:relative; width:100%; aspect-ratio:68/82; overflow:hidden; border:1px solid rgba(255,255,255,.2); border-radius:10px; background:linear-gradient(180deg,#123d32,#0d3128); box-shadow:inset 0 0 38px rgba(0,0,0,.28); }
  .lt-pitch::before { content:''; position:absolute; inset:0; background:repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 10%,transparent 10% 20%); }
  .pitch-half { position:absolute; left:0; right:0; top:50%; border-top:1px solid rgba(255,255,255,.24); }
  .pitch-circle { position:absolute; left:50%; top:50%; width:22%; aspect-ratio:1; border:1px solid rgba(255,255,255,.24); border-radius:50%; transform:translate(-50%,-50%); }
  .pitch-box { position:absolute; left:22%; width:56%; height:15%; border:1px solid rgba(255,255,255,.24); }
  .pitch-box.top { top:0; border-top:0; }.pitch-box.bottom { bottom:0; border-bottom:0; }
  .lt-player { position:absolute; z-index:2; width:44px; min-height:50px; display:flex; flex-direction:column; align-items:center; justify-content:center; transform:translate(-50%,-50%); border:2px solid; border-radius:50%; background:var(--color-surface); color:var(--color-tx); }
  button.lt-player { padding:0; cursor:pointer; }
  .lt-player.pos-GK { border-color:#7c83e8; }.lt-player.pos-DEF { border-color:var(--color-live); }.lt-player.pos-MID { border-color:var(--color-warn); }.lt-player.pos-ATT { border-color:var(--color-bad); }
  .lt-player strong { font:700 12px/1 var(--font-display); }.lt-player span { color:var(--color-tx-3); font:700 7px/1.3 var(--font-mono); }
  .lt-player small { position:absolute; top:calc(100% + 2px); max-width:60px; padding:1px 3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border-radius:3px; background:rgba(4,12,8,.86); color:#fff; font:8px var(--font-body); }
  .lt-player.selected { border-color:var(--color-club); box-shadow:0 0 0 4px color-mix(in oklch,var(--color-club) 38%,transparent); }
  .lt-player.unavailable { opacity:.28; }
  .lt-subs-cta { width:100%; min-height:42px; border:1px solid var(--color-club); border-radius:9px; background:color-mix(in oklch,var(--color-club) 10%,transparent); color:var(--color-club); font:700 11px var(--font-body); }
  .lt-sub-guide { display:grid; gap:6px; margin-bottom:6px; }
  .lt-sub-guide > div { display:flex; align-items:center; gap:8px; min-height:45px; padding:7px 9px; border:1px solid var(--color-line); border-radius:8px; background:var(--color-surface); }
  .lt-sub-guide > div > span { flex:0 0 24px; width:24px; height:24px; display:grid; place-items:center; border-radius:50%; background:var(--color-raised); color:var(--color-club); font:700 10px var(--font-mono); }
  .lt-sub-guide p { margin:0; min-width:0; }.lt-sub-guide strong,.lt-sub-guide small { display:block; }.lt-sub-guide strong { font-size:10px; }.lt-sub-guide small { margin-top:2px; color:var(--color-tx-3); font-size:9px; }
  .lt-bench { margin-top:8px; }
  .lt-bench-title { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }.lt-bench-title strong { font:700 13px var(--font-display); }.lt-bench-title span { color:var(--color-warn); font:700 9px var(--font-mono); }
  .lt-bench-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
  .lt-bench-grid button { min-width:0; min-height:60px; display:grid; grid-template-columns:auto minmax(0,1fr); grid-template-rows:auto auto; column-gap:7px; align-items:center; text-align:left; padding:7px 8px; border:1px solid var(--color-line); border-radius:9px; background:var(--color-surface); color:var(--color-tx); }
  .lt-bench-grid button.selected { border-color:var(--color-club); background:color-mix(in oklch,var(--color-club) 11%,var(--color-surface)); box-shadow:inset 0 0 0 1px var(--color-club); }
  .bench-pos { grid-row:1/3; min-width:28px; height:28px; display:grid; place-items:center; border-radius:50%; background:var(--color-raised); color:var(--color-tx-2); font:700 8px var(--font-mono); }
  .lt-bench-grid strong { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:10px; }.lt-bench-grid small { color:var(--color-tx-3); font:8px var(--font-mono); }
  .lt-instructions { width:min(100%,620px); margin:0 auto; }
  @media (max-width:390px) { .lt-body{padding-inline:7px}.lt-pitch-wrap{width:min(100%,285px)}.lt-player{width:40px;min-height:46px}.lt-bench-grid{grid-template-columns:1fr}.lt-header strong{font-size:15px} }
  @media (min-width:769px) { .live-tactics { left:50%; right:auto; width:min(720px,100vw); transform:translateX(-50%); border-inline:1px solid var(--color-line); }.lt-body{padding:14px 18px 24px}.lt-pitch-wrap{width:min(100%,360px)}.lt-bench-grid{grid-template-columns:repeat(3,minmax(0,1fr));} }
</style>
