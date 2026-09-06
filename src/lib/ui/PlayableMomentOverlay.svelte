<script>
  import { onMount } from 'svelte';
  import { gestureToPlayableIntent } from '../../game/playableMomentsPocScene.js';
  import {
    browserPresentationCapabilities,
    readPlayablePresentationPreferences,
    writePlayablePresentationPreferences,
  } from '../../game/playableMomentsPresentationPreferences.js';
  import { buildPlayableScenePlan, mountPlayableSceneRenderer } from '../../game/playableMomentsSceneDirector.js';
  import { playCommittedPlayablePresentationAudio, unlockPlayablePresentationAudio } from '../../game/playableMomentsPresentationAudio.js';
  import { recordPlayablePresentationDiagnostic } from '../../game/playableMomentsPresentationDiagnostics.js';

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
  let presentationPreferences = $state.raw(readPlayablePresentationPreferences());
  let systemReducedMotion = $state(false);
  let replayCount = $state(0);
  let replayActive = $state(false);
  let controller = $state.raw(null);
  let pointerStart = null;
  let animationFrame = null;
  let animationStarted = null;
  let animationProgress = 0;
  let lastResolution = null;
  let fallbackTriggered = false;
  let lastRenderAt = 0;
  let loadStartedAt = 0;

  const scenePlan = $derived.by(() => buildPlayableScenePlan({
    moment,
    preferences:presentationPreferences,
    capabilities:browserPresentationCapabilities(),
    systemReducedMotion,
  }));
  const reducedMotion = $derived(scenePlan.reducedMotion);

  const isContinuation = $derived(moment?.interactionType === 'continuation');
  const isContact = $derived(moment?.interactionType === 'contact');
  const continuationType = $derived(moment?.continuationType ?? null);
  const contactType = $derived(moment?.contactType ?? moment?.geometry?.staging?.contactType ?? null);
  const finish = $derived(isContinuation ? null : resolution?.shot?.finish ?? resolution?.finish ?? null);
  const continuationResult = $derived(resolution?.continuation ?? null);
  const hasResolution = $derived(Boolean(resolution));
  const setPieceKind = $derived(moment?.setPiece?.kind ?? null);
  const goalkeeperIntervention = $derived(
    resolution?.shot?.goalkeeperIntervention
      ?? resolution?.shot?.presentation?.goalkeeperIntervention
      ?? resolution?.shot?.presentation?.keeper?.intervention
      ?? null,
  );

  function diagnostic(type, extra = {}) {
    recordPlayablePresentationDiagnostic({
      type,
      version:scenePlan.version,
      scenario:scenePlan.scenario,
      quality:scenePlan.quality.tier,
      replayCount,
      ...extra,
    });
  }

  function contactName(type) {
    if (type === 'standing_header') return 'header';
    if (type === 'running_header') return 'running header';
    if (type === 'half_volley') return 'half-volley';
    if (type === 'volley') return 'volley';
    return 'contact';
  }

  const headline = $derived(isContinuation
    ? continuationType === 'through_ball' ? 'PLAY THE THROUGH BALL'
      : continuationType === 'cutback' ? 'PLAY THE CUTBACK'
        : continuationType === 'cross' ? 'PLAY THE CROSS'
          : 'PLAY THE FINAL PASS'
    : isContact
      ? moment?.mode === 'goalkeeper'
        ? contactType?.includes('header') ? 'DEFEND THE HEADER' : 'DEFEND THE VOLLEY'
        : contactType === 'standing_header' ? 'MEET THE HEADER'
          : contactType === 'running_header' ? 'ATTACK THE HEADER'
            : contactType === 'half_volley' ? 'TAKE THE HALF-VOLLEY' : 'TAKE THE VOLLEY'
      : setPieceKind === 'penalty'
        ? moment?.mode === 'goalkeeper' ? 'FACE THE PENALTY' : 'TAKE THE PENALTY'
        : setPieceKind === 'direct_free_kick'
          ? moment?.mode === 'goalkeeper' ? 'DEFEND THE FREE KICK' : 'TAKE THE FREE KICK'
          : moment?.mode === 'goalkeeper' ? 'DEFEND THE CHANCE' : 'TAKE THE CHANCE');

  const instruction = $derived(isContinuation
    ? `Guide the ${continuationType === 'cross' ? 'delivery' : continuationType === 'cutback' ? 'cutback' : 'pass'} into the highlighted space for ${moment?.receiverName ?? 'the authorized receiver'}. Target, weight and timing matter, but passer, receiver and defender quality still decide execution.`
    : isContact
      ? moment?.mode === 'goalkeeper'
        ? `Read the ${contactName(contactType)} and choose the goalkeeper commitment. The contact type, attacker and incoming service are already authoritative; your positioning and timing work within the keeper’s real reach.`
        : `Guide the ${contactName(contactType)} toward goal with placement, power and timing. The engine has already chosen the contact and attacker, while shooting, physical ability and pressure still control execution.`
      : setPieceKind === 'penalty'
        ? moment?.mode === 'goalkeeper'
          ? 'Choose where to commit. Your read and timing matter, while goalkeeper quality still controls the available reach.'
          : 'Pick your placement, power and timing. The taker’s shooting quality still controls execution, so a perfect gesture does not erase player ability.'
        : setPieceKind === 'direct_free_kick'
          ? moment?.mode === 'goalkeeper'
            ? 'Read the direct free kick and choose your commitment. The wall, taker quality and goalkeeper reach are already part of the authoritative situation.'
            : 'Aim around or over the authoritative wall using placement, power and timing. There is no hidden curl control; player shooting and passing quality still govern execution.'
          : moment?.mode === 'goalkeeper'
            ? 'Choose where to commit the goalkeeper. Reading the chance matters, but goalkeeper quality still controls reach.'
            : 'Place the shot. Your input matters, but the player’s shooting quality and the defensive pressure still control execution.');

  const primaryAction = $derived(isContinuation
    ? continuationType === 'cross' ? 'Cross' : continuationType === 'cutback' ? 'Cut Back' : 'Play Pass'
    : isContact
      ? moment?.mode === 'goalkeeper' ? 'Commit' : contactType?.includes('header') ? 'Head' : contactType === 'half_volley' ? 'Half-Volley' : 'Volley'
      : moment?.mode === 'goalkeeper'
        ? 'Dive'
        : setPieceKind === 'penalty' ? 'Take Penalty' : setPieceKind === 'direct_free_kick' ? 'Take Free Kick' : 'Shoot');

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function resultLabel(value) {
    if (value === 'goal') return 'GOAL';
    if (value === 'saved') return goalkeeperIntervention === 'catch' ? 'CAUGHT'
      : goalkeeperIntervention === 'smother' ? 'SMOTHERED'
        : goalkeeperIntervention === 'spread' ? 'SAVED' : 'SAVED';
    if (value === 'blocked') return 'BLOCKED';
    if (value === 'missed') return 'MISSED';
    return value ? String(value).toUpperCase() : '';
  }

  function continuationResultLabel(result) {
    if (!result) return '';
    if (result.success && result.outcome === 'chance_created') return 'CHANCE CREATED';
    if (result.success) return 'PASS COMPLETE';
    if (result.outcome === 'cleared') return 'CLEARED';
    if (result.outcome === 'intercepted') return 'INTERCEPTED';
    if (result.outcome === 'foul_won') return 'FOUL WON';
    return 'POSSESSION LOST';
  }

  function resultCopy(value) {
    if (isContinuation) {
      if (continuationResult?.success && continuationResult?.outcome === 'chance_created') return 'The continuation creates an authoritative downstream chance.';
      if (continuationResult?.success) return 'The authorized continuation succeeds.';
      if (continuationResult?.outcome === 'cleared') return 'The defence clears the delivery.';
      if (continuationResult?.outcome === 'intercepted') return 'The defender reads and intercepts the pass.';
      if (continuationResult?.outcome === 'foul_won') return 'The continuation wins a foul.';
      return 'The defence wins the continuation.';
    }
    if (value === 'goal') return setPieceKind === 'penalty' ? 'Penalty converted.' : setPieceKind === 'direct_free_kick' ? 'Direct free kick converted.' : isContact ? `${contactName(contactType)} converted.` : 'Chance converted.';
    if (value === 'saved') {
      if (goalkeeperIntervention === 'catch') return 'The goalkeeper holds it cleanly.';
      if (goalkeeperIntervention === 'smother') return 'The goalkeeper gets down and smothers it.';
      if (goalkeeperIntervention === 'spread') return 'The goalkeeper spreads to make the save.';
      if (goalkeeperIntervention === 'parry') return 'The goalkeeper parries it away.';
      return 'The goalkeeper makes the save.';
    }
    if (value === 'blocked') return setPieceKind === 'direct_free_kick' ? 'The wall gets the block.' : 'The defender gets the block.';
    return setPieceKind ? 'The set piece goes begging.' : isContact ? `The ${contactName(contactType)} goes begging.` : 'The chance goes begging.';
  }

  async function automaticFallback() {
    if (fallbackTriggered || resolution) return;
    fallbackTriggered = true;
    diagnostic('renderer_fallback', { fallback:true, durationMs:window.performance.now() - loadStartedAt });
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
    controller?.dispose?.();
    controller = null;
    replayActive = false;
    loadStartedAt = window.performance.now();
    diagnostic('load_start');
    try {
      controller = await mountPlayableSceneRenderer(canvas, moment, scenePlan);
      controller.render({ moment, resolution, progress:resolution ? 1 : 0 });
      diagnostic('renderer_ready', { durationMs:window.performance.now() - loadStartedAt });
    } catch (error) {
      const disabled = error?.message === 'PLAYABLE_PRESENTATION_DISABLED';
      rendererError = disabled
        ? 'Interactive presentation is disabled for this scenario — resolving this same saved moment automatically.'
        : `3D presentation unavailable — ${resolution ? 'showing the already-committed result without re-resolving it.' : 'resolving this same saved moment automatically.'} ${error?.message ?? error}`;
      if (resolution) diagnostic('renderer_fallback', { fallback:true, durationMs:window.performance.now() - loadStartedAt });
      await automaticFallback();
    } finally {
      rendererLoading = false;
    }
  }

  function animationFrameInterval() {
    if (scenePlan.quality.tier === 'low') return 1000 / 30;
    if (scenePlan.quality.tier === 'medium') return 1000 / 45;
    return 0;
  }

  function animationLoop(now) {
    if (resolution && resolution !== lastResolution) {
      lastResolution = resolution;
      animationStarted = now;
      animationProgress = reducedMotion ? 1 : 0;
      replayActive = false;
      diagnostic('result_presented');
      if (scenePlan.audio.enabled) {
        playCommittedPlayablePresentationAudio(moment, resolution, {
          enabled:true,
          volume:scenePlan.audio.volume,
        });
      }
    }
    if (!resolution) {
      lastResolution = null;
      animationStarted = null;
      animationProgress = 0;
      replayCount = 0;
      replayActive = false;
    } else if (animationStarted != null && !reducedMotion) {
      animationProgress = Math.min(1, (now - animationStarted) / 2050);
      if (animationProgress >= 1) {
        animationStarted = null;
        replayActive = false;
      }
    }

    const interval = animationFrameInterval();
    if (!interval || now - lastRenderAt >= interval || animationProgress === 1) {
      controller?.render?.({ moment, resolution, progress:animationProgress });
      lastRenderAt = now;
    }
    animationFrame = window.requestAnimationFrame(animationLoop);
  }

  async function submitIntent(intent) {
    if (!intent || resolution || busy || rendererLoading) return;
    if (scenePlan.audio.enabled) await unlockPlayablePresentationAudio();
    await onsubmit(intent);
  }

  async function simulateSavedMoment() {
    if (busy) return;
    if (scenePlan.audio.enabled) await unlockPlayablePresentationAudio();
    await onsimulate();
  }

  function replayPresentation() {
    if (replayActive) {
      animationProgress = 1;
      animationStarted = null;
      replayActive = false;
      controller?.render?.({ moment, resolution, progress:1 });
      return;
    }
    if (!resolution || !controller || !scenePlan.replay.enabled || replayCount >= scenePlan.replay.maxReplays) return;
    replayCount += 1;
    replayActive = true;
    animationProgress = 0;
    animationStarted = window.performance.now();
    lastRenderAt = 0;
    diagnostic('replay');
    if (scenePlan.audio.enabled) {
      void unlockPlayablePresentationAudio().then(() => {
        playCommittedPlayablePresentationAudio(moment, resolution, { enabled:true, volume:scenePlan.audio.volume });
      });
    }
  }

  function persistPreferences(next) {
    presentationPreferences = writePlayablePresentationPreferences(next);
  }

  function toggleAudio() {
    persistPreferences({ ...presentationPreferences, audioEnabled:!presentationPreferences.audioEnabled });
    if (presentationPreferences.audioEnabled) void unlockPlayablePresentationAudio();
  }

  async function cycleQuality() {
    const values = ['auto', 'low', 'medium', 'high'];
    const next = values[(values.indexOf(presentationPreferences.quality) + 1) % values.length];
    persistPreferences({ ...presentationPreferences, quality:next });
    await mountRenderer();
  }

  function accessibleIntent() {
    if (resolution || busy || rendererLoading) return;
    if (isContinuation) {
      void submitIntent({
        continuation:{
          targetX:selectedLane * .72,
          targetY:selectedHeight,
          weight:continuationType === 'cross' ? .78 : continuationType === 'through_ball' ? .76 : .70,
          timing:.82,
        },
      });
      return;
    }
    if (moment?.mode === 'goalkeeper') {
      void submitIntent({ goalkeeper:{ x:selectedLane * .78, y:selectedHeight, timing:.82 } });
      return;
    }
    void submitIntent({ attack:{ aimX:selectedLane * .78, aimY:selectedHeight, power:.74, timing:.82 } });
  }

  function pointerDown(event) {
    if (resolution || busy || rendererLoading) return;
    pointerStart = { x:event.clientX, y:event.clientY, at:window.performance.now() };
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function pointerUp(event) {
    if (!pointerStart || resolution || busy || rendererLoading) return;
    const bounds = canvas?.getBoundingClientRect?.();
    if (!bounds) return;
    const durationMs = window.performance.now() - pointerStart.at;

    if (isContinuation) {
      const target = controller?.continuationIntentFromClientPoint?.(event.clientX, event.clientY) ?? null;
      if (target) {
        const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
        const diagonal = Math.max(1, Math.hypot(bounds.width, bounds.height));
        void submitIntent({
          continuation:{
            targetX:target.targetX,
            targetY:target.targetY,
            weight:clamp(.48 + (distance / diagonal) * 1.15, .35, 1),
            timing:clamp(1 - Math.abs(durationMs - 430) / 850, 0, 1),
          },
        });
      }
      pointerStart = null;
      return;
    }

    const goalTarget = controller?.goalIntentFromClientPoint?.(event.clientX, event.clientY) ?? null;
    const intent = gestureToPlayableIntent({
      mode:moment?.mode ?? 'attack',
      start:pointerStart,
      end:{ x:event.clientX, y:event.clientY },
      bounds,
      durationMs,
      goalTarget,
    });
    pointerStart = null;
    if (intent) void submitIntent(intent);
  }

  onMount(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    systemReducedMotion = Boolean(media?.matches);
    const onMotionChange = event => { systemReducedMotion = Boolean(event.matches); };
    media?.addEventListener?.('change', onMotionChange);
    void mountRenderer();
    animationFrame = window.requestAnimationFrame(animationLoop);
    return () => {
      media?.removeEventListener?.('change', onMotionChange);
      if (animationFrame != null) window.cancelAnimationFrame(animationFrame);
      controller?.dispose?.();
      controller = null;
    };
  });
