# 07 — The redesign ("Kickoff")

Total visual and interaction redesign, requested explicitly as taking **no
inspiration from the current Broadcast Kit look**. This document supersedes
`02-design-system.md` as the design authority from the moment R0 lands; until
then `02` still describes what ships.

Direction sketches and their trade-offs live in `design-canvas-v2/` (canvas:
https://claude.ai/code/artifact/2c054241-6613-47dd-b19d-e8885524a2ea). Two
rounds were drawn; round one was rejected as four palettes rather than four
ideas. Round two's three directions were accepted **as a hybrid**.

---

## 1. The decision

Three metaphors, one app. Each was chosen for the screen where it is strongest,
not applied uniformly:

| Surface | Direction | Why this one |
|---|---|---|
| Home | **Spine** | The season is the thing a manager navigates. Home *is* the fixture rail — played results left, upcoming right, next match magnified under the thumb. |
| Squad + Tactics | **Chalk** | The pitch is one persistent surface. Two screens collapse into one; the lineup you are looking at is the lineup that plays. Shortest click path in the app. |
| Matchday | **Broadcast** | The match is the emotional core and the only place worth spending a spectacle budget: perspective pitch, moving ball, score bug, events as lower-thirds. |
| Market, Table, Academy, Trophies, Settings, Inbox | **Plain** | Fast, unornamented, dense. No metaphor. These screens are read, not admired. |

**The unifying idea, and the reason this is one app rather than three:** all
three are the same pitch at three distances — the season (far), the broadcast
(mid), the XI (close). One palette, one type system, one motion language across
all of them. That constraint is load-bearing; a phase that breaks it has failed
even if the screen looks good in isolation.

### Two decisions taken without an explicit answer

Both were flagged and neither blocks; both are recorded here as assumptions so
they are cheap to reverse.

1. **Dark-first.** All three accepted directions are dark and were accepted as
   drawn. The token layer (R0) is nonetheless built so light is a *value swap*
   at `:root`, not a rewrite — no component may hard-code a light/dark value.
   Light mode is R8, not a fork.
2. **Club colour is identity; one accent is action.** The club colour carries
   crest, your-row markers and team identity. A single system accent carries
   primary actions. Green means live/positive and nothing else. This is
   inherited deliberately from `02-design-system.md` — it is the one rule from
   the old system worth keeping, because it is the reason the old palette had
   nothing left to mean "good".

---

## 2. The ball-motion decision — read this before starting R5

**The match engine has no spatial model.** `modules/matchEngine.js` works in
120 abstract *phases* mapped to 90 minutes, computing goal chance from team
strength. Its events are `{type: 'goal'|'yellow'|'injury'|'sub', minute,
teamId, playerId, playerName, …}` plus a scorer and assister picked by weighted
rating. There is no ball, no position, no pass, anywhere in the simulation.

So the passing visualisation the design shows **cannot be read from the engine.
It has to be derived.** Two options were considered:

- **Make the engine spatial.** Rejected. It is `plan-gate` territory
  (simulation math), it would change match outcomes, and it would break both
  `validate.js`'s statistical checks and the reproducibility of every existing
  save. Enormous cost for a presentational gain.
- **Derive plausible motion from the events the engine already emits.**
  Chosen.

### How the derivation works

A new pure module, `src/game/matchMotion.js` — DOM-free, in `src/game/` per
CLAUDE.md's rule that anything computing rather than rendering belongs there,
and covered by Vitest rather than `validate.js`.

- **Input:** one engine event, the scoring team's formation and lineup, and the
  existing `SLOT_LAYOUT` from `src/game/formationLayout.js` (already shared by
  Tactics and Match, already x/y percentages).
- **Output:** an ordered list of `{x, y, playerId, playerName}` waypoints in
  pitch-percentage space. The component animates a path through them.
- **The move is honest.** It uses the *real* assister at his *real* formation
  slot passing to the *real* scorer at his. "Bruno (CM, 27/52) → Ødegaard (CAM,
  50/38) → goal" is a true statement about the event the engine produced. What
  it does not claim is that a physics simulation happened.

**Determinism is a requirement, not a nicety.** `Math.random()` here would
redraw a different move every time the component re-renders or a save is
resumed mid-match. Waypoints are seeded from a hash of `(minute, playerId)` —
FNV-1a, already this codebase's hashing idiom from the `.pitch` export
integrity check. Same event, same move, forever. This gets its own Vitest
assertion.

**Scope fence:** R5 adds no field to any engine event and changes no
simulation arithmetic. If a phase finds itself wanting to, stop and re-triage
under `plan-gate`.

---

## 3. Phases

Same discipline as `04-migration-phases.md`: **every phase ends with a
playable, deployable game, and `validate.js` passes.** No phase is allowed to
leave the app half-restyled across a boundary a player can walk through.

### R0 — Foundation: tokens, type, primitives
**Ships:** no new screens; the existing ones re-themed by token swap alone.

1. Replace `src/app.css`'s `@theme` block with the Kickoff palette and type
   scale. **It must stay `@theme static`** — plain `@theme` only emits a token
   Tailwind's scanner sees used by a utility class, and every screen here
   consumes tokens as raw `var(--color-…)` inside component `<style>` blocks.
   This has already cost the project one silent bug where `--color-surface` resolved to
   `transparent`; see CLAUDE.md §0.
