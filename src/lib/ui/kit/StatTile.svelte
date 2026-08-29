<script>
  /** Label-over-value tile. Value is display-face so it reads at a glance. */
  let { label = '', value = '', tone = 'default', sub = null } = $props();
</script>

<div class="tile">
  <span class="lbl">{label}</span>
  <span class="val {tone}">{value}</span>
  {#if sub}<span class="sub">{sub}</span>{/if}
</div>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 11px 12px;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-bug);
    background: var(--color-surface);
  }
  .lbl {
    font-family: var(--font-mono);
    font-size: 9.5px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-tx-3);
  }
  .val {
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.01em;
  }
  .sub { font-family: var(--font-body); font-size: 11px; color: var(--color-tx-2); }
  .default { color: var(--color-tx); }
  .live { color: var(--color-live); }
  .warn { color: var(--color-warn); }
  .bad  { color: var(--color-bad); }
  .club { color: var(--color-club); }
  .accent { color: var(--color-accent); }
</style>
