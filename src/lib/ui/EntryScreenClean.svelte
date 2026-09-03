<script>
  import { onMount } from 'svelte';
  import EntryScreen from './EntryScreen.svelte';

  let host;

  onMount(() => {
    const input = host?.querySelector('.search input[type="search"]');
    if (!input) return;

    // EntryScreen updates its placeholder when the club data becomes ready.
    // Keep this field intentionally blank through that reactive update.
    const clearPlaceholder = () => {
      if (input.getAttribute('placeholder')) input.setAttribute('placeholder', '');
    };
    clearPlaceholder();
    const observer = new MutationObserver(clearPlaceholder);
    observer.observe(input, { attributes:true, attributeFilter:['placeholder'] });
    return () => observer.disconnect();
  });
</script>

<div class="entry-clean" bind:this={host}>
  <EntryScreen />
</div>

<style>
  .entry-clean { width:100%; height:100%; }
  :global(.entry-clean .hero-body > button.link:last-of-type) { display:none; }
  :global(.entry-clean .picker > .sub) { display:none; }
</style>
