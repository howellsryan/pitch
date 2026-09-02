# 04 — Migration phases

Strangler-fig on `ui/`, not on `modules/`. **Every phase ends with a playable,
deployable game**, and `validate.js` passes at the end of every one.

> **Retired verification note.** Where this document records a Playwright or E2E
> run, that is a historical record of how a phase was verified at the time. That
> suite has since been deleted from the repository and must not be reintroduced;
> current verification is Vitest, the validator bridge, lint, the accent/emoji
> audits and hands-on inspection of the running app.

---

## Phase 0 — Ship pitch on Workers (~3h) — ✅ steps 1–3 done, step 4 outstanding

**Ships:** today's `index.html`, unchanged, on Cloudflare Workers at pitch-sim.com.

1. ✅ Add `wrangler.jsonc` serving the repo root (config in `03-cloudflare-workers.md`).
2. ✅ `.assetsignore` for `pitch_source.zip`, `src/`, `docs/`, `.claude/`.
3. ✅ `npx wrangler@4 deploy` → verify on `*.workers.dev` first. Live at the
   Worker's `workers.dev` URL, deployed automatically on every push to `main`.
4. **⏳ Not done.** Attach `pitch-sim.com` as a custom domain, **then** remove
   `CNAME` and disable GitHub Pages. In that order — never leave the domain
   pointing at nothing. `pitch-sim.com` is still served by GitHub Pages today.
5. Open it on your phone and screenshot every screen. These are the before-shots.

**Watch:** the domain move is the only irreversible-feeling step in the plan. Test
on `workers.dev` until you're certain; DNS is a five-minute rollback but a live
site down is a live site down.

---

## Phase 1 — Make the build portable, add CI (~1 day) — ✅ done

**Ships:** nothing visible. A build anyone can run, and a validator that runs itself.

1. ✅ **Unzip the source into the tree.** `pitch_source.zip` → `src/`. Delete
   the zip and the committed root `index.html`; both become build outputs.
   This is the change that makes the repo a repo.
2. ✅ **De-hardcode `build.py` and `validate.js`** — the six occurrences of
   `/home/claude/pitch2`, `/mnt/user-data/outputs`, `/tmp/bundle_final.js`.
   Paths now resolve relative to the script. Nothing else changed.
3. ✅ **CI**: `.github/workflows/deploy.yml` runs `npm run build` (bundles,
   then runs `src/validate.js`) on every push and PR — 1178 checks, not the
   1,190 originally estimated here; fails the build on any failure. Deploys
   to Workers on `main` only; uploads a preview version everywhere else.
4. ✅ `index.html` is `.gitignore`d.

**Done when:** a clean clone builds and validates with two commands, and CI proves
it. **Verified**: the Phase 1 rebuild was confirmed byte-for-byte identical
(same MD5) to the file it replaced — this phase changed no game behaviour.

**Watch:** `BRIEFING.md`'s build rules exist because a stale extracted
`index.html` once shadowed the real output. Deleting the committed `index.html`
in this phase removes that hazard permanently — do it deliberately, and say so in
the commit.

---

## Phase 2 — Toolchain (~2 days) — ✅ done (steps 1–7); step 8 done in the same commit

**Ships:** identical game, built by Vite. Zero visible change — which is what
makes it the riskiest phase.

1. `npm i -D vite @sveltejs/vite-plugin-svelte svelte typescript svelte-check
   @tailwindcss/vite tailwindcss vite-plugin-pwa vitest @playwright/test eslint
   eslint-plugin-svelte size-limit`
2. **Convert `modules/` to real ES modules, one file at a time, in `build.py`'s
   declared dependency order**, running `validate.js` after each:
   `db → matchEngine → standings → fixtures → cups → transfers → potential →
   injuries → promotion → youthAcademy → save → season → gameweek`
3. ~~Handle `season.js`'s dynamic `import('./cups.js')`.~~ **Moot** — no dynamic
   import remains in `season.js`; it calls `buildInitialCupState` directly.
   `build.py`'s `DYNAMIC_IMPORT_FIX` and all eight of its `RENAMES` entries were
   found to be dead (zero occurrences in source) and are now vestigial.
4. Convert `data/*.js` from global assignment to explicit exports.
5. Keep `ui/` as-is, loaded as side-effect imports; keep `shell.html`'s markup and
   CSS verbatim in `index.html`. **The UI does not change in this phase.**
