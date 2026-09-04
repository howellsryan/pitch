<script>
  /** Surface container. `accent` marks club identity on the leading edge. */
  let { accent = false, padded = true, children, class: klass = '', ...rest } = $props();
</script>

<div {...rest} class="card {klass}" class:accent class:padded>{@render children?.()}</div>

<style>
  .card {
    border: 1px solid var(--color-line);
    border-radius: var(--radius-bug);
    background: var(--color-surface);
  }
  .padded { padding: 12px 14px; }
  .accent {
    border-top-color: var(--color-line);
    box-shadow: inset 3px 0 0 var(--color-club);
  }
</style>