</script>

<section class="playable-moment" aria-label="Play Key Moment" data-presentation-version={scenePlan.version} data-quality={scenePlan.quality.tier}>
  <header class="pm-header">
    <div>
      <span>PLAY KEY MOMENT · {moment?.minute ?? 0}'</span>
      <strong>{headline}</strong>
    </div>
    <div class="pm-header-tools">
      <small>{isContinuation ? 'projected ' : ''}xG {Number(moment?.xg ?? 0).toFixed(2)}</small>
      <button type="button" class="pm-tool" onclick={toggleAudio} aria-label={presentationPreferences.audioEnabled ? 'Mute playable moment sound' : 'Enable playable moment sound'}>
        {presentationPreferences.audioEnabled ? 'Sound on' : 'Muted'}
      </button>
      <button type="button" class="pm-tool" onclick={() => { void cycleQuality(); }} aria-label="Change playable moment visual quality">
        {presentationPreferences.quality === 'auto' ? `Auto · ${scenePlan.quality.tier}` : scenePlan.quality.tier}
      </button>
    </div>
  </header>

  <div
    class="pm-stage"
    role="group"
    aria-label={isContinuation ? 'Continuation interaction surface' : isContact ? 'Contact interaction surface' : moment?.mode === 'goalkeeper' ? 'Goalkeeper interaction surface' : 'Shot interaction surface'}
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
    {#if hasResolution}
      <div class="pm-result" class:goal={finish === 'goal'}>{finish ? resultLabel(finish) : continuationResultLabel(continuationResult)}</div>
    {/if}
  </div>

  <div class="pm-copy">
    {#if hasResolution}
      <strong>{resultCopy(finish)}</strong>
      <span>The result above is already committed to the authoritative match state.</span>
      {#if reducedMotion}
        <span class="pm-pref-note">Reduced motion is active — the committed result is shown without replay animation.</span>
      {/if}
    {:else if isContinuation}
      <strong>{moment?.actorName ?? 'Passer'} → {moment?.receiverName ?? 'Authorized receiver'}</strong>
      <span>{instruction}</span>
    {:else}
      <strong>{moment?.shooterName ?? 'Attacker'} vs {moment?.goalkeeperName ?? 'Goalkeeper'}</strong>
      <span>{instruction}</span>
    {/if}
  </div>

  {#if !hasResolution}
    <div class="pm-accessible" aria-label={isContinuation ? 'Accessible continuation controls' : isContact ? 'Accessible contact controls' : 'Accessible aim controls'}>
      <div class="pm-choice" aria-label="Horizontal target">
        <button type="button" class:active={selectedLane === -1} onclick={() => { selectedLane = -1; }}>Left</button>
        <button type="button" class:active={selectedLane === 0} onclick={() => { selectedLane = 0; }}>Centre</button>
        <button type="button" class:active={selectedLane === 1} onclick={() => { selectedLane = 1; }}>Right</button>
      </div>
      <div class="pm-choice" aria-label="Vertical target">
        <button type="button" class:active={selectedHeight === .30} onclick={() => { selectedHeight = .30; }}>{isContinuation ? 'Short' : 'Low'}</button>
        <button type="button" class:active={selectedHeight === .55} onclick={() => { selectedHeight = .55; }}>Mid</button>
        <button type="button" class:active={selectedHeight === .80} onclick={() => { selectedHeight = .80; }}>{isContinuation ? 'Long' : 'High'}</button>
      </div>
    </div>
  {/if}

  <footer class="pm-actions">
    {#if hasResolution}
      {#if scenePlan.replay.enabled && controller && (replayActive || replayCount < scenePlan.replay.maxReplays)}
        <button type="button" disabled={busy} onclick={replayPresentation}>
          {replayActive ? 'Skip Replay' : replayCount ? `Replay (${replayCount}/${scenePlan.replay.maxReplays})` : 'Replay'}
        </button>
      {/if}
      <button type="button" class="primary" disabled={busy} onclick={() => oncontinue()}>{busy ? 'Saving…' : 'Continue Match'}</button>
    {:else}
      <button type="button" class="primary" disabled={busy || rendererLoading} onclick={accessibleIntent}>{busy ? 'Saving…' : primaryAction}</button>
      <button type="button" disabled={busy} onclick={() => { void simulateSavedMoment(); }}>{busy ? 'Saving…' : 'Simulate'}</button>
    {/if}
  </footer>
</section>

<style>
  .playable-moment { position:absolute; inset:0; z-index:120; display:flex; flex-direction:column; background:#07110c; color:#f5f8f6; font-family:var(--font-body, Inter, system-ui, sans-serif); }
  .pm-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:12px 14px; background:#0d1d14; border-bottom:1px solid rgba(255,255,255,.1); }
  .pm-header > div:first-child { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .pm-header span, .pm-header small { font-family:var(--font-mono, monospace); font-size:10px; letter-spacing:.08em; color:#8fb29f; }
  .pm-header strong { font-family:var(--font-display, inherit); font-size:16px; letter-spacing:.04em; }
  .pm-header-tools { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:5px; max-width:52%; }
  .pm-tool { min-height:30px; padding:0 8px; border-radius:999px; font-size:9px; white-space:nowrap; }
  .pm-stage { position:relative; flex:1; min-height:300px; background:#08170f; touch-action:none; user-select:none; overflow:hidden; }
  .pm-stage canvas { display:block; width:100%; height:100%; min-height:300px; }
  .pm-overlay-note { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); max-width:82%; padding:10px 12px; border-radius:8px; background:rgba(3,12,7,.9); text-align:center; font-size:12px; font-weight:700; }
  .pm-warning { color:#ffd6a3; border:1px solid rgba(255,190,108,.35); }
  .pm-result { position:absolute; top:18px; left:50%; transform:translateX(-50%); padding:8px 18px; border-radius:999px; border:1px solid rgba(255,255,255,.2); background:rgba(8,19,13,.9); font-family:var(--font-display, inherit); font-weight:900; letter-spacing:.14em; font-size:18px; }
  .pm-result.goal { background:#17673b; }
  .pm-copy { display:flex; flex-direction:column; gap:3px; padding:10px 14px; background:#0d1d14; border-top:1px solid rgba(255,255,255,.08); }
  .pm-copy strong { font-size:13px; }
  .pm-copy span { color:#a9bbb0; font-size:11px; line-height:1.35; }
  .pm-copy .pm-pref-note { color:#8fb29f; font-size:10px; }
  .pm-accessible { display:grid; grid-template-columns:1fr 1fr; gap:7px; padding:0 14px 10px; background:#0d1d14; }
  .pm-choice { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; }
  button { min-height:44px; border:1px solid rgba(255,255,255,.14); border-radius:9px; background:#14271c; color:#f1f7f3; font:inherit; font-size:12px; font-weight:800; cursor:pointer; }
  button.active { border-color:#6ad998; background:#1d5f3c; }
  button:disabled { opacity:.48; cursor:default; }
  .pm-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; padding:10px 14px max(10px, env(safe-area-inset-bottom)); background:#08130d; border-top:1px solid rgba(255,255,255,.1); }
  .pm-actions .primary:only-child { grid-column:1 / -1; }
  button.primary { background:#1f7548; border-color:#66d898; }
  @media (max-width:520px) {
    .pm-header { gap:8px; padding:10px; }
    .pm-header-tools { max-width:58%; }
    .pm-header strong { font-size:14px; }
    .pm-header-tools small { width:100%; text-align:right; }
    .pm-accessible { grid-template-columns:1fr; padding-inline:10px; }
    .pm-stage { min-height:42vh; }
    button { min-height:46px; }
    .pm-actions { padding-inline:10px; }
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation:none !important; transition:none !important; }
  }
</style>