6. ~~Configure a second IIFE build target so `validate.js` still has a bundle to
   check.~~ **Corrected in implementation — this does not work.** 430 of
   `validate.js`'s 1178 checks assert against the bundle's *raw source text*
   (exact strings like `function selectEleven(players, formation` and
   `'GK': 0`). esbuild normalises quote style and tree-shakes unreferenced
   top-level code, so an IIFE Vite target fails hundreds of checks that
   describe no real regression. **`build.py`'s concatenation is kept as the
   validator's bundler** and Vite owns the app build. Because `strip_modules()`
   only removes import/export lines, adding real module syntax left the bundle
   byte-identical — which is how the conversion was proven behaviour-neutral.
7. Add `.claude/rules/svelte5.md` and wire `eslint-plugin-svelte` into CI *now*,
   before the first component exists.
8. **Rewrite `BRIEFING.md`** in this same commit — its Commands table and Source
   Map both become wrong here.

**Done when:** `npm run dev` serves a game indistinguishable from Phase 1, and
`validate.js` still reports 0 failures.

**Watch:**
- **Import order is the dependency graph.** Deviating from `build.py`'s order is
  how you get `undefined is not a function` on boot.
- **Do not touch the IndexedDB schema.** `db.js` is at `DB_VERSION = 3` with 8
  stores and no migration path for a fourth. A schema bump orphans every save.
  Load a real save and play a gameweek before calling this phase done.

---

## Phase 3 — Shell and first screen (~2 days) — steps 1, 3 (partial), 4 done; 2/5/6 outstanding

**Ships:** the Broadcast Kit identity, five-item bottom nav, one real screen.

1. ✅ `src/app.css` — the `@theme` token block from `docs/design-system.md`.
   **Landed without `@import "tailwindcss";`, so the Vite plugin never
   processed it — every custom property in that block was dead on arrival.**
   Fixed in the same change that built the first component that actually
   needed one (theme.mjs's direct `--color-club` write papered over it until
   then). Any future `@theme` edit should double-check the built CSS actually
   contains a `:root` block, not a literal `@theme{...}` the browser ignores.
2. ⏳ Not done. `src/lib/ui/` has `TabBar.svelte` and `LeagueScreen.svelte`
   only — not yet the full component inventory (`02-design-system.md`).
3. **Partial.** No `App.svelte` — no context bar (crest/GW/budget). Doing
   that properly needs a height-calc audit across every legacy screen still
   sized off `100vh` (`.home-outer`, `.squad-layout`, `.tactics-layout`,
   `.trophies-layout`, `.set-layout`), since a persistent top bar eats into
   all of them; blind edits there risk clipping content on screens this pass
   couldn't visually re-verify one by one. ✅ Bottom nav done instead, as a
   Svelte island (`TabBar.svelte`) mounted into `#tabbar-mount`, replacing
   the static 9-item `<nav class="bot-nav">` — same CSS classes reused, so no
   layout-math changes were needed for it. Nine → five, Play centred and
   elevated (reuses the existing `#btn-adv-header` handler in
   `home_transfers.js` rather than touching event-queue code). Tactics
   (quick-link on Squad), Academy/Trophies (quick-links on Home), Settings/
   Inbox (Home's header icons, existing `.ph-settings-btn`/`.ph-inbox-btn`,
   widened from their old 480px-only breakpoint to 768px) are reachable but
   not "in the context bar" as spec'd — no context bar exists yet. Desktop
   sidebar (9 icons) is untouched.
4. ✅ **League (`renderCompetitions`) migrated** — `src/lib/ui/LeagueScreen.svelte`,
   mounted into `#screen-competitions`. Real Svelte markup and data-fetching
   (no `innerHTML`), `animate:flip` on table-row reordering, Broadcast Kit
   tokens throughout. `renderCompetitions` and its raw markup are deleted, not
   wrapped — `src/validate.js`'s three checks that asserted on the old
   function/markup were updated to check the new reality instead of deleted.
5. ⏳ Not done — no `<LegacyPanel>` wrapper exists. The seven remaining
   screens still mount straight off `src/ui/*.js`'s `registerScreen()` calls,
   which is fine as-is (that's exactly Phase 4's per-screen recipe) but there's
   no shared wrapper component abstracting it yet. Add one if a second or
   third screen shows it'd actually save duplication — not preemptively.
6. ⏳ Not done. No URL routing yet; `not_found_handling` is still whatever
   Phase 0/1 set it to.

**Watch:** the **Play** button pops one event off `save.pendingEvents` — it does
not advance a gameweek. Get this wrong and cups and Europe silently stop working.
The TabBar's Play button does not reimplement this: it navigates to Home and
clicks the existing `#btn-adv-header`, so the queue logic never moved.

---

## Phase 4 — Screen by screen (~1 day each) — ✅ done

