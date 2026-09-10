<script>
  import { onMount } from 'svelte';

  let { phase = 'Kick off', action = 'Teams set', detail = 'The players take their positions.', paused = false, minute = '0', goal = null, halfTime = false } = $props();

  let typedDetail = $state('');
  let typingTarget = '';
  let lastDetail = '';
  let typingTimer = null;
  let reducedMotion = $state(false);
  let typing = $state(false);

  function clearTypingTimer() {
    if (typingTimer == null) return;
    window.clearTimeout(typingTimer);
    typingTimer = null;
  }

  function characterDelay(character, index, text) {
    if (character === ' ') return 9;
    if (character === ',' || character === ';' || character === ':') return 72;
    if (character === '!' || character === '?') return 190;
    if (character === '.') {
      const previous = text[index - 1];
      const next = text[index + 1];
      return previous === '.' || next === '.' ? 52 : 155;
    }
    return 22;
  }

  function scheduleNextCharacter() {
    clearTypingTimer();
    if (paused || reducedMotion || typedDetail.length >= typingTarget.length) {
      typing = false;
      return;
    }

    typing = true;
    const nextIndex = typedDetail.length;
    const delay = characterDelay(typingTarget[nextIndex], nextIndex, typingTarget);
    typingTimer = window.setTimeout(() => {
      if (paused || reducedMotion) {
        scheduleNextCharacter();
        return;
      }
      typedDetail = typingTarget.slice(0, nextIndex + 1);
      scheduleNextCharacter();
    }, delay);
  }

  function acceptTarget(nextDetail) {
    const next = String(nextDetail ?? '');
    if (next === typingTarget) return;

    const extendsCurrentPassage = next.startsWith(typingTarget) || next.startsWith(typedDetail);
    typingTarget = next;
    if (!extendsCurrentPassage) typedDetail = '';

    if (reducedMotion) {
      clearTypingTimer();
      typedDetail = typingTarget;
      typing = false;
      return;
    }
    scheduleNextCharacter();
  }

  $effect(() => {
    const next = String(detail ?? '');
    if (next === lastDetail) return;
    lastDetail = next;
    acceptTarget(next);
  });

  $effect(() => {
    if (goal) {
      clearTypingTimer();
      typedDetail = typingTarget;
      typing = false;
    }
  });

  $effect(() => {
    if (paused) {
      clearTypingTimer();
      typing = false;
    } else if (!reducedMotion && typedDetail.length < typingTarget.length) {
      scheduleNextCharacter();
    }
  });

  onMount(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => {
      reducedMotion = Boolean(query?.matches);
      if (reducedMotion) {
        clearTypingTimer();
        typedDetail = typingTarget;
        typing = false;
      } else if (!paused && typedDetail.length < typingTarget.length) {
        scheduleNextCharacter();
      }
    };

    syncMotionPreference();
    query?.addEventListener?.('change', syncMotionPreference);
    return () => {
      clearTypingTimer();
      query?.removeEventListener?.('change', syncMotionPreference);
    };
  });
</script>

