<script>
  /**
   * Wraps ui/helpers.js's `fmt.money` rather than reimplementing it — there is
   * exactly one money format in this app and it already exists. This component
   * adds the typography (tabular figures so columns of fees line up) and the
   * `wage` variant, nothing else.
   */
  import { fmt } from '../../../ui/helpers.js';

  let { value = 0, wage = false, size = 'md', tone = 'default' } = $props();
  const text = $derived(wage ? fmt.wage(value) : fmt.money(value));
</script>

<span class="money {size} {tone}">{text}</span>

<style>
  .money { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-weight: 500; }
  .sm { font-size: 11px; }
  .md { font-size: 13px; }
  .lg { font-family: var(--font-display); font-weight: 700; font-size: 22px; letter-spacing: 0.01em; }
  .default { color: var(--color-tx); }
  .muted   { color: var(--color-tx-2); }
  .accent  { color: var(--color-accent); }
  .bad     { color: var(--color-bad); }
</style>
