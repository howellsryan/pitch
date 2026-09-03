<script>
  import SettingsScreen from './SettingsScreen.svelte';
</script>

<div class="settings-clean">
  <SettingsScreen />
</div>

<style>
  .settings-clean { display:contents; }

  /* Career keeps Main Menu only. The underlying import/export helpers remain
     available to persistence internals, but these developer-style controls no
     longer form part of the player-facing Settings surface. */
  :global(.settings-clean .settings-screen .set-scroll > .set-card:first-child > .set-row:nth-of-type(n+4)) {
    display:none;
  }

  /* About is always followed by Manager Trophies and Season History. */
  :global(.settings-clean .settings-screen .set-scroll > .set-card:nth-last-child(3)) {
    display:none;
  }
</style>
