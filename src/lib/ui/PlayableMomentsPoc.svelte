<script>
  import { onMount } from 'svelte';
  import {
    MATCH_PHASES,
    buildLiveMatchState,
    resumePlayableMatchPhase,
    simulateMatchSegment,
  } from '../../modules/matchEngine.js';
  import { createUserTacticalPlan } from '../../modules/tactics.js';
  import {
    PLAYABLE_POC_RENDERERS,
    gestureToPlayableIntent,
    percentile95,
  } from '../../game/playableMomentsPocScene.js';
  import {
    POC_ATTACKING_SCENARIOS,
    createPocAttackingMoment,
    pocPenaltyDiveDirection,
    pocScenarioHint,
    pocScenarioStatus,
    resolvePocAttackingMoment,
  } from '../../game/playableMomentsPocScenarios.js';

  const POSITIONS = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RW','LW','ST','GK','CB','CM','RW','ST','LB','CDM'];
  const renderer = PLAYABLE_POC_RENDERERS.three;
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  let canvas = $state();
  let controller = null;
  let rendererError = $state('');
  let rendererLoading = $state(false);
  let metrics = $state(null);
  let frameTimes = [];
  let lifecycleResult = $state('');
  let animationFrame = 0;
  let animationStarted = null;
  let currentProgress = 0;

  let source = $state('synthetic');
  let syntheticScenario = $state('shot');
  let syntheticAttempt = $state(0);
  let currentMoment = $state(createPocAttackingMoment('shot', 0));
  let resolution = $state(null);
  let status = $state(pocScenarioHint('shot'));
  let selectedLane = $state(0);
  let selectedHeight = $state(.55);
  let pointerStart = null;

  let fixture = null;
  let liveState = $state(null);
  let pendingContinuation = $state(null);
  let currentPhase = $state(1);
  let fixtureEvents = $state([]);
  let fixtureComplete = $state(false);

  const currentScenarioLabel = $derived(
    POC_ATTACKING_SCENARIOS.find(item => item.id === syntheticScenario)?.label ?? 'Open-play shot'
  );

  function makePlayer(id, position, rating = 78) {
    const attacking = ['ST','CF','RW','LW','CAM'].includes(position);
    const midfield = ['CM','CDM','CAM','RM','LM','RW','LW'].includes(position);
    const defending = ['CB','RB','LB','CDM'].includes(position);
    return {
      id,
      name:id.replaceAll('_', ' '),
      position,
      age:25,
      attack:attacking ? rating : rating - 10,
      midfield:midfield ? rating : rating - 8,
      defence:defending ? rating : rating - 18,
      goalkeeping:position === 'GK' ? rating : 8,
      fitness:94,
      form:50,
      individualMorale:50,
      sharpness:50,
      traits:[],
      injured:false,
      suspended:false,
      inSquad:true,
      appearances:0,
      goals:0,
      assists:0,
      positionSuitability:{ [position]:1 },
      attributeProfile:{
        version:1,
        pace:rating,
        shooting:attacking ? rating + 2 : rating - 12,
        passing:midfield || attacking ? rating : rating - 8,
        dribbling:attacking || midfield ? rating : rating - 8,
        defending:defending ? rating : rating - 18,
        physical:rating,
      },
    };
  }

  function makeSquad(prefix, rating) {
    return POSITIONS.map((position, index) => makePlayer(`${prefix}_${index}`, position, rating + (index % 3) - 1));
  }

  function createPocFixture() {
    const home = {
      id:'poc-home',
      name:'Pitch POC XI',
      crest:'P',
      reputation:82,
      tacticalPlan:createUserTacticalPlan({ buildUp:'direct', transition:'counter', tempo:'fast' }),
    };
    const away = { id:'poc-away', name:'Engine XI', crest:'E', reputation:80 };
    const homePlayers = makeSquad('home', 82);
    const awayPlayers = makeSquad('away', 80);
    const state = buildLiveMatchState(
      home,
      away,
      homePlayers,
      awayPlayers,
      '4-3-3',
      '4-3-3',
      null,
      null,
      'balanced',
      'balanced',
      { seed:'playable-key-moments-poc-fixture' },
    );
    return { home, away, homePlayers, awayPlayers, state };
  }

  async function mountRenderer() {
    if (!canvas) return;
    rendererLoading = true;
    rendererError = '';
    controller?.dispose?.();
    controller = null;
    frameTimes = [];
    try {
      const module = await import('../../game/playableMomentsThreeRenderer.js');
      controller = await module.mountThreePlayablePoc(canvas, currentMoment);
      metrics = {
        loadMs:controller.loadMs,
        initMs:controller.initMs,
        readyMs:controller.readyMs,
        frameP95:null,
        frames:0,
      };
      controller.render({ moment:currentMoment, resolution, progress:currentProgress });
    } catch (error) {
      rendererError = `${renderer.label} failed to load: ${error?.message ?? error}`;
      status = '3D renderer unavailable. The authoritative Simulate path remains usable.';
    } finally {
      rendererLoading = false;
    }
  }

  function startAnimation(nextResolution) {
    resolution = nextResolution;
    animationStarted = window.performance.now();
    currentProgress = reducedMotion ? 1 : 0;
    if (reducedMotion) controller?.render?.({ moment:currentMoment, resolution, progress:1 });
  }

  function updateMetrics(delta) {
    if (!Number.isFinite(delta) || delta <= 0 || delta > 250 || !metrics) return;
    frameTimes = [...frameTimes.slice(-299), delta];
    metrics = {
      ...metrics,
      frameP95:percentile95(frameTimes),
      frames:frameTimes.length,
    };
  }

  function animationLoop(now) {
    const previous = animationLoop.previousTime;
    if (previous != null) updateMetrics(now - previous);
    animationLoop.previousTime = now;
    if (animationStarted != null && !reducedMotion) {
      currentProgress = Math.min(1, (now - animationStarted) / 1650);
      if (currentProgress >= 1) animationStarted = null;
    }
    controller?.render?.({ moment:currentMoment, resolution, progress:currentProgress });
    animationFrame = window.requestAnimationFrame(animationLoop);
  }

  function syntheticResolve(intent) {
    const shot = resolvePocAttackingMoment(currentMoment, intent ?? null);
    startAnimation({ shot });
    status = pocScenarioStatus(currentMoment, shot);
  }

  function resetSynthetic(scenario = syntheticScenario, attempt = 0) {
    source = 'synthetic';
    syntheticScenario = scenario;
    syntheticAttempt = attempt;
    currentMoment = createPocAttackingMoment(scenario, attempt);
    resolution = null;
    currentProgress = 0;
    animationStarted = null;
    selectedLane = 0;
    selectedHeight = scenario === 'free_kick' || scenario === 'long_shot' ? .78 : .55;
    status = pocScenarioHint(scenario);
    controller?.render?.({ moment:currentMoment, resolution:null, progress:0 });
  }

  function nextSyntheticAttempt() {
    resetSynthetic(syntheticScenario, syntheticAttempt + 1);
  }

  function startAuthoritativeFixture() {
    source = 'authoritative';
    fixture = createPocFixture();
    liveState = fixture.state;
    pendingContinuation = null;
    currentPhase = 1;
    fixtureEvents = [];
    fixtureComplete = false;
    resolution = null;
    currentProgress = 0;
    status = 'Running the real authoritative phase loop until the next user-owned attacking shot…';
    findNextAuthoritativeMoment();
  }

  function findNextAuthoritativeMoment() {
    if (!fixture || !liveState || fixtureComplete) return;
    pendingContinuation = null;
    resolution = null;
    currentProgress = 0;
    for (let phase = currentPhase; phase <= MATCH_PHASES; phase += 1) {
      const part = simulateMatchSegment(
        fixture.home,
        fixture.away,
        liveState,
        phase,
        phase,
        fixture.home.id,
        { suspend:true, controlledTeamId:fixture.home.id },
      );
      if (part.pendingPlayableMoment) {
        // The resolver contract is attacking-only. Keep this guard so a future
        // regression cannot accidentally revive a defending POC interaction.
        if (part.pendingPlayableMoment.mode !== 'attack'
          || part.pendingPlayableMoment.attackingTeamId !== fixture.home.id) {
          const automatic = resumePlayableMatchPhase(
            fixture.home,
            fixture.away,
            liveState,
            part.playableContinuation,
            null,
            fixture.home.id,
          );
          liveState = automatic.updatedState;
          fixtureEvents = [...fixtureEvents, ...automatic.segEvents];
          currentPhase = phase + 1;
          continue;
        }
        currentPhase = phase;
        currentMoment = part.pendingPlayableMoment;
        pendingContinuation = part.playableContinuation;
        const eventLabel = currentMoment.setPiece?.kind === 'direct_free_kick'
          ? 'direct free kick'
          : currentMoment.setPiece?.kind === 'penalty'
            ? 'penalty'
            : currentMoment.geometry?.staging?.variant?.startsWith?.('one_on_one')
              ? '1v1'
              : currentMoment.geometry?.staging?.distanceBand === 'edge'
                ? 'long shot'
                : 'attacking shot';
        status = `${currentMoment.minute}' — user-owned ${eventLabel} from the real Pitch phase resolver.`;
        controller?.render?.({ moment:currentMoment, resolution:null, progress:0 });
        return;
      }
      liveState = part.updatedState;
      fixtureEvents = [...fixtureEvents, ...part.segEvents];
      currentPhase = phase + 1;
    }
    fixtureComplete = true;
    status = `Temporary fixture complete: ${liveState.hGoals}-${liveState.aGoals}. No career data was written.`;
  }

  function authoritativeResolve(intent) {
    if (!fixture || !pendingContinuation) return;
    const part = resumePlayableMatchPhase(
      fixture.home,
      fixture.away,
      liveState,
      pendingContinuation,
      intent,
      fixture.home.id,
    );
    liveState = part.updatedState;
    fixtureEvents = [...fixtureEvents, ...part.segEvents];
    pendingContinuation = null;
    startAnimation(part.playableResolution);
    status = `${part.playableResolution.moment.minute}' — ${part.playableResolution.shot.finish.toUpperCase()} committed to the authoritative ledger. Score ${liveState.hGoals}-${liveState.aGoals}.`;
    currentPhase += 1;
  }

  function resolveIntent(intent) {
    if (source === 'authoritative') authoritativeResolve(intent);
    else syntheticResolve(intent);
  }

  function simulateCurrent() {
    resolveIntent(null);
  }

  function accessibleAction() {
    resolveIntent({ attack:{ aimX:selectedLane * .80, aimY:selectedHeight, power:.78, timing:.86 } });
  }

  function pointerDown(event) {
    const point = event.touches?.[0] ?? event;
    pointerStart = { x:point.clientX, y:point.clientY, at:window.performance.now() };
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function pointerUp(event) {
    if (!pointerStart || (source === 'authoritative' && !pendingContinuation)) return;
    const point = event.changedTouches?.[0] ?? event;
    const bounds = canvas.getBoundingClientRect();
    const goalTarget = controller?.goalIntentFromClientPoint?.(point.clientX, point.clientY) ?? null;
    const intent = gestureToPlayableIntent({
      mode:'attack',
      start:pointerStart,
      end:{ x:point.clientX, y:point.clientY },
      bounds,
      durationMs:window.performance.now() - pointerStart.at,
      goalTarget,
    });
    pointerStart = null;
    if (intent) resolveIntent(intent);
  }

  async function runLifecycleCheck() {
    if (!canvas || rendererLoading) return;
    lifecycleResult = 'Running 20 mount/dispose cycles…';
    const currentController = controller;
    controller = null;
    currentController?.dispose?.();
    let completed = 0;
    try {
      const module = await import('../../game/playableMomentsThreeRenderer.js');
      for (let index = 0; index < 20; index += 1) {
        const temporary = await module.mountThreePlayablePoc(canvas, currentMoment);
        temporary.render({ moment:currentMoment, resolution, progress:currentProgress });
        temporary.dispose();
        completed += 1;
      }
      lifecycleResult = `${completed}/20 mount/dispose cycles completed without an exception. Browser heap/GPU retention still requires manual devtools inspection.`;
    } catch (error) {
      lifecycleResult = `Lifecycle check stopped at ${completed}/20: ${error?.message ?? error}`;
    }
    await mountRenderer();
  }

  function closePoc() {
    const url = new window.URL(window.location.href);
    url.searchParams.delete('playable-poc');
    window.location.href = url.toString();
  }

  onMount(() => {
    mountRenderer();
    animationFrame = window.requestAnimationFrame(animationLoop);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      controller?.dispose?.();
      controller = null;
    };
  });
