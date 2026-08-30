<script>
  /**
   * Club crest primitive.
   *
   * R6.5 replaces the old one-shape coloured shield with an original SVG
   * interpretation of each club's real visual identity. Prefer passing the
   * whole `team` object. During the migration, older callers that only pass a
   * colour are resolved from the nearest visible club name so every existing
   * Crest instance upgrades immediately rather than waiting for a risky
   * all-screens rewrite.
   */
  import { onMount } from 'svelte';
  import { getAllTeamData } from '../../../modules/save.js';
  import { clubCrestSvg } from '../../clubIdentity.mjs';

  let {
    team = null,
    color = 'var(--color-club)',
    size = 26,
    label = null,
    class: className = '',
  } = $props();

  let root = $state(null);
  let inferred = $state.raw(null);

  // One catalogue for every Crest instance. Longest names first prevents
  // "Paris" from winning before "Paris Saint-Germain", etc.
  const CLUBS = getAllTeamData()
    .slice()
    .sort((a, b) => String(b.name).length - String(a.name).length);

  function fold(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function clubFromText(value) {
    const haystack = fold(value);
    if (!haystack) return null;
    return CLUBS.find((club) => haystack.includes(fold(club.name))) ?? null;
  }

  onMount(() => {
    if (team) return;

    // Explicit labels are the strongest migration bridge.
    inferred = clubFromText(label);
    if (inferred) return;

    // Existing screen markup already places a Crest inside the same row/card
    // as its club name. Walk only a few ancestors so a match container holding
    // two clubs cannot accidentally resolve the wrong side.
    let node = root?.parentElement ?? null;
    for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
      const matches = CLUBS.filter((club) => fold(node.textContent).includes(fold(club.name)));
      if (matches.length === 1) {
        inferred = matches[0];
        return;
      }
    }
  });

  const fallback = $derived({
    id: 'generic-club',
    name: label?.replace(/ crest$/i, '') || 'Club',
    shortName: 'FC',
    primaryColor: /^#[0-9a-f]{6}$/i.test(color) ? color : '#59616B',
  });

  const resolved = $derived(team ?? inferred ?? fallback);
  const accessibleLabel = $derived(
    label ?? (resolved?.name && resolved.name !== 'Club' ? `${resolved.name} crest` : ''),
  );
  const source = $derived(
    `data:image/svg+xml,${encodeURIComponent(
      clubCrestSvg(resolved, { size, label: accessibleLabel }),
    )}`,
  );
</script>

<span bind:this={root} class="crest {className}" style="width:{size}px;height:{size}px">
  <img
    src={source}
    alt={accessibleLabel}
    width={size}
    height={size}
    aria-hidden={accessibleLabel ? null : 'true'}
  />
</span>

<style>
  .crest {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    line-height: 0;
  }
  img { display: block; width: 100%; height: 100%; object-fit: contain; }
</style>