League (`renderCompetitions`) moved in Phase 3 already — self-contained
enough that it made more sense as the phase's proof-of-concept than as
Phase 4's first row. Not re-listed below.

**Home (`renderHome`) migrated** — `src/lib/ui/HomeScreen.svelte`, mounted
into `#screen-home`. Real Svelte markup and data-fetching throughout: hero
card, previous/next fixture cards, a league-table slice with a "Full →" link
to Competitions, stats tiles, form pills + morale, and top-scorers/assists
charts — all real markup, no `innerHTML`. The header's Play/EOY/Deadline
action button and the deadline-day AI-simulation flow (hour-skip,
auto-close, the once-per-deadline inbox/toast notification) moved in too,
ported from the deleted imperative wiring in `renderHome` and
`_closeTransferWindow`. `handleEndOfSeason` and `showMatchReport` stay in
`src/ui/home_transfers.js` as legacy — they build `showModal()` bottom-sheet
content, not screen content, so they're out of this screen's scope.
`renderHome` itself survives as a thin bridge (`screenTicks.home++`) because
prematch.js/watchmatch.js/squad_tactics_offers.js still call it imperatively
after a match or squad change; `HomeScreen.svelte`'s own `$effect` watches
that tick and refetches, exactly like League's `screenTicks.competitions`
pattern. The `id="btn-adv-header"` button survives inside the new component
specifically so **TabBar**'s Play button (`document.getElementById(
'btn-adv-header')?.click()`) and **prematch.js**'s `handleAdvanceOneFixture`
(which disables that same button by id during a sim) keep working unchanged
— verified by driving both paths in a real browser, not just by reading the
code. The old `.ph-settings-btn`/`.ph-inbox-btn` CSS mentioned in Phase 3
step 3 above is gone too, superseded by this component's own scoped styles.
`src/validate.js`'s checks that asserted on the old header markup/wiring
were updated to check the new reality (a `homeScreenSrc` read alongside
`shellSrc`, same idea as the League checks) instead of deleted; `build.py`'s
`check_html()` had two checks (`hdrPlay.onclick wired`, `ph-play-btn CSS`)
that asserted on the same now-gone legacy bundle content — updated there too.
Verified with `npm run build` (1178/1178 validator checks + Vite build
clean), `npm run lint`, `npm run check:accents` (186/186), `npm run
test:e2e` (6/6), plus manual screenshots at 390×844 — same pattern as
League's Phase 3 verification, not a committed per-screen Playwright spec.

**Squad (`renderSquad`) and Tactics (`renderTactics`) migrated** —
`src/lib/ui/SquadScreen.svelte` (mounted into `#screen-squad`) and
`src/lib/ui/TacticsScreen.svelte` (mounted into `#screen-tactics`), both real
Svelte markup and data-fetching, no `innerHTML`. Squad: the old 11-column
desktop grid became two-line rows (rating, position, name/badges on line
one; age/fitness/potential on line two) with one large rating, per the
design spec — tapping a row opens a real bottom sheet (component-local
`$state`, not `showModal()`) with position-specific attribute bars and stat
cards, ported from `openSquadPlayerModal`'s layout logic but rebuilt as
markup instead of an HTML-string template. `openSquadPlayerModal` itself
stays in `squad_tactics_offers.js` as legacy, unmodified — the not-yet-
migrated Transfers screen still calls it directly as a generic player-detail
modal, so deleting it wasn't this screen's call to make; its two
`renderSquad()` refresh calls became `screenTicks.squad++` instead.
`handleSquadAction` (squad-list-only) was deleted outright along with
`renderSquad`, matching the recipe's step 3. Tactics: the full-screen pitch
graphic, all 13 formations, the four mentalities and tap-to-swap bottom
sheet all carried over; the formation-group/slot-position/swap-candidate-
scoring logic is layout data and categorisation, not simulation math, so it
stayed inline in the component rather than moving to `src/game/` — nothing
in either screen turned out to be exportable game logic per step 2. Both
screens' `registerScreen()` entries in `renderers.js` became
`screenTicks.squad++`/`screenTicks.tactics++`, same pattern as League and
Home. `src/validate.js` gained `squadScreenSrc`/`tacticsScreenSrc` reads
alongside `homeScreenSrc`; checks that asserted on the old bundle-string
markup (`MENTALITIES`, the mentality-picker wiring, the squad INJ-badge
classes) were repointed at the new component sources instead of deleted.
**Found and fixed in the same pass, not scope creep:** `src/shell.html` had
~180 lines of now-dead Squad/Tactics CSS left behind — including a
`.tac-dd-list{opacity:0}` rule from the old vanilla-JS dropdown (which
toggled a `.open` class the new component never adds) that silently made
the formation/mentality dropdowns invisible, and a `.sheet{background:...}`
collision was never at risk because that class name wasn't reused, but
`.inj-badge`/`.listed-badge` were — `openSquadPlayerModal` and the Transfers
buy-list still use those globally-styled classes, so SquadScreen.svelte's
own versions were renamed `sq-inj-badge`/`sq-listed-badge`/`sq-wonderkid-tag`
rather than colliding. Deleting shell.html's dead rules turned up a second,
much bigger bug in the same verification pass — see §0's `@theme static`
note in `CLAUDE.md`; `src/app.css` was fixed in this same change since
Squad's bottom sheet rendering fully transparent is what surfaced it.
Verified with `npm run build` (1176/1176 validator checks + Vite build
clean), `npm run lint`, and Playwright screenshots at 390×844 driving the
real flow (open a player sheet, toggle squad/list status, change formation,
open the swap sheet, swap a player) — same pattern as Home's Phase 4
verification, not a committed per-screen Playwright spec.

