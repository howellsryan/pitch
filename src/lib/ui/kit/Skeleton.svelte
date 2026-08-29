<script>
  /**
   * Loading placeholder. The shimmer runs on --dur-slow, so the app-wide
   * reduced-motion guard in app.css collapses it to a static block rather
   * than a pulsing one — which is the correct reduced-motion behaviour here:
   * the final state of a skeleton is still a skeleton.
   */
  let { w = '100%', h = 14, radius = 4 } = $props();
</script>

<span class="sk" style="width:{w}; height:{typeof h === 'number' ? h + 'px' : h}; border-radius:{radius}px;"></span>

<style>
  .sk {
    display: block;
    background: linear-gradient(90deg, var(--color-surface) 0%, var(--color-raised) 50%, var(--color-surface) 100%);
    background-size: 200% 100%;
    animation: sheen var(--dur-slow) linear infinite;
  }
  @keyframes sheen {
    from { background-position: 200% 0; }
    to   { background-position: -200% 0; }
  }
</style>
