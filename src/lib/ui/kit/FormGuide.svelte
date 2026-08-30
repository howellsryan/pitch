<script>
  /**
   * Recent results as bars, oldest first — the reading order of a form line
   * everywhere in football.
   *
   * Colour alone does not carry the result: each bar has a text label for
   * screen readers, because W/D/L rendered only as green/grey/red is
   * invisible to a red-green colourblind player, and form drives every
   * decision on the Home screen.
   */
  let { form = [], size = 'md' } = $props();

  const TONE = { W: 'w', D: 'd', L: 'l' };
  const WORD = { W: 'Won', D: 'Drew', L: 'Lost' };
  const items = $derived(form.map((r) => {
    const k = String(r ?? '').toUpperCase();
    return { tone: TONE[k] ?? 'n', word: WORD[k] ?? 'Not played' };
  }));
</script>

<div class="form {size}">
  {#each items as it, i (i)}
    <span class="bar {it.tone}"><span class="sr">{it.word}</span></span>
  {/each}
</div>

<style>
  .form { display: flex; gap: 4px; align-items: center; }
  .bar { display: block; border-radius: 2px; background: var(--color-tx-3); }
  .md .bar { width: 20px; height: 4px; }
  .sm .bar { width: 14px; height: 3px; }
  .lg .bar { width: 26px; height: 5px; }
  .w { background: var(--color-live); }
  .d { background: var(--color-tx-3); }
  .l { background: var(--color-bad); }
  .n { background: var(--color-line); }
  .sr {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