</script>

<div class="poc-shell" role="dialog" aria-modal="true" aria-label="Playable Key Moments proof of concept">
  <header class="poc-header">
    <div>
      <div class="eyebrow">DEV-ONLY · ATTACKING KEY MOMENTS</div>
      <h1>Playable Key Moments</h1>
      <p>Three.js · attacking shots only · authoritative outcome rules · no career writeback</p>
    </div>
    <button class="ghost" type="button" onclick={closePoc}>Close POC</button>
  </header>

  <section class="toolbar" aria-label="POC mode controls">
    <div class="control-group renderer-choice">
      <span>Renderer</span>
      <strong>{renderer.label} {renderer.version}</strong>
    </div>
    <div class="control-group scenario-picker">
      <span>Scenario</span>
      {#each POC_ATTACKING_SCENARIOS as scenario (scenario.id)}
        <button
          type="button"
          class:active={source === 'synthetic' && syntheticScenario === scenario.id}
          onclick={() => resetSynthetic(scenario.id)}
        >{scenario.label}</button>
      {/each}
      <button type="button" class:active={source === 'authoritative'} onclick={startAuthoritativeFixture}>Real fixture</button>
    </div>
  </section>

  <main class="poc-main">
    <section class="stage-card">
      <div class="score-strip">
        <span>{source === 'authoritative' ? `${liveState?.hGoals ?? 0} — ${liveState?.aGoals ?? 0}` : 'ATTACKING HARNESS'}</span>
        <strong>{source === 'synthetic' ? currentScenarioLabel.toUpperCase() : 'REAL ATTACK'}</strong>
        <span>{currentMoment?.minute ? `${currentMoment.minute}'` : 'Synthetic'}</span>
      </div>
      <div
        class="stage"
        class:loading={rendererLoading}
        role="group"
        aria-label="Playable football attacking interaction surface"
        onpointerdown={pointerDown}
        onpointerup={pointerUp}
        onpointercancel={() => pointerStart = null}
      >
        <canvas bind:this={canvas} aria-label="Playable football 3D scene"></canvas>
        {#if rendererLoading}<div class="stage-message">Loading {renderer.label}…</div>{/if}
        {#if rendererError}<div class="stage-message error">{rendererError}</div>{/if}
        {#if source === 'synthetic' && !resolution}
          <div class="stage-hint special-hint">{pocScenarioHint(syntheticScenario)}</div>
        {/if}
        {#if source === 'synthetic' && syntheticScenario === 'penalty' && !resolution}
          <div class="rng-note">POC RNG packet: keeper will commit {pocPenaltyDiveDirection(currentMoment)}</div>
        {/if}
        {#if source === 'authoritative' && !pendingContinuation && !fixtureComplete && currentPhase > 1}
          <div class="stage-message">Moment committed. Continue when ready.</div>
        {/if}
      </div>
      <p class="status" aria-live="polite">{status}</p>
      <div class="stage-actions">
        <button
          type="button"
          class="primary"
          onclick={accessibleAction}
          disabled={source === 'authoritative' && !pendingContinuation}
        >Take shot</button>
        <button
          type="button"
          onclick={simulateCurrent}
          disabled={source === 'authoritative' && !pendingContinuation}
        >Simulate</button>
        {#if source === 'synthetic'}
          <button type="button" onclick={nextSyntheticAttempt}>New RNG attempt</button>
        {/if}
        {#if source === 'authoritative' && !pendingContinuation && !fixtureComplete}
          <button type="button" onclick={findNextAuthoritativeMoment}>Next attacking moment</button>
        {/if}
        {#if source === 'authoritative' && fixtureComplete}
          <button type="button" onclick={startAuthoritativeFixture}>Restart fixture</button>
        {/if}
      </div>
    </section>

    <aside class="panel">
      <h2>How this scenario works</h2>
      {#if source === 'synthetic' && syntheticScenario === 'penalty'}
        <p>The goalkeeper commits left, centre or right from a deterministic RNG packet that is independent of your chosen aim. Pick your placement and try to send the ball away from the dive.</p>
      {:else if source === 'synthetic' && syntheticScenario === 'free_kick'}
        <p>A real four-player wall is placed 9.15 metres from the ball. A playable direct free kick only scores when the resolved trajectory reaches either top corner; other on-target efforts are saved or can hit the wall.</p>
      {:else if source === 'synthetic' && syntheticScenario === 'long_shot'}
        <p>This is the engine's edge-of-box / low-xG shot case. It can only score when the resolved trajectory reaches a top corner, making long-range goals a placement challenge.</p>
      {:else if source === 'synthetic' && syntheticScenario === 'one_on_one'}
        <p>This uses the engine's pass-in-behind 1v1 staging. Compared with an ordinary shot, the chance has reduced initial block risk and reduced effective goalkeeper reach.</p>
      {:else if source === 'synthetic'}
        <p>This is a normal open-play shot using the same interactive shot resolver used by career Play Key Moments.</p>
      {:else}
        <p>The real fixture runs Pitch's authoritative match phases and only pauses for your team's own shots, direct free kicks or penalties. Opponent attacks resolve automatically.</p>
      {/if}

      <h2>Accessible controls</h2>
      <p>These controls exercise the same normalized attacking intent contract without a drag gesture.</p>
      <div class="choice-row" aria-label="Horizontal aim">
        <button type="button" class:active={selectedLane === -1} onclick={() => selectedLane = -1}>Left</button>
        <button type="button" class:active={selectedLane === 0} onclick={() => selectedLane = 0}>Centre</button>
        <button type="button" class:active={selectedLane === 1} onclick={() => selectedLane = 1}>Right</button>
      </div>
      <div class="choice-row" aria-label="Vertical aim">
        <button type="button" class:active={selectedHeight === .30} onclick={() => selectedHeight = .30}>Low</button>
        <button type="button" class:active={selectedHeight === .55} onclick={() => selectedHeight = .55}>Mid</button>
        <button type="button" class:active={selectedHeight === .78} onclick={() => selectedHeight = .78}>High</button>
      </div>

      <h2>Renderer evidence</h2>
      <div class="metric-card current">
        <div><strong>{renderer.label}</strong><span>{renderer.version} · {renderer.licence}</span></div>
        {#if metrics}
          <dl>
            <dt>Module load</dt><dd>{metrics.loadMs.toFixed(1)} ms</dd>
            <dt>Init</dt><dd>{metrics.initMs.toFixed(1)} ms</dd>
            <dt>Ready</dt><dd>{metrics.readyMs.toFixed(1)} ms</dd>
            <dt>p95 frame</dt><dd>{metrics.frameP95 == null ? 'collecting…' : `${metrics.frameP95.toFixed(1)} ms`}</dd>
            <dt>Samples</dt><dd>{metrics.frames}</dd>
          </dl>
        {:else}
          <p>Renderer metrics begin once the scene loads.</p>
        {/if}
      </div>
      <button type="button" onclick={runLifecycleCheck} disabled={rendererLoading}>Run 20× lifecycle check</button>
      {#if lifecycleResult}<p class="evidence-note">{lifecycleResult}</p>{/if}
      <p class="evidence-note">Reduced motion: <strong>{reducedMotion ? 'active' : 'not requested'}</strong>. Network/device/browser must be recorded with any benchmark.</p>

      {#if source === 'authoritative' && liveState}
        <h2>Authoritative state</h2>
        <dl class="state-list">
          <dt>Phase</dt><dd>{Math.min(currentPhase, MATCH_PHASES)}/{MATCH_PHASES}</dd>
          <dt>Ledger records</dt><dd>{liveState.actionLedger?.length ?? 0}</dd>
          <dt>Events</dt><dd>{fixtureEvents.length}</dd>
          <dt>RNG state</dt><dd>{liveState.rngState}</dd>
        </dl>
      {/if}
    </aside>
  </main>
</div>

<style>
  :global(body) { overflow:hidden; }
  .poc-shell { position:fixed; inset:0; z-index:10000; overflow:auto; background:#07110c; color:#f4f7f5; font-family:Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; }
  .poc-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:18px clamp(16px, 3vw, 36px); border-bottom:1px solid rgba(255,255,255,.1); background:rgba(5,17,11,.96); }
  .eyebrow { font-size:11px; font-weight:800; letter-spacing:.14em; color:#78d79f; }
  h1 { margin:3px 0 2px; font-size:clamp(22px, 4vw, 34px); line-height:1.05; }
  .poc-header p, .panel p { margin:0; color:#a9b9af; font-size:13px; }
  button { border:1px solid rgba(255,255,255,.14); border-radius:9px; padding:9px 12px; background:#13251b; color:#eef5f0; font:inherit; font-size:13px; font-weight:700; cursor:pointer; }
  button:hover { background:#1a3224; }
  button.active, button.primary { border-color:#67d996; background:#1d7044; }
  button:disabled { opacity:.45; cursor:not-allowed; }
  button.ghost { background:transparent; }
  .toolbar { display:flex; flex-wrap:wrap; gap:12px 24px; padding:12px clamp(16px, 3vw, 36px); border-bottom:1px solid rgba(255,255,255,.08); }
  .control-group { display:flex; flex-wrap:wrap; align-items:center; gap:7px; }
  .control-group > span { margin-right:4px; color:#8da197; font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
  .renderer-choice strong { font-size:13px; color:#dce8e0; }
  .scenario-picker { flex:1; }
  .poc-main { display:grid; grid-template-columns:minmax(0, 1fr) minmax(250px, 340px); gap:16px; padding:16px clamp(12px, 2.5vw, 30px) 28px; max-width:1400px; margin:0 auto; }
  .stage-card, .panel { border:1px solid rgba(255,255,255,.1); border-radius:14px; background:#0c1912; overflow:hidden; box-shadow:0 12px 40px rgba(0,0,0,.28); }
  .score-strip { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:12px; padding:10px 14px; background:#111f17; font-size:12px; color:#a9b9af; }
  .score-strip strong { color:#f5faf7; letter-spacing:.08em; font-size:11px; }
  .score-strip span:last-child { text-align:right; }
  .stage { position:relative; min-height:min(62vh, 620px); background:#08170f; touch-action:none; user-select:none; }
  canvas { display:block; width:100%; height:min(62vh, 620px); min-height:360px; }
  .stage-message { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); max-width:80%; padding:11px 14px; border-radius:9px; background:rgba(3,12,7,.88); text-align:center; font-weight:700; }
  .stage-message.error { border:1px solid #b85c55; color:#ffc3bd; }
  .stage-hint { position:absolute; left:50%; top:13px; transform:translateX(-50%); width:max-content; max-width:calc(100% - 28px); padding:7px 11px; border-radius:999px; background:rgba(3,12,7,.84); font-size:10px; font-weight:900; letter-spacing:.08em; text-align:center; pointer-events:none; }
  .special-hint { border:1px solid rgba(255,216,107,.7); color:#ffe7a0; }
  .rng-note { position:absolute; left:50%; bottom:12px; transform:translateX(-50%); width:max-content; max-width:calc(100% - 24px); padding:7px 10px; border-radius:8px; background:rgba(3,12,7,.86); color:#bfeecf; font-size:10px; font-weight:800; text-align:center; pointer-events:none; }
  .status { min-height:20px; margin:0; padding:10px 14px 0; color:#c7d4cc; font-size:13px; }
  .stage-actions { display:flex; flex-wrap:wrap; gap:8px; padding:10px 14px 14px; }
  .panel { padding:14px; overflow:auto; max-height:calc(100vh - 150px); }
  .panel h2 { margin:4px 0 6px; font-size:14px; }
  .panel h2:not(:first-child) { margin-top:18px; }
  .choice-row { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:8px; }
  .choice-row button { padding:8px 5px; }
  .metric-card { margin:8px 0; padding:10px; border:1px solid rgba(255,255,255,.08); border-radius:9px; background:#101f17; }
  .metric-card.current { border-color:rgba(103,217,150,.55); }
  .metric-card > div { display:flex; justify-content:space-between; gap:8px; }
  .metric-card span { color:#8fa399; font-size:11px; }
  dl { display:grid; grid-template-columns:1fr auto; gap:4px 12px; margin:9px 0 0; font-size:12px; }
  dt { color:#8fa399; }
  dd { margin:0; font-variant-numeric:tabular-nums; }
  .evidence-note { margin-top:8px !important; line-height:1.45; }
  .state-list { padding-top:4px; border-top:1px solid rgba(255,255,255,.08); }
  @media (max-width:800px) {
    .poc-main { grid-template-columns:1fr; }
    .stage { min-height:52vh; }
    canvas { height:52vh; min-height:330px; }
    .panel { max-height:none; }
  }
  @media (max-width:520px) {
    .poc-header { padding:13px 12px; }
    .poc-header p { display:none; }
    .toolbar { padding:9px 10px; gap:9px; }
    .control-group { width:100%; }
    .control-group button { flex:1; padding:8px 6px; }
    .poc-main { padding:10px; }
    .stage { min-height:48vh; }
    canvas { height:48vh; min-height:300px; }
    .stage-hint { top:9px; max-width:calc(100% - 18px); font-size:9px; }
    .rng-note { bottom:9px; font-size:9px; }
  }
  @media (prefers-reduced-motion: reduce) {
    * { scroll-behavior:auto !important; transition:none !important; animation:none !important; }
  }
</style>
