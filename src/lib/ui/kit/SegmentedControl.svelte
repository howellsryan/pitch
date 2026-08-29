<script>
  /**
   * Single-choice switch. `options` is [{ value, label }]; `value` is bindable
   * so a parent can drive it, per the house two-way prop rule.
   */
  let { options = [], value = $bindable(), ariaLabel = 'View' } = $props();
</script>

<div class="seg" role="tablist" aria-label={ariaLabel}>
  {#each options as opt (opt.value)}
    <button
      role="tab"
      aria-selected={value === opt.value}
      class="seg-item"
      class:on={value === opt.value}
      onclick={() => (value = opt.value)}
    >{opt.label}</button>
  {/each}
</div>

<style>
  .seg {
    display: flex;
    gap: 3px;
    padding: 3px;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-bug);
    background: var(--color-surface);
  }
  .seg-item {
    flex: 1 1 0;
    min-width: 0;
    min-height: 38px;
    border: none;
    border-radius: 2px;
    background: transparent;
    color: var(--color-tx-2);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease-out),
                color var(--dur-fast) var(--ease-out);
    -webkit-tap-highlight-color: transparent;
  }
  .seg-item:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  .on { background: var(--color-accent); color: var(--color-on-accent); }
</style>
