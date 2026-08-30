<script>
  /**
   * The pitch surface, shared by Chalk's XI editor (R4) and Broadcast's live
   * match (R5) — the same reason SLOT_LAYOUT lives in one file: two pitch
   * views that drift apart is a bug the player sees immediately.
   *
   * Renders only the surface and its markings. Callers position their own
   * children over it in the same 0–100 percentage space SLOT_LAYOUT uses, so
   * a slot's {x, y} means the same thing in both screens.
   *
   * `perspective` tilts the plane for the broadcast view. It is a pure CSS
   * transform on the surface, deliberately NOT applied to children — a player
   * disc or a score overlay must stay upright and legible, which is exactly
   * how real broadcast graphics behave.
   */
  let { perspective = false, children } = $props();
</script>

<div class="wrap">
  <div class="surface" class:tilt={perspective}>
    <svg viewBox="0 0 300 500" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="var(--color-chalk)" stroke-width="1.5">
        <rect x="8" y="8" width="284" height="484"></rect>
        <line x1="8" y1="250" x2="292" y2="250"></line>
        <circle cx="150" cy="250" r="48"></circle>
        <rect x="68" y="8" width="164" height="70"></rect>
        <rect x="110" y="8" width="80" height="28"></rect>
        <rect x="68" y="422" width="164" height="70"></rect>
        <rect x="110" y="464" width="80" height="28"></rect>
      </g>
      <circle cx="150" cy="250" r="3" fill="var(--color-chalk)"></circle>
    </svg>
  </div>
  <div class="layer">{@render children?.()}</div>
</div>

<style>
  .wrap { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .surface {
    position: absolute;
    inset: 0;
    background:
      repeating-linear-gradient(0deg, rgba(255,255,255,0.022) 0 32px, transparent 32px 64px),
      linear-gradient(180deg, var(--color-turf) 0%, var(--color-turf-2) 100%);
  }
  .tilt { transform: perspective(620px) rotateX(52deg); transform-origin: 50% 18%; }
  .surface svg { width: 100%; height: 100%; display: block; }
  .layer { position: absolute; inset: 0; }
</style>
