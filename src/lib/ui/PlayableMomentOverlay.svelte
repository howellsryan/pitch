<script>
  import { onMount } from 'svelte';
  import { gestureToPlayableIntent } from '../../game/playableMomentsPocScene.js';

  let {
    moment,
    resolution = null,
    busy = false,
    onsubmit = () => {},
    onsimulate = () => {},
    oncontinue = () => {},
  } = $props();

  let canvas = $state();
  let rendererLoading = $state(true);
  let rendererError = $state('');
  let selectedLane = $state(0);
  let selectedHeight = $state(.55);
  let controller = null;
  let pointerStart = null;
  let animationFrame = null;
  let animationStarted = null;
  let animationProgress = 0;
  let lastResolution = null;
  let fallbackTriggered = false;

  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  const finish = $derived(resolution?.shot?.finish ?? resolution?.finish ?? null);
  const instruction = $derived(moment?.mode === 'goalkeeper'
    ? 'Choose where to commit the goalkeeper. Reading the chance matters, but goalkeeper quality still controls reach.'
    : 'Place the shot. Your input matters, but the player’s shooting quality and the defensive pressure still control execution.');

  function resultLabel(value) {
    if (value === 'goal') return 'GOAL';
    if (value === 'saved') return 'SAVED';
    if (value === 'blocked') return 'BLOCKED';
    if (value === 'missed') return 'MISSED';
    return value ? String(value).toUpperCase() : '';
  }

  async function automaticFallback() {
    if (fallbackTriggered || resolution) return;
    fallbackTriggered = true;
    try {
      await onsimulate();
    } catch (error) {
      rendererError = `${rendererError} Automatic fallback failed: ${error?.message ?? error}`.trim();
    }
  }

  async function mountRenderer() {
    if (!canvas) return;
    rendererLoading = true;
    rendererError = '';
    try {
      const module = await import('../../game/playableMomentsThreeRenderer.js');
      controller = await module.mountThreePlayablePoc(canvas, moment);
      controller.render({ moment, resolution, progress:resolution ? 1 : 0 });
    } catch (error) {
      rendererError = `3D presentation unavailable — resolving this same saved moment automatically. ${error?.message ?? error}`;
      await automaticFallback();
    } finally {
      rendererLoading = false;
    }
  }

  function animationLoop(now) {
    if (resolution && resolution !== lastResolution) {
      lastResolution = resolution;
      animationStarted = now;
      animationProgress = reducedMotion ? 1 : 0;
    }
    if (!resolution) {
      lastResolution = null;
      animationStarted = null;
      animationProgress = 0;
    } else if (animationStarted != null && !reducedMotion) {
      animationProgress = Math.min(1, (now - animationStarted) / 2050);
      if (animationProgress >= 1) animationStarted = null;
    }
    controller?.render?.({ moment, resolution, progress:animationProgress });
    animationFrame = window.requestAnimationFrame(animationLoop);
  }

  function accessibleIntent() {
    if (resolution || busy) return;
    if (moment?.mode === 'goalkeeper') {
      void onsubmit({ goalkeeper:{ x:selectedLane * .78, y:selectedHeight, timing:.82 } });
      return;
    }
    void onsubmit({ attack:{ aimX:selectedLane * .78, aimY:selectedHeight, power:.74, timing:.82 } });
  }

  function pointerDown(event) {
    if (resolution || busy) return;
    pointerStart = { x:event.clientX, y:event.clientY, at:window.performance.now() };
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function pointerUp(event) {
    if (!pointerStart || resolution || busy) return;
    const bounds = canvas?.getBoundingClientRect?.();
    if (!bounds) return;
    const goalTarget = controller?.goalIntentFromClientPoint?.(event.clientX, event.clientY) ?? null;
    const intent = gestureToPlayableIntent({
      mode:moment?.mode ?? 'attack',
      start:pointerStart,
      end:{ x:event.clientX, y:event.clientY },
      bounds,
      durationMs:window.performance.now() - pointerStart.at,
      goalTarget,
    });
    pointerStart = null;
    if (intent) void onsubmit(intent);
  }

  onMount(() => {
    void mountRenderer();
    animationFrame = window.requestAnimationFrame(animationLoop);
    return () => {
      if (animationFrame != null) window.cancelAnimationFrame(animationFrame);
      controller?.dispose?.();
      controller = null;
    };
  });
</script>

<section class="playable-moment" aria-label="Play Key Moment">
  <header class="pm-header">
    <div>
      <span>PLAY KEY MOMENT · {moment?.minute ?? 0}'</span>
      <strong>{moment?.mode === 'goalkeeper' ? 'DEFEND THE CHANCE' : 'TAKE THE CHANCE'}</strong>
    </div>
    <small>xG {Number(moment?.xg ?? 0).toFixed(2)}</small>
  </header>

  <div
    class="pm-stage"
    role="group"
    aria-label={moment?.mode === 'goalkeeper' ? 'Goalkeeper interaction surface' : 'Shot interaction surface'}
    onpointerdown={pointerDown}
    onpointerup={pointerUp}
    onpointercancel={() => { pointerStart = null; }}
  >
    <canvas bind:this={canvas} aria-label="Playable football 3D scene"></canvas>
    {#if rendererLoading && !rendererError}
      <div class="pm-overlay-note">Loading moment…</div>
    {/if}
    {#if rendererError}
      <div class="pm-overlay-note pm-warning">{rendererError}</div>
    {/if}
    {#if finish}
      <div class="pm-result" class:goal={finish === 'goal'}>{resultLabel(finish)}</div>
    {/if}
  </div>

  <div class="pm-copy">
    {#if finish}
      <strong>{finish === 'goal' ? 'Chance converted.' : finish === 'saved' ? 'The goalkeeper makes the save.' : finish === 'blocked' ? 'The defender gets the block.' : 'The chance goes begging.'}</strong>
      <span>The result above is already committed to the authoritative match state.</span>
    {:else}
      <strong>{moment?.shooterName ?? 'Attacker'} vs {moment?.goalkeeperName ?? 'Goalkeeper'}</strong>
      <span>{instruction}</span>
    {/if}
  </div>

  {#if !finish}
    <div class="pm-accessible" aria-label="Accessible aim controls">
      <div class="pm-choice" aria-label="Horizontal target">
        <button type="button" class:active={selectedLane === -1} onclick={() => { selectedLane = -1; }}>Left</button>
        <button type="button" class:active={selectedLane === 0} onclick={() => { selectedLane = 0; }}>Centre</button>
        <button type="button" class:active={selectedLane === 1} onclick={() => { selectedLane = 1; }}>Right</button>
      </div>
      <div class="pm-choice" aria-label="Vertical target">
        <button type="button" class:active={selectedHeight === .30} onclick={() => { selectedHeight = .30; }}>Low</button>
        <button type="button" class:active={selectedHeight === .55} onclick={() => { selectedHeight = .55; }}>Mid</button>
        <button type="button" class:active={selectedHeight === .80} onclick={() => { selectedHeight = .80; }}>High</button>
      </div>
    </div>
  {/if}

  <footer class="pm-actions">
    {#if finish}
      <button type="button" class="primary" disabled={busy} onclick={() => oncontinue()}>{busy ? 'Saving…' : 'Continue Match'}</button>
    {:else}
      <button type="button" class="primary" disabled={busy || rendererLoading} onclick={accessibleIntent}>{busy ? 'Saving…' : moment?.mode === 'goalkeeper' ? 'Dive' : 'Shoot'}</button>
      <button type="button" disabled={busy} onclick={() => onsimulate()}>{busy ? 'Saving…' : 'Simulate'}</button>
    {/if}
  </footer>
</section>

<style>
  .playable-moment { position:absolute; inset:0; z-index:120; display:flex; flex-direction:column; background:#07110c; color:#f5f8f6; font-family:var(--font-body, Inter, system-ui, sans-serif); }
  .pm-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:12px 14px; background:#0d1d14; border-bottom:1px solid rgba(255,255,255,.1); }
  .pm-header div { display:flex; flex-direction:column; gap:2px; }
  .pm-header span, .pm-header small { font-family:var(--font-mono, monospace); font-size:10px; letter-spacing:.08em; color:#8fb29f; }
  .pm-header strong { font-family:var(--font-display, inherit); font-size:16px; letter-spacing:.04em; }
  .pm-stage { position:relative; flex:1; min-height:300px; background:#08170f; touch-action:none; user-select:none; overflow:hidden; }
  .pm-stage canvas { display:block; width:100%; height:100%; min-height:300px; }
  .pm-overlay-note { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); max-width:82%; padding:10px 12px; border-radius:8px; background:rgba(3,12,7,.9); text-align:center; font-size:12px; font-weight:700; }
  .pm-warning { color:#ffd6a3; border:1px solid rgba(255,190,108,.35); }
  .pm-result { position:absolute; top:18px; left:50%; transform:translateX(-50%); padding:8px 18px; border-radius:999px; border:1px solid rgba(255,255,255,.2); background:rgba(8,19,13,.9); font-family:var(--font-display, inherit); font-weight:900; letter-spacing:.14em; font-size:18px; }
  .pm-result.goal { background:#17673b; }
  .pm-copy { display:flex; flex-direction:column; gap:3px; padding:10px 14px; background:#0d1d14; border-top:1px solid rgba(255,255,255,.08); }
  .pm-copy strong { font-size:13px; }
  .pm-copy span { color:#a9bbb0; font-size:11px; line-height:1.35; }
  .pm-accessible { display:grid; grid-template-columns:1fr 1fr; gap:7px; padding:0 14px 10px; background:#0d1d14; }
  .pm-choice { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; }
  button { min-height:44px; border:1px solid rgba(255,255,255,.14); border-radius:9px; background:#14271c; color:#f1f7f3; font:inherit; font-size:12px; font-weight:800; cursor:pointer; }
  button.active { border-color:#6ad998; background:#1d5f3c; }
  button:disabled { opacity:.48; cursor:default; }
  .pm-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:10px 14px max(10px, env(safe-area-inset-bottom)); background:#08130d; border-top:1px solid rgba(255,255,255,.1); }
  .pm-actions .primary:only-child { grid-column:1 / -1; }
  button.primary { background:#1f7548; border-color:#66d898; }
  @media (max-width:520px) {
    .pm-accessible { grid-template-columns:1fr; }
    .pm-stage { min-height:42vh; }
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation:none !important; transition:none !important; }
  }
</style>
