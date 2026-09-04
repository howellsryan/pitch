<script>
  /**
   * Single-choice switch. `options` is [{ value, label }]; `value` is bindable
   * so a parent can drive it, per the house two-way prop rule.
   *
   * A group of toggle buttons, deliberately NOT role="tablist": tabs promise a
   * tabpanel, arrow-key navigation and a roving tabindex, none of which this
   * has or needs — it switches a filter, it does not reveal a panel. Announcing
   * "tab 1 of 3" for something that behaves like a button group misleads screen
   * reader users, so this matches Chip.svelte's aria-pressed pattern instead.
   */
  let { options = [], value = $bindable(), ariaLabel = 'View' } = $props();
</script>

<div class="seg" role="group" aria-label={ariaLabel}>
  {#each options as opt (opt.value)}
    <button
      aria-pressed={value === opt.value}
      class="seg-item"
      class:on={value === opt.value}
      onclick={() => (value = opt.value)}
    >{opt.label}</button>
  {/each}
</div>

<style>
  .seg {
    display: flex;
    overflow: hidden;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-bug);
    background: var(--color-surface);
  }
  .seg-item {
    flex: 1 1 0;
    min-width: 0;
    min-height: 44px;
    padding: 5px 10px;
    border: none;
    border-right: 1px solid var(--color-line);
    border-radius: 0;
    background: transparent;
    color: var(--color-tx-2);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.055em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease-out),
                color var(--dur-fast) var(--ease-out),
                box-shadow var(--dur-fast) var(--ease-out);
    -webkit-tap-highlight-color: transparent;
  }
  .seg-item:last-child { border-right: 0; }
  .seg-item:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  .on {
    background: var(--color-raised);
    color: var(--color-tx);
    box-shadow: inset 0 -3px 0 var(--color-accent);
  }
</style>
