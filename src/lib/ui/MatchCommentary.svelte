<script>
  import { onMount } from 'svelte';

  let { phase = 'Kick off', action = 'Teams set', detail = 'The players take their positions.', paused = false, minute = '0', goal = null } = $props();

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

<section class="match-reader" aria-label="Match commentary">
  <div class="reader-meta">
    <span class:paused><i aria-hidden="true"></i>{paused ? 'Paused' : 'Live commentary'}</span>
    <span class="reader-minute">{minute}′</span>
  </div>
  <div class="reader-passage">
    <p class="reader-phase">{phase}</p>
    <h2>{action}</h2>
    <p class="reader-detail" aria-hidden="true">{typedDetail}{#if typing && !paused}<span class="reader-caret" aria-hidden="true"></span>{/if}</p>
    <p class="reader-announcement" aria-live="polite" aria-atomic="true">{action}. {detail}</p>
  </div>
  {#if goal}
    <div class="reader-goal" role="status">
      <span>Goal</span><div><strong>{goal.playerName}</strong><small>{goal.minute}′ · {goal.teamName}</small></div>
    </div>
  {/if}
  <div class="reader-footer" aria-hidden="true"><span>Pitch / Matchday</span><span>● ● ●</span></div>
</section>

<style>
  .match-reader { width:100%; min-width:0; border:1px solid var(--color-line); border-radius:12px; background:var(--color-surface); color:var(--color-tx); overflow:hidden; }
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
  .reader-goal { display:flex; gap:18px; align-items:center; margin:0 20px 20px; padding:16px; background:var(--color-raised); border-left:3px solid var(--color-live); border-radius:3px; }
  .reader-goal > span { color:var(--color-live); text-transform:uppercase; font:800 34px/1 var(--font-display); }
  .reader-goal strong { display:block; font:600 17px/1.3 var(--font-body); overflow-wrap:anywhere; }
  .reader-goal small { display:block; margin-top:4px; color:var(--color-tx-2); font:400 12px/1.5 var(--font-mono); }
  .reader-footer { padding:11px 20px; border-top:1px solid var(--color-line); display:flex; justify-content:space-between; color:var(--color-tx-3); font:400 10px/1.4 var(--font-mono); letter-spacing:.075em; text-transform:uppercase; }
  .reader-footer span:last-child { letter-spacing:4px; }
  @media (max-width:520px) {
    .reader-meta { padding:12px 16px; }
    .reader-passage { padding:24px 17px 28px; min-height:210px; }
    h2 { font-size:clamp(27px, 8vw, 34px); }
    .reader-detail { font-size:16px; line-height:1.65; }
    .reader-goal { margin-inline:16px; gap:12px; }
  }
</style>
