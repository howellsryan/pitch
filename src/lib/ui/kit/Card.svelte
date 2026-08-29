<script>
  /** Surface container. `accent` draws a top rule in the club colour. */
  let { accent = false, padded = true, children, class: klass = '', ...rest } = $props();
</script>

<div {...rest} class="card {klass}" class:accent class:padded>{@render children?.()}</div>

<style>
  .card {
    border: 1px solid var(--color-line);
    border-radius: var(--radius-card);
    background: var(--color-surface);
  }
  .padded { padding: 14px; }
  .accent { border-top: 2px solid var(--color-club); }
</style>