**Academy (`renderAcademy`) migrated** — `src/lib/ui/AcademyScreen.svelte`,
mounted into `#screen-academy`, real Svelte markup and data-fetching, no
`innerHTML`. The old 8-column desktop table (`academy-table-hdr`/
`academy-row`) became youth-intake cards — one per player, rating/position/
name/badges on top, promote/release actions below — per the plan's "Smallest.
Youth intake cards" note; the tier info bar became three `stat-tile`s
matching Home's own stat-tile pattern instead of a bespoke grid. Promote and
release both got their own confirmation bottom sheet (component-local
`$state`, not `showModal()`) in place of the two `showModal()` calls
`handleYouthAction` used to build. `src/ui/academy.js` had exactly two
exports (`renderAcademy`, `handleYouthAction`) and no other importers once
`renderers.js`'s import was dropped, so the file was deleted outright rather
than emptied — also removed from `build.py`'s `MODULES` list, since a
concatenation step for a file that no longer exists is a build break waiting
to happen, not a no-op. `registerScreen('academy', …)` became
`screenTicks.academy++`, same pattern as the other four migrated screens.
`src/validate.js` gained an `academyScreenSrc` read; the three checks that
asserted on the old bundle-string markup (`academy-card` CSS presence,
`youth-action` wiring, the WONDERKID badge) were repointed at the new
component source. The now-dead `.academy-*` CSS block in `shell.html`
(unused by anything else — confirmed the same way as the Squad/Tactics
sweep) was deleted in the same pass, ~40 lines including its own
`@media(max-width:768px)` override block. Verified with `npm run build`
(1175/1175 validator checks + Vite build clean), `npm run lint`, and a
Playwright run driving the real flow — including seeding a second youth
player directly into IndexedDB to get a wonderkid card, an aging-out
warning card, and the season-end warning banner on screen simultaneously,
not just whatever a fresh save's own seeded cohort happened to produce.

**Trophies (`renderTrophies`) migrated** — `src/lib/ui/TrophiesScreen.svelte`,
mounted into `#screen-trophies`, real Svelte markup and data-fetching, no
`innerHTML`. Kept the merged Cups + Honours layout unchanged: a "Current
Season" grid of active-cup cards (progress bar or, for the Champions
League's group stage specifically, matchday/points/goal-difference and a
qualification verdict) above a "Club History" grid of all-time honours
cards, both driven by the same `CUP_META`/`getHonorsForTeam` lookups the
legacy renderer used — the league-title/domestic-cup-by-league lookup
tables are display data, not simulation math, so they stayed inline in the
component per step 2, same call as Tactics's formation tables.
`renderTrophies`, its `renderHonours`/`renderCupsLegacy` aliases in
`renderers.js`, and the separate `renderCups` alias in
`squad_tactics_offers.js` are all deleted outright rather than kept as
indirection — a repo-wide grep confirmed none of the three had any caller
beyond satisfying `validate.js`'s old function-existence check, which was
updated to match instead of preserving dead aliases. The `#screen-cups`/
`#screen-honours` hidden alias `<div>`s in `shell.html` went for the same
reason — nothing ever navigated to or queried them either.
**Also found and fixed in the same pass:** ~150 more lines of dead CSS
turned up in `shell.html` beyond the Trophies-specific block — a `.sq-btn-sm`/
`.sq-btn-in`/`.sq-btn-unlist` family that Academy's migration (the previous
row in this table) had already made unreachable, since academy.js was its
last consumer. Verified with `npm run build` (1172/1172 validator checks +
Vite build clean), `npm run lint`, and a Playwright screenshot at 390×844.

