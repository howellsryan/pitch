<script>
  /**
   * Club crest primitive.
   *
   * R6.5 replaces the old one-shape coloured shield with an original SVG
   * interpretation of each club's real visual identity. Prefer passing the
   * whole `team` object (id/name/shortName/primaryColor); `color` remains as a
   * compatibility fallback while older callers are migrated in this branch.
   */
  import { clubCrestSvg } from '../../clubIdentity.mjs';

  let {
    team = null,
    color = 'var(--color-club)',
    size = 26,
    label = null,
    class: className = '',
  } = $props();

  const fallback = $derived({
    id: 'generic-club',
    name: label?.replace(/ crest$/i, '') || 'Club',
    shortName: 'FC',
    primaryColor: /^#[0-9a-f]{6}$/i.test(color) ? color : '#59616B',
  });

  const svg = $derived(
    clubCrestSvg(team ?? fallback, {
      size,
      label: label ?? (team?.name ? `${team.name} crest` : ''),
      className,
    }),
  );
</script>

<span class="crest" style="width:{size}px;height:{size}px">
  {@html svg}
</span>

<style>
  .crest {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    line-height: 0;
  }
  .crest :global(svg) { display: block; width: 100%; height: 100%; }
</style>
