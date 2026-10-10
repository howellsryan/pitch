<script>
  import SettingsScreen from './SettingsScreen.svelte';
</script>

<div class="settings-clean">
  <SettingsScreen />
</div>

<style>
  .settings-clean { display:contents; }

  /* Backup and recovery stay available without a cloud account. Career
     deletion belongs to the slot menu; potential recalculation is maintenance. */
  :global(.settings-clean .career-reset-row),
  :global(.settings-clean .career-maintenance-row) {
    display:none;
  }

  /* About is always followed by Manager Trophies and Season History. */
  :global(.settings-clean .settings-screen .set-scroll > .set-card:nth-last-child(3)) {
    display:none;
  }
</style>
