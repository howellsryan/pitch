<script>
  /**
   * Club shield. SVG only — the design spec bans emoji as icons, and that
   * explicitly includes crests (pitch shipped 🔴/🦁 emoji crests before the
   * redesign). Tinted with the club's own colour.
   *
   * `color` should be an already-guarded value: src/lib/theme.mjs walks a
   * club's raw primaryColor in oklch until text on it clears AA, because a
   * shirt colour is not a UI colour — Newcastle's #241F20 vanishes on this
   * ground and Norwich's #FFF200 blinds. Passing a raw CSV colour here
   * bypasses that guard, so prefer var(--color-club) for the active club.
   */
  let { color = 'var(--color-club)', size = 26, label = null } = $props();
  const h = $derived(Math.round(size * 1.16));
</script>

<svg
  viewBox="0 0 26 30"
  width={size}
  height={h}
  role={label ? 'img' : 'presentation'}
  aria-label={label}
  aria-hidden={label ? null : 'true'}
>
  <path
    d="M13 1 L24 5 V16 C24 23.5 18 27.5 13 29 C8 27.5 2 23.5 2 16 V5 Z"
    fill={color}
    stroke="var(--color-line)"
    stroke-width="1"
  ></path>
  <path
    d="M13 1 L24 5 V16 C24 23.5 18 27.5 13 29 Z"
    fill="rgba(0,0,0,0.16)"
  ></path>
</svg>

<style>
  svg { display: block; flex-shrink: 0; }
</style>