**Settings (`renderSettings`) migrated** — `src/lib/ui/SettingsScreen.svelte`,
mounted into `#screen-settings`, real Svelte markup and data-fetching, no
`innerHTML`. Save Data (export/import/reset/recalculate-potentials), About,
Manager Trophies and Season History all carried over; export/import/reset
became real bottom sheets (component-local state) in place of their three
`showModal()` calls, matching Squad/Academy's precedent rather than keeping
`showModal()` for a freshly-authored screen. The one real wrinkle: the
export/import/reset buttons weren't wired inside `renderSettings()` itself —
they were wired in `initUI()` (`src/ui/renderers.js`), which runs once at
boot via `document.getElementById()` against shell.html's *static* markup.
Once those buttons only exist once `SettingsScreen.svelte` mounts and
renders them, a boot-time `getElementById()` in `initUI()` would sometimes
find nothing (mount timing isn't guaranteed to precede `initUI()`, since
`load()`'s data fetch is async) — so the wiring moved into the component
too, not just the markup. `getAllSeasons`/`getHonorsForTeam`/
`assignPotentials`/`getAllPlayers`/`putPlayersBulk`/`exportSaveFile`/
`deleteDB` imports were dropped from `renderers.js` once nothing there used
them any more (`importSaveFile`/`importSaveFromCode` stayed — the New Game
screen's own import flow, untouched, still needs them). A stray fourth
caller turned up during the build, not the initial read-through:
`home_transfers.js`'s `handleEndOfSeason` called `renderSettings()`
directly after an end-of-season roll-over to refresh the now-stale Season
History/Manager Trophies data — became `screenTicks.settings++`, same
pattern as `renderHome()`'s other imperative call sites. `src/validate.js`'s
REG-27/REG-29 save export/import regression checks (about a dozen) were
updated to read `settingsScreenSrc` instead of `shellSrc`/the bundle's
`initUI` substring. Verified with `npm run build` (1171/1171 validator
checks + Vite build clean), `npm run lint`, and a Playwright run driving
the real flow — recalc potentials, export a real save code, open and
cancel the import and reset sheets — end to end.

**Transfers (`renderTransfers`) migrated** — `src/lib/ui/TransfersScreen.svelte`,
mounted into `#screen-transfers`, real Svelte markup and data-fetching, no
`innerHTML`. The biggest and most self-contained of the six Phase 4 screens
(~1000 lines across Buy/Sell/Loans, against the legacy `home_transfers.js`'s
83KB). Buy is windowed rather than paginated — `bind:clientHeight` on the
scroll container plus a `scrollTop` `$state` drive `$derived` start/end
indices over the full filtered/sorted player list, with only the visible
rows (~14 at a time) absolute-positioned inside a spacer sized to
`totalCount * ROW_H`, per the plan's "Virtualize" note above and the design
spec's callout that the transfer list is the only unbounded list in the
game. The offer → rejected → counter-offer → accept negotiation flow, and
the sell/loan-out/loan-in confirmations, all became stacked bottom sheets
(component-local `$state`) in place of `home_transfers.js`'s desktop-modal
and mobile-panel branches — collapsing that branch also removed the need
for `openSquadPlayerModal` as a shared player-detail modal (Squad's own
bottom sheet, from earlier in Phase 4, covers that role now), so it was
deleted outright from `squad_tactics_offers.js` once a repo-wide grep
confirmed no remaining callers. `showOffersModal`/`_updateOffersBadge`/
`renderOffers` stay in `squad_tactics_offers.js` as legacy — the Offers
button on Transfers still calls them directly, and folding Offers into a
bottom sheet of its own is a follow-up, not part of this screen's move.
`home_transfers.js` itself shrank from 1152 to 289 lines: only the Home
bridge (`renderHome`, still called imperatively by prematch.js/
watchmatch.js/squad_tactics_offers.js — see Home's entry above) and the two
`showModal()`-based end-of-season/match-report flows remain, since those
build bottom-sheet content rather than screen content.

**Two real bugs, not scope creep, found and fixed during verification:**
first, `TransfersScreen.svelte`'s `load()` was missing the `await
openDB()` guard every other migrated screen has (Svelte islands can mount
before `boot()`'s own `openDB()` resolves) — surfaced as `TypeError: Cannot
read properties of null (reading 'transaction')` on mount, fixed by adding
it. Second, and much harder to see: virtualization rendered all ~3,000 buy
rows instead of the expected ~14, because `src/shell.html`'s shared mobile
media query forced `#screen-transfers` to `display:block!important` (a
leftover from when the screen had no internal flex layout worth
preserving) — that broke the flex-height chain
(`.transfers-screen`→`.tr-panel`→`.buy-scroll`) `bind:clientHeight` depends
on, so `clientHeight` came back equal to the full unclipped `scrollHeight`.
Diagnosed via a Playwright `evaluate()` inspecting `clientHeight`/
`scrollHeight`/`display`/`overflowY` directly, fixed by dropping
`#screen-transfers` from that shared selector (left in place for
`#screen-competitions`/`#screen-trophies`/`#screen-inbox`, which don't
virtualize and don't need it). `src/validate.js` gained a
`transfersScreenSrc` read; ~19 checks in the "Transfer System" and "Loan
System" sections were repointed at it instead of `shellSrc`/the bundle
string, 3 "defined before use" checks (`potDisp`/`potColor`/`potLabel`)
were removed as structurally impossible once `{@const}` replaced manual
ordering, and the `'renderTransfers'` entry was dropped from the
UI-functions-exist check array — `typeof eval('renderTransfers')` throws
`ReferenceError` for an undeclared identifier before `typeof` can suppress
it, so leaving it in didn't just fail one check, it crashed the whole
validator run. Verified with `npm run build` (1167/1167 validator checks +
Vite build clean), `npm run lint`, and a Playwright run driving the real
flow at 390×844: filtering and buying a player (funds correctly deducted),
a rejected offer on insufficient funds, selling a player with its confirm
sheet, and both Loan In and Loan Out with their detail sheets showing
accurate cost/relief breakdowns.

**Phase 4 is now fully complete** — all six screens (Squad, Tactics,
Academy, Trophies, Settings, Transfers) plus League and Home from Phase 3
are real Svelte components; no screen still renders via `innerHTML`. Phase
5 (live match) is next.

Per-screen recipe (for reference — the recipe this phase's screens followed):

1. Read the legacy renderer end to end first.
2. Anything that computes rather than renders moves into `src/game/`, not into a
   component. The sub rules (GK↔GK, outfield↔outfield, 3-sub limit) are the clearest
   example — they're game rules currently living in `ui/watchmatch.js`.
3. Delete the `render*` function and its handlers together.
4. Rebuild from `docs/design-system.md`.
5. Add Vitest coverage for any logic you moved; take a screenshot at 390×844 by
   hand and look at it. (There is no Playwright/E2E suite — it was removed.)
6. Compare against the Phase-0 before-shot. Better, or just newer?
7. Run `validate.js`.

**Watch on Transfers:** 83KB in one file, and it owns offer generation and AI
negotiation as well as rendering. Run `plan-gate` and split it across more than
one session.

---

## Phase 5 — Live match (~2 days) — ✅ done

**Shipped:** the matchday flow, rebuilt rather than ported, as
`src/lib/ui/MatchScreen.svelte` — a route (reached only via Play: TabBar's
FAB, or Home's `#btn-adv-header`, through the same `registerScreen()`/
`navigateTo()` mechanism every other screen uses), not a TabBar destination
of its own. `ui/prematch.js`'s pre-match modal and `ui/watchmatch.js`'s
innerHTML live viewer (`_openInlinePanel` and its z-index 10500 overlay
included) are both deleted outright, along with `home_transfers.js`'s
`showMatchReport()` and a `_handleAdvanceOneFixtureStub` that turned out to
be dead code — confirmed via repo-wide grep before deleting, same discipline
as every prior phase's `render*` removals.

**Sub rules moved to `src/game/` first, with tests, exactly as planned.**
`_wmSubClick`/`_applyUserSub`'s GK↔GK / outfield↔outfield guards and 3-sub
limit became `src/game/substitutions.js`'s `validateSubstitution()`/
`applySubstitution()`; `_applyFormationChange`'s mid-match XI recompute
became `src/game/formationChange.js`'s `applyFormationChange()`; European-
opponent stub-squad generation (`_generateStubPlayers`) became
`src/game/opponents.js`'s `generateStubPlayers()`. All three are pure,
DOM-free, and covered by real Vitest tests (`src/game/*.test.js`,
`npm run test` — newly wired into CI in this phase, since Vitest was
installed but unused before) instead of only being reachable by hand-wiring
a `_watchState` bundle global inside `validate.js`, which is how the old
GK-sub-rule and formation-change regression checks worked. Those checks —
and the rest of `validate.js`'s old "Watch Match" section — moved to Vitest
or were removed outright where the underlying identifier no longer exists in
the concatenated bundle at all (same "no legacy identifier left in `final`
to check for" reasoning as every prior screen's move to a real Svelte
component); a `matchScreenSrc` read was added alongside the other
`<name>ScreenSrc` reads for what's left as string-presence checks.
`TacticsScreen.svelte`'s formation pitch-slot layout (`SLOT_LAYOUT`/
`SLOT_POS_MAP`, ~15 formations of x/y coordinates) was extracted to
`src/game/formationLayout.js` too, not because it's simulation logic, but so
MatchScreen's Team News XI-on-pitch preview and Tactics' lineup editor share
one source of truth instead of two independently-drifting copies of the
same magic numbers.

**Five beats, all in one component, state machine style (`beat` ∈
'teamNews' | 'kickoff' | 'live' | 'fulltime' | 'after'):** team news
(opponent form, key player card, XI-on-pitch preview, lineup-block
warnings, Kick Off / Sim Instantly) → kickoff (a brief crest-vs-crest
transition, tap or ~900ms to skip) → live (tick engine ported from
`watchmatch.js` almost unchanged, score bug, event feed, fitness/bench,
1×/2×/4×/skip, pause, sub and tactics bottom sheets replacing the old
inline-panel overlay) → full time (score, scorers, one-line verdict,
shown from the live sim's own result before it's committed) → after (stats
grid, substitutions, injuries, and — new, not in the original modal — a
3-row league-position slice keyed by `teamId` and driven by
`animate:flip`, seeded with a pre-match snapshot so entering the beat
actually animates the reorder rather than rendering a static post-match
table). Quick Sim (`advanceOneFixture`, no live tick) and Watch Match
(`buildLiveMatchState`/`simulateMatchSegment`/`finaliseLiveMatch`/
`advanceOneFixtureWithResult`, all untouched `matchEngine.js`/`gameweek.js`
exports) converge on the exact same Full Time/After rendering — one
`result` object either way — rather than the old code's two separate
report paths (`showMatchReport` for Quick Sim, `_commitResult` +
`showMatchReport` again for Watch Match). Speed control and auto-pause-on-
intervention (also on injury, matching the original) both kept, as
planned.

**Two real bugs surfaced only by driving the route end-to-end in a real
browser** — `npm run build`/`lint`/`test`/`check:svelte` all passed first,
none of them would have caught either:
- `MatchScreen.svelte`'s `$effect` fires on the component's own initial
  mount, same as every other screen's — meaning `loadMatch()` ran, and
  crashed on `save.currentGameweek`, the instant the app booted, well
  before any career exists or Play is ever pressed. Fixed with the exact
  same `if (!save || save._deleted) return;` guard every other screen's
  `load()` already has — `openDB()` alone (which this file did have from
  the start) isn't the whole story, as Transfers' Phase 4 bug already
  established; this is the sibling bug, "no save yet" rather than "DB not
  open yet."
- `live`/`result`/`matchCtx` were declared with plain `$state()`, which
  deep-proxies anything assigned to it. `result` (built from `live`'s
  proxied tree) got passed into `advanceOneFixtureWithResult` →
  `putFixture`, and IndexedDB's structured-clone algorithm cannot
  serialize a Svelte 5 reactive Proxy — `DataCloneError: [object Array]
  could not be cloned`, only on a *watched* match's commit (Quick Sim's
  `result` comes straight from a DB read, never touches `live`, so it
  never hit this). Fixed by switching all three to `$state.raw()` — none
  of the three are ever deep-mutated in place (every update is `live =
  {...live, x}`, never `live.x = ...`), which is exactly the case
  `$state.raw` exists for. No other screen in this codebase writes a
  `$state`-derived object back to IndexedDB with array/object sub-fields
  deep enough for this to bite — Squad's `putPlayer({ ...p, inSquad: ... })`
  and similar spread-and-save calls elsewhere stay correct because a
  player/save record's own fields are flat primitives. Worth remembering
  if a future screen's local state ever holds something IndexedDB-bound and
  less flat than a player row.

Verified with `npm run build` (1067/1067 validator checks + Vite build
clean), `npm run test` (21/21 Vitest), `npm run lint`, `npm run
check:accents` (186/186), `npm run test:e2e` (6/6, unchanged), and two full
manual Playwright runs driving a real career at 390×844 end to end — one
through Watch Match (team news → kickoff → live with a manual substitution
and a mid-match formation change → skip → full time → after, league
position slice rendered and animated, back to Home) and one through Sim
Instantly (team news → full time → after → Home) — confirming both
converge on the same report UI and neither throws.

---

## Phase 6 — Data reconciliation (~2 days) — ✅ done

Full detail in `06-data-reconciliation.md`. footy-sim wins for every overlapping
league — no per-league audit gate. Sequence: sanity-check diff → converter →
calibrate the attribute mapping → validate → import league by league → build the
departures diff category (a player absent from every tracked league's CSV gets
dropped from the pool, same machinery as the existing moved-club diff).

Deliberately after the UI work: importing 3,455 players is much easier to sanity-check
against a squad screen you can actually read.

**Watch:** import one league, play a full season, then do the next. A bad wage
regression doesn't show up until a club goes bankrupt in March.

**Status, and where delivery diverged from this doc's literal text (with reason):**
- footy-sim's club-to-league placement turned out to be *more* current than
  pitch's own team CSVs, not just its rosters — verified against real 2026/27
  results (Coventry/Ipswich/Hull promoted to the Prem, Burnley/West Ham/Wolves
  down, Leicester/Oxford/Sheffield Wednesday down to League One). `reconcile.mjs`
  treats footy-sim's per-league club list as authoritative (it matches real
  division sizes exactly in every one of the 7 leagues) rather than only
  trusting it for rosters within pitch's existing team-to-league assignment.
  A club footy-sim never claims for a tracked league is dropped, not carried
  forward stale; a club it claims that pitch has no record of anywhere gets
  synthesized metadata (`tools/lib/teamSynthesis.mjs`), scaled off that
  league's existing clubs.
- The Step 3 gate (≥16 players, ≥2 GK per club) is enforced as a **warning**,
  not a write-blocking gate, and only against the rows a club's footy-sim
  conversion is actually substituting — several already-live clubs (Wolves at
  14, Ipswich at 1 GK, Le Havre at 12) predate this gate and would fail it
  applied retroactively, which would make it unpassable. A thin footy-sim
  squad (Mansfield Town: 1 row, Paris FC: 6) is topped up from that club's
  existing roster first — real transfers/departures elsewhere in the tracked
  universe are excluded from the top-up pool, so padding a thin squad can't
  accidentally undo Step 5's departures mechanism for exactly the clubs most
  likely to still be carrying a stale row.
- Departures can only be computed against footy-sim's *own* previous output
  (`tools/footysim-snapshot.json`, written each run), not against pitch's
  pre-migration data — diffing footy-sim against independently-curated pitch
  data produces thousands of "departures" that are really just two datasets
  disagreeing, not players leaving football. The first run establishes the
  baseline with zero departures reported; every run after that gets real
  detection.
- `src/validate.js`'s "Squad Data" regression section (§7) was rewritten from
  2025/26 to 2026/27 facts in the same change — it hard-codes specific
  player/club facts that a season's roster turnover invalidates by
  construction, whichever data source is authoritative.

---

## Phase 7 — PWA and polish (~1 day) — ⚠️ superseded in part

**The screen-by-screen quality work (step 3) and the polish pass now belong to
the redesign — see `07-redesign.md`, phase R8, which absorbs this phase.** The
redesign replaces every screen, so running a quality floor over the current ones
would be work thrown away. Steps 1, 2 and 5 below are still live and still
independent of it.


1. `vite-plugin-pwa`, `registerType: "prompt"`, maskable icons.
2. `_headers` caching rules; `size-limit` budgets in CI.
3. Quality floor (`02-design-system.md`) across all nine screens.
4. Real-device testing, installed to home screen, iOS and Android.
5. Save safety: pitch already exports `.pitch` files with an FNV-1a integrity
   hash — surface it prominently and prompt after each season.

---

## Phase 8 — Optional backend

Cloud saves in D1, shareable career pages with OG previews, leaderboards, a cron
that regenerates league data from CSVs. See `03-cloudflare-workers.md`.

---

## Ordering principles

- **Never break the playable game.** A phase that can't ship gets split.
- **`validate.js` passes at every phase boundary.** Non-negotiable until Vitest
  replaces it section by section.
- **Deploy every phase.** A preview URL on your phone is the only real review.
- **`ui/` shrinks monotonically; `modules/` doesn't shrink at all.** If a phase
  adds to `ui/`, something went wrong.
- **`src/game/` (new in Phase 5) is where UI-adjacent rules that aren't
  simulation math live** — the substitution and formation-change validation a
  screen needs but that isn't itself rendering, and doesn't belong in
  `modules/` either. Pure, DOM-free, covered by Vitest. Small so far
  (`substitutions.js`, `formationChange.js`, `opponents.js`,
  `formationLayout.js`) — grows the same deliberate way `modules/` does, not
  a dumping ground.