2. Font loading (self-hosted or preconnected; no layout shift on first paint).
3. Primitive components in `src/lib/ui/kit/`: `Button`, `Sheet`, `Card`,
   `Chip`, `SegmentedControl`, `Crest`, `Money`, `FormGuide`, `StatTile`,
   `EmptyState`, `Skeleton`, `Pitch`.
4. Motion tokens + a single `prefers-reduced-motion` guard every animation
   opts into. Reduced motion must render the *final* state, never nothing.

**Success:** every existing screen renders in the new palette with no component
rewritten. Built CSS `:root` lists every declared token (the check that caught
the `@theme` bug — verify it, do not assume it).

### R1 — Entry: marketing home + club select
**Ships:** a real front door. There is none today — `shell.html`'s `#ng` is a
manager-name field and a team grid.

1. Marketing home: one offer, one primary action (*choose your club*), no
   sign-up wall. "Continue your career" beneath it when a save exists.
2. Club select: 186 clubs, filterable by league, showing the thing that
   actually decides the choice — reputation, budget, squad strength.
3. Deliberately first among the screens: it is standalone, it is what a
   stranger sees, and it validates the R0 token layer on real surface before
   any in-game surgery.

**Success:** a cold visitor reaches a started career in two taps.

### R2 — Shell and navigation
1. Replace `TabBar.svelte` with the Broadcast nav pill — one floating control
   in thumb reach that fans out to five destinations.
2. Screen transitions; `registerScreen`/`navigateTo` kept as the mechanism.
3. **Watch:** `shell.html` carries hardcoded `#screen-*` divs and two inline
   `onclick="navigateTo(...)"` handlers; `#btn-adv-header` is found by id by
   Home. Nothing about the id contract may break silently.

**Success:** every destination reachable, browser back behaves, no hover-only
affordance anywhere.

### R3 — Home = Spine
The season rail. `getUpcomingForTeam` plus a direct fixtures-store read covers
it — no engine change. Horizontal is time; the "waiting on you" sheet stays
half-visible so decisions come to the player rather than hiding behind a tab.

**Watch:** `ui/home_transfers.js`'s `renderHome` + `screenTicks.home` bridge is
still called imperatively after match and squad events. It stays until R5
retires its last caller.

### R4 — Squad + Tactics = Chalk
The largest IA change in the plan: **two screens become one.** Player discs on
a persistent pitch, tap to select, drag to swap, bench as a rail beneath.

**Watch:** deleting a screen means deleting its `render*` function *and* any
validator-only aliases kept for old `typeof x === 'function'` checks — grep
repo-wide to confirm dead, never assume. Add a `<name>ScreenSrc` read for the
merged component and repoint the checks that asserted on the two old ones.
Touch targets: 44px minimum on eleven discs plus a bench, on a 390px pitch, is
tight — this is the phase where that gets measured, not estimated.

### R5 — Matchday = Broadcast
1. `src/game/matchMotion.js` + its Vitest file **first**, before any pixel.
2. Perspective pitch, score bug, momentum bar, events as lower-thirds.
3. The derived pass/ball motion (§2).
4. Keep the five beats from Phase 5 — team news, kickoff, live, full time,
   after. They work; this is a re-skin plus the motion layer, not a redesign of
   the flow.

**Watch:** `$state.raw()`, not `$state()`, for `live`/`result`/`matchCtx`.
Svelte 5 deep-proxies plain `$state`, and IndexedDB's structured clone cannot
serialize a reactive Proxy — this threw `DataCloneError` on match commit once
already. Reassign wholesale; never deep-mutate.

### R6 — Market and Table
Plain, fast, dense, in the unified palette.

**Watch:** Transfers' windowed virtualisation over ~3,000 rows was hard-won —
the flex-height chain it depends on runs end to end, and a shared mobile
viewport rule forcing `display:block!important` once broke it. Re-verify
clipping after restyling; do not assume a CSS change is cosmetic here.

### R7 — Academy, Trophies, Settings, Inbox
The remainder, plain treatment.

**Watch:** Settings wires its own export/import/reset buttons *inside* the
component, because querying `shell.html` elements at boot raced the island's
mount. Keep that pattern. Do not regress `.pitch` export/import — it is the
player's only escape hatch if a save breaks.

### R8 — Quality floor, light mode, PWA
Absorbs the old Phase 7. Contrast verified across all 186 club accents
(`npm run check:accents` already gates this), `:focus-visible` everywhere,
320/390/768/1280 all correct, zoom not disabled, reduced-motion honoured,
light-mode token set, PWA install, real-device passes on iOS and Android.

---

## 4. Standing risks

- **`validate.js` asserts on component source text.** Every screen rewritten
  breaks its checks. They are updated in the same change, never after.
- **A green build is not evidence a screen works.** 1181 checks plus Vitest
  plus a Playwright smoke test cover no UI correctness. Every phase ends with
  the screen opened by hand and screenshotted — `verification-before-completion`
  enforces this and it is the single most likely rule to get skipped under time
  pressure.
- **The known flake:** the "home win rate >20% over 30 games" check fails
  roughly 1 run in 8 on unmodified `main`. Re-run before investigating. It is
  the *only* thing in this repo that may be called a flake.
- **No IndexedDB migration path exists.** Nothing in this redesign should need
  a schema change. If a phase thinks it does, that is `plan-gate`, not a
  judgement call.
- **Two build paths.** `src/build.py` survives only to feed `validate.js`.
  Don't delete it, don't repoint the validator at Vite output.
