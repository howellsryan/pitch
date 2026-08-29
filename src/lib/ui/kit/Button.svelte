<script>
  /**
   * Kickoff primary control (docs/plan/07-redesign.md R0).
   *
   * `accent` is the app's one action colour; `club` is identity and is only
   * correct where the action IS the club's (play your match). Never use club
   * to mean "press this" generally — that ambiguity is what the palette split
   * exists to prevent.
   *
   * Height floor is 44px on every size, including `sm`: the design spec's
   * touch minimum is not negotiable per-variant.
   */
  let {
    variant = 'accent',
    size = 'md',
    full = false,
    disabled = false,
    type = 'button',
    onclick,
    children,
    class: klass = '',
    ...rest
  } = $props();
</script>

<button
  {type}
  {disabled}
  {onclick}
  {...rest}
  class="btn {variant} {size} {klass}"
  class:full
>{@render children?.()}</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 18px;
    border: 1px solid transparent;
    border-radius: var(--radius-bug);
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: transform var(--dur-fast) var(--ease-out),
                background-color var(--dur-fast) var(--ease-out),
                opacity var(--dur-fast) var(--ease-out);
    -webkit-tap-highlight-color: transparent;
  }
  .btn:active:not(:disabled) { transform: scale(0.975); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }

  .full { width: 100%; }
  .lg { min-height: 56px; font-size: 15px; padding: 0 22px; }
  .sm { min-height: 44px; font-size: 13px; padding: 0 14px; }

  .accent { background: var(--color-accent); color: var(--color-on-accent); }
  .club   { background: var(--color-club);   color: var(--color-on-club); }
  .ghost  { background: transparent; color: var(--color-tx); border-color: var(--color-line); }
  .quiet  { background: var(--color-raised); color: var(--color-tx); }
  .danger { background: transparent; color: var(--color-bad); border-color: var(--color-bad); }
</style>
