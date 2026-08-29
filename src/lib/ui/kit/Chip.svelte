<script>
  /** Filter / tag pill. `selected` is the filter state, not a hover style. */
  let { selected = false, tone = 'neutral', onclick, children, class: klass = '', ...rest } = $props();
</script>

{#if onclick}
  <button {...rest} class="chip {tone} {klass}" class:selected aria-pressed={selected} {onclick}>{@render children?.()}</button>
{:else}
  <span {...rest} class="chip {tone} {klass}" class:selected>{@render children?.()}</span>
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 13px;
    border: 1px solid var(--color-line);
    border-radius: 999px;
    background: transparent;
    color: var(--color-tx-2);
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    transition: background-color var(--dur-fast) var(--ease-out),
                color var(--dur-fast) var(--ease-out);
  }
  button.chip { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  button.chip:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  .selected { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-on-accent); }
  .live { color: var(--color-live); border-color: color-mix(in oklab, var(--color-live) 40%, transparent); }
  .warn { color: var(--color-warn); border-color: color-mix(in oklab, var(--color-warn) 40%, transparent); }
  .bad  { color: var(--color-bad);  border-color: color-mix(in oklab, var(--color-bad) 40%, transparent); }
</style>
