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

**The result engine has no spatial model.** `modules/matchEngine.js` works in
120 abstract *phases* mapped to 90 minutes, computing goal chance from team
strength. Its events are `{type: 'goal'|'yellow'|'injury'|'sub', minute,
teamId, playerId, playerName, …}` plus a scorer and assister picked by weighted
rating. There is no ball, no position, no pass, anywhere in the simulation.

So the broadcast cannot read positions from that engine. It needs a separate
spatial presentation simulation. Two options were considered:

- **Make the engine spatial.** Rejected. It is `plan-gate` territory
  (simulation math), it would change match outcomes, and it would break both
  `validate.js`'s statistical checks and the reproducibility of every existing
  save. Enormous cost for a presentational gain.
- **Run a spatial presentation engine around the outcomes already emitted.**
  Chosen. It may add visual passes, positioning, pressure, tackles and
  restarts, but it cannot change possession totals, scorers or results.

### How the spatial presentation works

`src/game/broadcastSimulation.js` is DOM-free and owns both layers a believable
match view needs. Its high-level state selects kickoff, live possession,
turnover, causal restart, half-time/end swap, chance, shot, goal hold and
post-goal kickoff. Its low-level
steering preserves velocity, accelerates towards role targets, brakes on
arrival and separates nearby markers. The ball has an explicit owner or a
time-based curved flight; it is never independently eased towards an unrelated
formation slot.

In-possession players form support triangles and offer width. Out-of-possession
players retain a compact line and only the nearest one or two press. The ball
and second-last defender create a hard offside boundary for forward movement,
goalkeepers stay within a bounded sweeper zone, and kickoff positions obey the
own-half and centre-circle laws. A miss produces a goal kick, a deflection the
correct-side corner and cross, a foul a free kick at the challenge spot, and a
touchline exit a throw-in. Engine goal events still supply the real team,
scorer and minute; the presentation engine advances that scorer into the final
third, builds the lead-in and only updates the visible score when the shot
reaches goal.

**Determinism is a requirement, not a nicety.** Selection variation uses FNV-1a
hashes of the sequence and player ids, never `Math.random()`. Tests cover legal
kickoff geometry, continuous ball flight, offside, goalkeeper bounds and goal
chance creation.

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
   sign-up wall. ~~"Continue your career" beneath it when a save exists.~~
   **Deferred to R7 — see the status note below.**
2. Club select: 186 clubs, filterable by league, showing the thing that
   actually decides the choice — reputation, budget, squad strength.
3. Deliberately first among the screens: it is standalone, it is what a
   stranger sees, and it validates the R0 token layer on real surface before
   any in-game surgery.

**Success:** a cold visitor reaches a started career in two taps.

#### R1 status — done, with one item moved to R7

Shipped as `src/lib/ui/EntryScreen.svelte`, replacing `renderNewGame()` and
`#ng`'s markup outright. Two taps, as specified: tap a club, tap start. The
hero's button only scrolls to the picker, so it is not a step.

Three things worth knowing, because they diverge from this section's text:

- **"Continue your career" moved to R7.** The button needs a state that is
  actually reachable, and there is none: `boot()` sends a returning player
  straight into the game, which is the right default and should stay. The
  attempt to manufacture one — a `#menu` hash route — was built and then
  removed during code review, because it produced four defects at once: the
  hash was sticky across reloads, nothing linked to it, and it exposed a
  latent bug (below) that only a save-wiping confirmation flow would contain.
  It belongs with R7's Settings screen, which is where a "back to menu" or
  "start a new career" link naturally lives and where the wipe can be done
  properly.
- **Blocker for that R7 work — `startNewGame()` does not clear the previous
  career's data.** It uses `putFixturesBulk`/`putStandingsBulk`, not the
  `replaceAll*` variants, so starting a second career over an existing save
  leaves the first one's fixtures and standings in the stores (reproduced:
  932 fixtures, 44 standings rows, the old club sitting in the new club's
  table). Harmless today because a new career is only reachable with no save.
  **Whoever makes a new career reachable from inside the game must fix this
  first** — it is `plan-gate` work, not a UI change.
- **The picker shows `startingBudget()`, not the data file's `budget`.**
  `startNewGame()` recomputes every club's budget from reputation, so the raw
  data figure is wrong for all but a couple of clubs — Arsenal's file says
  £130M, a new save starts on £102M. That formula was inline in
  `startNewGame()`; R1 extracted it to an exported `startingBudget()` in
  `src/modules/save.js` (arithmetic unchanged) so the number advertised on the
  deciding screen is the number the save is created with, by construction.
  Not to be confused with `season.js`'s `reputationBudget()`, which adds ±6%
  variance for the seasonal refresh and is therefore not usable here.

Squad strength, the key player and the difficulty band come from a new pure
`src/game/clubStrength.js` (Vitest-covered), rating players with
`matchEngine.js`'s own `primaryRating()` so the picker's view of a player
matches the simulation's. `Sheet.svelte`, which R0 shipped with nothing
mounting it, is now exercised for real and covered by a Playwright test that
asserts open, Escape-to-dismiss and focus restoration.

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

#### R3 status — done

