<script>
  /**
   * Empty states are designed, not defaulted — a quality-floor item in
   * docs/plan/02-design-system.md that carries forward. Every empty list in
   * the app says what is missing AND what to do about it.
   */
  let { title = '', body = null, children } = $props();
</script>

<div class="empty">
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M8.5 14.5h7" stroke-linecap="round"></path>
  </svg>
  <p class="t">{title}</p>
  {#if body}<p class="b">{body}</p>{/if}
  {@render children?.()}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
    padding: 38px 24px;
    text-align: center;
    color: var(--color-tx-3);
  }
  .t { margin: 0; font-family: var(--font-body); font-size: 14px; font-weight: 600; color: var(--color-tx-2); }
  .b { margin: 0; font-family: var(--font-body); font-size: 13px; line-height: 1.5; max-width: 260px; }
</style>