<section class="match-reader" class:reader-paused={paused} aria-label="Match commentary">
  <div class="reader-meta">
    <span class:paused><i aria-hidden="true"></i>{halfTime ? 'Half-time break' : paused ? 'Paused' : 'Live commentary'}</span>
    <span class="reader-minute">{minute}′</span>
  </div>
  <div class="reader-passage">
    {#if halfTime}
      <p class="reader-phase">Your team talk</p>
      <h2>Take a breath.<br />Make your next move.</h2>
      <p class="reader-detail">Review your tactics and substitutions. The match stays paused until you choose <strong>Start second half</strong>.</p>
    {:else}
    <p class="reader-phase">{phase}</p>
    <h2>{action}</h2>
    <p class="reader-detail" aria-hidden="true">{typedDetail}{#if typing && !paused}<span class="reader-caret" aria-hidden="true"></span>{/if}</p>
    <p class="reader-announcement" aria-live="polite" aria-atomic="true">{action}. {detail}</p>
    {/if}
  </div>
  {#if goal}
    {#key `${goal.minute}:${goal.teamId}:${goal.playerId}`}
      <div class="reader-goal" class:goal-for={goal.isUser} class:goal-against={!goal.isUser} role="status" aria-atomic="true">
        {#if goal.isUser}
          <div class="goal-burst" aria-hidden="true">
            {#each Array.from({length:16}, (_, index) => index) as i (i)}<i style={`--i:${i}`}></i>{/each}
          </div>
        {/if}
        <small class="goal-team">{goal.teamName} · {goal.minute}′</small>
        <span class="goal-title">{goal.isUser ? 'GOAL!' : 'Goal conceded'}</span>
        <strong>{goal.playerName}</strong>
        <div class="goal-score" aria-label={`Score ${goal.homeGoals} to ${goal.awayGoals}`}>{goal.homeGoals}<span>–</span>{goal.awayGoals}</div>
        <small>{goal.isUser ? 'Your team finds the net' : 'Regroup. The next move is yours.'}</small>
      </div>
    {/key}
  {/if}
  <div class="reader-footer" aria-hidden="true"><span>Pitch / Matchday</span><span>● ● ●</span></div>
</section>

<style>
  .match-reader { position:relative; flex-shrink:0; width:100%; min-width:0; border:1px solid var(--color-line); border-radius:12px; background:var(--color-surface); color:var(--color-tx); overflow:hidden; }
  .reader-meta { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 20px; border-bottom:1px solid var(--color-line); font:500 11px/1.4 var(--font-mono); letter-spacing:.055em; }
  .reader-meta > span:first-child { display:flex; gap:8px; align-items:center; color:var(--color-live); }
  .reader-meta > span.paused { color:var(--color-tx-2); }
  .reader-meta i { width:5px; height:5px; border-radius:50%; background:currentColor; }
  .reader-minute { font-variant-numeric:tabular-nums; color:var(--color-tx-2); }
  .reader-passage { min-height:216px; padding:28px 24px 32px; border-left:3px solid var(--color-club); }
  .reader-phase { margin:0 0 12px; color:var(--color-tx-2); font:500 11px/1.5 var(--font-mono); letter-spacing:.085em; text-transform:uppercase; }
  h2 { margin:0 0 16px; max-width:26ch; font:700 clamp(29px, 5vw, 40px)/1.05 var(--font-display); letter-spacing:.005em; text-wrap:balance; }
  .reader-detail { margin:0; max-width:60ch; color:var(--color-tx-2); font:400 16px/1.68 var(--font-body); text-wrap:pretty; overflow-wrap:anywhere; }
  .reader-caret { display:inline-block; width:.55ch; height:1em; margin-left:.12em; vertical-align:-.12em; background:currentColor; opacity:.72; }
  .reader-announcement { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0, 0, 0, 0); white-space:nowrap; border:0; }
  .reader-goal { position:absolute; inset:43px 0 35px; isolation:isolate; display:flex; flex-direction:column; justify-content:center; gap:12px; padding:24px 20px; text-align:center; background:var(--color-surface); overflow:hidden; animation:goal-arrive .45s ease-out both; }
  .reader-goal::before { content:''; position:absolute; inset:0; z-index:-1; background:radial-gradient(ellipse at 50% 40%, color-mix(in oklch, var(--color-live) 18%, transparent), transparent 75%); }
  .goal-title { color:var(--color-live); font:800 clamp(56px, 16vw, 80px)/.95 var(--font-display); letter-spacing:-.02em; }
  .reader-goal strong { font:600 22px/1.2 var(--font-body); overflow-wrap:anywhere; }
  .reader-goal small { color:var(--color-tx-2); font:400 12px/1.5 var(--font-mono); }
  .goal-team { text-transform:uppercase; letter-spacing:.06em; }
  .goal-score { display:flex; justify-content:center; align-items:center; gap:18px; font:700 38px/1 var(--font-display); font-variant-numeric:tabular-nums; }
  .goal-score span { color:var(--color-tx-3); font-size:24px; }
  .goal-against { border-top:3px solid var(--color-bad); animation:conceded-arrive .35s ease-out both; }
  .goal-against .goal-title { color:var(--color-bad); font-size:clamp(34px, 10vw, 48px); }
  .goal-against::before { background:linear-gradient(180deg, color-mix(in oklch, var(--color-bad) 9%, transparent), transparent); }
  .goal-for .goal-title { animation:goal-title .6s cubic-bezier(.16,1,.3,1) both; }
  .goal-burst { position:absolute; inset:0; z-index:-1; pointer-events:none; }
  .goal-burst i { position:absolute; left:calc(5% + var(--i) * 6%); top:-12px; width:5px; height:12px; background:var(--color-live); opacity:0; animation:confetti 2.8s ease-out calc(var(--i) * 45ms) both; }
  .goal-burst i:nth-child(3n) { background:var(--color-club); width:7px; height:7px; }
  .goal-burst i:nth-child(3n + 1) { background:var(--color-tx); }
  .reader-paused .reader-goal, .reader-paused .goal-title, .reader-paused .goal-burst i { animation-play-state:paused; }
  @keyframes goal-arrive { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes goal-title { from { opacity:0; transform:scale(.7); } to { opacity:1; transform:scale(1); } }
  @keyframes conceded-arrive { from { opacity:0; } to { opacity:1; } }
  @keyframes confetti { 10% { opacity:.8; } to { opacity:0; transform:translateY(400px) rotate(240deg); } }
  @media (prefers-reduced-motion:reduce) { .reader-goal, .goal-for .goal-title { animation:none; } .goal-burst { display:none; } }
  .reader-footer { padding:11px 20px; border-top:1px solid var(--color-line); display:flex; justify-content:space-between; color:var(--color-tx-3); font:400 10px/1.4 var(--font-mono); letter-spacing:.075em; text-transform:uppercase; }
  .reader-footer span:last-child { letter-spacing:4px; }
  @media (max-width:520px) {
    .reader-meta { padding:12px 16px; }
    .reader-passage { padding:24px 17px 28px; min-height:210px; }
    h2 { font-size:clamp(27px, 8vw, 34px); }
    .reader-detail { font-size:16px; line-height:1.65; }
    .reader-goal { gap:10px; }
  }
</style>