`HomeScreen.svelte` is now the season rather than a dashboard about it. Its
horizontal rail reads played results directly from the fixtures store and the
next fixtures through `getUpcomingForTeam()`, keeping the current match
magnified between the past and future. The progress line, club position,
budget, form, morale and board confidence all use existing stored data; no
simulation or persistence shape changed.

The half-visible "Waiting on you" sheet is live data, not sample copy: pending
inbound offers open Market, unread news opens Inbox, and a local-only career
offers Google sign-in. The Play, deadline-day and end-of-season flows retain
their existing ids and handlers, and `renderHome()` still refreshes the island
through `screenTicks.home` after match and squad events. R4 is next.

### R4 — Squad + Tactics = Chalk
The largest IA change in the plan: **two screens become one.** Player discs on
a persistent pitch, tap to select, drag to swap, bench as a rail beneath.

**Watch:** deleting a screen means deleting its `render*` function *and* any
validator-only aliases kept for old `typeof x === 'function'` checks — grep
repo-wide to confirm dead, never assume. Add a `<name>ScreenSrc` read for the
merged component and repoint the checks that asserted on the two old ones.
Touch targets: 44px minimum on eleven discs plus a bench, on a 390px pitch, is
tight — this is the phase where that gets measured, not estimated.

#### R4 status — done

`SquadScreen.svelte` is now the single Chalk surface: the XI stays on a
persistent pitch, the bench is a rail beneath it, and formation and mentality
remain directly editable. The roster opens in a sheet from the same surface;
player management (contract renewal, registration and transfer listing) stays
available there rather than being lost with the old roster screen. Players can
be swapped through the existing tap picker or dragged onto a pitch slot.

`TacticsScreen.svelte` and `#screen-tactics` are removed. The former tactics
route is an alias for Squad so existing links continue to land on the merged
screen. No save or simulation data changed. R5 is next.

### R5 — Matchday = Broadcast
1. `src/game/broadcastSimulation.js` + its Vitest file **first**, before any pixel.
2. Perspective pitch, score bug, momentum bar, events as lower-thirds.
3. The derived pass/ball motion (§2).
4. Keep the five beats from Phase 5 — team news, kickoff, live, full time,
   after. They work; this is a re-skin plus the motion layer, not a redesign of
   the flow.

**Watch:** `$state.raw()`, not `$state()`, for `live`/`result`/`matchCtx`.
Svelte 5 deep-proxies plain `$state`, and IndexedDB's structured clone cannot
serialize a reactive Proxy — this threw `DataCloneError` on match commit once
already. Reassign wholesale; never deep-mutate.

#### R5 status — done

`MatchScreen.svelte` keeps its existing five-beat match flow and raw
IndexedDB-safe match state, but its live beat is now a Broadcast surface: score
bug, a full-screen pitch with 22 anonymous shirt markers, possession momentum,
and a bottom control dock. `src/game/broadcastSimulation.js` is the single
spatial presentation engine: a continuous possession state machine with a real
ball owner/flight, role-based support and defensive shapes, local pressure,
turnovers, legal kickoff geometry, a real half-time end swap and second kickoff,
enforced onside runs and goalkeepers anchored to their goal line except for
close-range emergencies. Throw-ins require a pressured defensive deflection,
corners wait for most attackers and defenders to occupy the box, and goal kicks
follow a visible missed shot; restarts remain visual scenes, not result events.
Formation coordinates are role anchors, never fresh rendered positions. Goals
receive a final-third constructed chance, shot, score-synchronised full-pitch
takeover, hold and opponent kickoff. Player identity stays out of the Broadcast
pitch and appears in the full-height, match-pausing Squad-style Tactics room,
where formation and substitution choices apply immediately and a persistent
Match control returns to play. Global navigation is unavailable for the full
match route so an in-progress fixture cannot be abandoned accidentally. Penalty
choreography is reserved until the result engine emits a real penalty event.

### R6 — Market and Table
Plain, fast, dense, in the unified palette.

**Watch:** Transfers' windowed virtualisation over ~3,000 rows was hard-won —
the flex-height chain it depends on runs end to end, and a shared mobile
viewport rule forcing `display:block!important` once broke it. Re-verify
clipping after restyling; do not assume a CSS change is cosmetic here.

### R7 — Academy, Trophies, Settings, Inbox
The remainder, plain treatment.

Also picks up **"Continue your career" and the route back to the entry
screen**, deferred from R1 (see its status note). Settings is where a "start a
new career" link belongs, and it is the screen that can carry the confirmation
that destructive action needs.

**Watch:** Settings wires its own export/import/reset buttons *inside* the
component, because querying `shell.html` elements at boot raced the island's
mount. Keep that pattern. Do not regress `.pitch` export/import — it is the
player's only escape hatch if a save breaks. **Before making a new career
reachable with a save present, fix `startNewGame()`'s stale-data bug** — R1's
status note has the reproduction; it leaves the old career's fixtures and
standings behind.

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
- **No stochastic test gate.** The validator does not sample match outcomes:
  a passing or failing build must not depend on `Math.random()`. Calibrated
  goal rates and distributions need a deterministic, injectable RNG before
  they become automated assertions.
- **No IndexedDB migration path exists.** Nothing in this redesign should need
  a schema change. If a phase thinks it does, that is `plan-gate`, not a
  judgement call.
- **Two build paths.** `src/build.py` survives only to feed `validate.js`.
  Don't delete it, don't repoint the validator at Vite output.
