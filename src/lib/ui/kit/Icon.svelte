<script>
  import { iconMarkup } from '../../icons.mjs';

  let {
    name = 'info',
    size = 18,
    label = null,
    strokeWidth = 1.8,
    class: className = '',
  } = $props();

  const paths = $derived(iconMarkup(name));
</script>

<svg
  class={className}
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? 'img' : 'presentation'}
  aria-label={label}
  aria-hidden={label ? null : 'true'}
>
  {#each paths as markup}
    {@html markup}
  {/each}
</svg>

<style>
  svg { display: inline-block; flex: 0 0 auto; vertical-align: middle; }
</style>
