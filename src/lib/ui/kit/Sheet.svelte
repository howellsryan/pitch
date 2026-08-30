<script module>
  /**
   * Open sheets, innermost last. Escape must dismiss only the TOP sheet:
   * Transfers stacks offer → rejected → counter-offer, and a per-instance
   * window listener closed the whole stack at once, throwing the player back
   * to the list mid-negotiation.
   *
   * Deliberately a plain array, not $state: nothing renders from it, and an
   * effect that both reads and writes a reactive array self-invalidates —
   * `effect_update_depth_exceeded` on the first sheet that opens.
   */
  const stack = [];
</script>

<script>
  /**
   * Bottom sheet — the app's modal surface. Replaces showModal() everywhere:
   * the redesign's rule is sheets, not dialogs, and never full-screen except
   * matchday (which is a route, not a sheet).
   *
   * `open` is bindable so the parent owns the state and the sheet can close
   * itself from the backdrop, the handle or Escape without a callback dance.
   */
  import { untrack } from 'svelte';

  let { open = $bindable(false), title = null, children } = $props();

  const id = {};
  let panel = $state(null);
  let restoreTo = null;

  // Register/unregister on this sheet's own open state, so the stack order is
  // mount-independent and a sheet opened from inside another lands on top.
  $effect(() => {
    if (!open) return;
    stack.push(id);
    restoreTo = document.activeElement;
    // aria-modal without moving focus leaves a screen reader outside the
    // dialog it was just told is modal. untrack() so bind:this settling does
    // not re-run this effect and bounce focus back and forth.
    untrack(() => panel)?.focus();
    return () => {
      const i = stack.indexOf(id);
      if (i > -1) stack.splice(i, 1);
      // Duck-typed rather than `instanceof HTMLElement`: the element may come
      // from another document context, and the global is not in eslint's env here.
      if (typeof restoreTo?.focus === 'function') restoreTo.focus();
      restoreTo = null;
    };
  });

  function close() { open = false; }
  function handleKey(e) {
    if (e.key !== 'Escape') return;
    if (stack[stack.length - 1] !== id) return;
    close();
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if open}
  <div class="scrim">
    <button class="backdrop" onclick={close} aria-label="Close" tabindex="-1"></button>
    <div class="panel" bind:this={panel} role="dialog" aria-modal="true" aria-label={title ?? 'Details'} tabindex="-1">
      <button class="handle" onclick={close} aria-label="Close">
        <span></span>
      </button>
      {#if title}<h2 class="title">{title}</h2>{/if}
      <div class="body">{@render children?.()}</div>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: flex-end;
    animation: fade var(--dur-base) var(--ease-out);
  }
  /* A real <button>, not a click handler on a div: the backdrop is a genuine
     dismiss control, so it gets keyboard and AT semantics for free. It sits as
     a SIBLING of the panel rather than its ancestor, which is what removes the
     need to stopPropagation on every tap inside the sheet. */
  .backdrop {
    position: absolute;
    inset: 0;
    border: none;
    padding: 0;
    background: rgba(0, 0, 0, 0.62);
    cursor: pointer;
  }
  .panel {
    position: relative;
    width: 100%;
    max-height: 86dvh;
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    border-top: 1px solid var(--color-line);
    border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
    padding-bottom: env(safe-area-inset-bottom);
    animation: rise var(--dur-base) var(--ease-out);
  }
  .handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 44px;
    border: none;
    background: transparent;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .handle span { display: block; width: 38px; height: 4px; border-radius: 3px; background: var(--color-tx-3); }
  .handle:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -4px; }
  .title {
    margin: 0;
    padding: 0 18px 10px;
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.01em;
    color: var(--color-tx);
  }
  .body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 18px 22px;
  }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes rise { from { transform: translateY(14px); } to { transform: translateY(0); } }
</style>
