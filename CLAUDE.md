# CLAUDE.md — Pitch Contributor Guide

> Accurate, terse instructions for AI/human contributors, loaded every session.
> Update this file in the same change when behaviour or structure changes.

## 0) Orientation — read this before touching anything

- **Product**: a free-to-play, browser-based football career manager — 9
  leagues, 186 clubs, cups, European competitions, youth academy, a
  tick-by-tick match engine. Live at **pitch-sim.com**. No forced accounts:
  everything runs client-side and saves to the browser's IndexedDB by
  default. An optional Google sign-in (ROADMAP.md item 7) backs that up to a
  minimal Cloudflare Worker + D1 — `functions/`, Pitch's only server-side
  code — but playing without one works exactly as before.
- **This repo is mid-rebuild, on a written plan — read `docs/plan/*.md` before
  starting any non-trivial work.** It covers the tech stack decision, the
  design direction, an 8-phase migration order, and the data-reconciliation
  spec. Don't infer the plan from this repo's current state alone — the
  current state is a snapshot mid-migration, not the destination. (The plan
  was originally drafted in `howellsryan/footy-sim` during early exploration,
  before `pitch` was identified as the actual base to build on — it moved here
  once that was settled. `footy-sim` still holds a copy from that point; this
  one is authoritative.)
- **Where things stand right now**: Phase 0 (Workers), Phase 1 (portable build
  + CI), Phase 2 (toolchain), **Phase 4 (screen-by-screen), Phase 5 (live
  match) and Phase 6 (data reconciliation) are done.** Phase 3 (shell + first
  screen)'s blocking pieces are done too — a couple of its steps stay
  deliberately deferred (see `docs/plan/04-migration-phases.md`'s Phase 3
  section: no context bar, no `<LegacyPanel>`, no URL routing). **What's next
  is now the redesign, `docs/plan/07-redesign.md` — a total visual and
  interaction rebuild taking no inspiration from Broadcast Kit, whose direction
  is accepted and whose phases are R0–R8. R0 (token layer, type system, UI
  kit), R1 (entry: marketing home + club select), R2 (shell and navigation)
  and R3 (Home = Spine) are done; R4 (Squad + Tactics = Chalk) is next.** It supersedes
  `02-design-system.md` from R0 onward and absorbs most of the old Phase 7.
  Read it before touching any screen: three metaphors (Spine home, Chalk
  squad+tactics, Broadcast matchday) over one shared palette and type system,
  and one decision worth knowing up front — **the match engine has no spatial
  model, so the passing/ball visualisation is derived deterministically from
  the events it already emits, in `src/game/matchMotion.js`, never simulated.** `src/lib/ui/` holds one real Svelte 5 component per screen
  (`TabBar`, `LeagueScreen`, `HomeScreen`, `SquadScreen`, `TacticsScreen`,
  `AcademyScreen`, `TrophiesScreen`, `SettingsScreen`, `TransfersScreen`,
  `MatchScreen`),
  each mounted as an island into the legacy shell from `src/main.js` — real
  markup and data-fetching, no `innerHTML`. The bottom nav is Svelte-rendered
  (9 legacy screens fold into 5 destinations: Home, Squad, Play, Transfers,
  League; Tactics/Academy/Trophies/Settings/Inbox are reachable via
  quick-links on Home and Squad instead of their own nav slot). Per-screen
  notes worth knowing: League has `animate:flip` on table reordering; Home
  owns the Play/EOY/Deadline-day header flow (the `id="btn-adv-header"`
  button stays put specifically so TabBar's Play destination and prematch.js's
  disable-during-sim logic keep finding it by id) and survives as a thin
  bridge (`renderHome`, `screenTicks.home++`) because prematch.js/
  watchmatch.js/squad_tactics_offers.js still call it imperatively after
  match/squad/save events; Squad and Academy use real bottom sheets
  (component-local state, not `showModal()`) for player detail and
  promote/release; Settings moved its export/import/reset button wiring out
  of `initUI()` (src/ui/renderers.js) and into the component itself, since
  querying static shell.html elements at boot time would have raced the
  Svelte island's own mount — the pattern to follow for any screen whose
  buttons used to be wired from outside its own render function, not just
  from within it; Transfers — the biggest screen, ~1000 lines across Buy/
  Sell/Loans — virtualizes its Buy list (a windowed scroll over `$derived`
  filtered/sorted results, not pagination: the design spec calls out the
  transfer list as "the only unbounded list in the game") and rebuilt the
  offer → rejected → counter-offer → accept/collapse negotiation flow as
  stacked bottom sheets. Getting Transfers' virtualization to actually clip
  (rather than render all ~3,000 rows) needed a real fix, not a tweak: the
  shared mobile-viewport rule forcing `#screen-transfers` to
  `display:block!important` (a leftover from when the screen had no
  internal flex layout to preserve) broke the flex-height chain the
  windowed scroll depends on end to end — removed for `#screen-transfers`
  specifically, left alone for the sibling screens still in that shared
  rule since they don't depend on it. `openSquadPlayerModal` — Squad's old
  player-detail modal, kept alive through the Squad/Tactics/Academy/
  Trophies/Settings phases solely because Transfers' desktop-width branch
  still called it — lost that caller once Transfers got its own bottom
  sheet and was deleted outright, along with `squad_tactics_offers.js`'s
  `renderCups`/`renderHonours`-style validator-only aliases pattern (see
  below). Each migration deletes its `render*` function and any
  validator-only aliases kept solely to satisfy old `typeof x === 'function'`
  checks (confirmed dead via repo-wide grep first, never assumed) — `src/ui/`
  shrinks accordingly (`academy.js` is gone outright, also dropped from
  `build.py`'s `MODULES` list) and `src/validate.js` gets a `<name>ScreenSrc`
  read for each migrated component, repointing checks that used to assert on
  bundle-string markup. `showOffersModal`/`_updateOffersBadge`/`renderOffers`
  stay in `src/ui/squad_tactics_offers.js` as legacy — the Offers button on
  Transfers still calls them directly, and moving Offers into a bottom sheet
  of its own wasn't this phase's call to make; `handleEndOfSeason`/
  `showMatchReport` stay in `src/ui/home_transfers.js` since they build
  `showModal()` bottom-sheet content, not screen content, and are triggered
  from Home, not any screen migrated in this phase. **`src/app.css`'s
  `@theme` block needed two
  separate fixes before it worked at runtime, not one.** Phase 2 landed it
  without `@import "tailwindcss";`, so the Vite plugin never processed it at
  all — fixed when Phase 3's first Svelte component needed it. That fix
  alone wasn't enough: plain `@theme { … }` only emits a `:root` custom
  property for a token Tailwind's scanner sees referenced by an actual
  utility class (`bg-surface`, say) — every screen here consumes these
  tokens purely as raw `var(--color-surface)` inside a component's own
  `<style>` block, which the scanner never counts as "used", so every token
  except `--font-mono` (a name Tailwind already ships a built-in default
  for) was silently absent from `:root` and anything referencing one fell
  back to the property's CSS-initial value — `background:
  var(--color-surface)` quietly became `transparent`. League and Home had
  shipped with this bug live (their cards just read as slightly flat, easy
  to miss); it surfaced when Squad's bottom sheet rendered fully
  see-through and a `getComputedStyle()` check showed `--color-surface`
  empty even at `:root`.
  Fixed by switching to `@theme static { … }`, which forces Tailwind to emit
  the whole block regardless of scanned usage — verified by checking the
  built CSS's `:root,:host{…}` rule actually lists all twelve color/font
  tokens now, not just the one Tailwind already knew. theme.mjs's direct
  `--color-club` write on `documentElement.style` was never affected either
  way, since it's an inline style, not a stylesheet rule — which is why nothing
  caught this sooner. The screenshot rule this bought is now
  `verification-before-completion`'s to enforce, not this file's.
  The desktop sidebar (9 icons) is untouched — the
  5-tab regroup is mobile-first per the design spec, and a persistent
  cross-screen context bar (crest/GW/budget) is deferred: it needs a real
  height-calc audit across every legacy screen's `100vh`-based layout, which
  wants its own pass rather than a blind one. The club accent layer
  (`src/lib/theme.mjs`) landed early with Phase 2 and already drives the live
  UI.
- **Live match (`src/lib/ui/MatchScreen.svelte`) is a route, not a modal** —
  reached only via Play (TabBar's FAB, or Home's `#btn-adv-header`), same
  `registerScreen()`/`navigateTo()` mechanism as every other screen, not a
  TabBar destination of its own. Five beats in one component: team news
  (opponent form, key player, XI-on-pitch preview reusing
  `src/game/formationLayout.js`'s `SLOT_LAYOUT`/`SLOT_POS_MAP` — now shared
  with `TacticsScreen.svelte` instead of each holding its own copy) → a
  brief kickoff transition → live (tick engine, score bug, event feed, 1×/
  2×/4×/skip, pause, sub and tactics bottom sheets) → full time (score,
  scorers, one-line verdict) → after (stats, subs, injuries, a 3-row league
  slice with `animate:flip` seeded from a pre-match snapshot so the reveal
  actually animates the reorder, not just a static post-match table).
  Replaces `ui/prematch.js`'s modal and `ui/watchmatch.js`'s innerHTML
  viewer outright — both deleted, along with `home_transfers.js`'s
  `showMatchReport()` and a dead `_handleAdvanceOneFixtureStub` that never
  had a live caller. The GK↔GK/outfield↔outfield/3-sub-limit substitution
  rule and the mid-match formation-change recompute — both previously
  hand-rolled inline in `watchmatch.js` — moved to `src/game/
  substitutions.js`/`formationChange.js`: pure, DOM-free, and covered by
  real Vitest tests (`src/game/*.test.js`, `npm run test`) instead of only
  being reachable by wiring up a bundle-global by hand in `validate.js`.
  European-opponent stub-squad generation moved the same way, to
  `src/game/opponents.js`. Two real bugs surfaced only once the route was
  driven end-to-end in a browser, not by the checks above: MatchScreen's
  `$effect` fires on its own initial mount (same as every screen's) —
  before any save exists — so `loadMatch()` needed the same `if (!save ||
  save._deleted) return;` guard every other screen's `load()` already has,
  not just an `openDB()` call; and `live`/`result`/`matchCtx` needed
  `$state.raw()`, not plain `$state()` — Svelte 5 deep-proxies anything
  assigned to plain `$state`, and IndexedDB's structured-clone algorithm
  cannot serialize a reactive Proxy, so `putFixture` threw `DataCloneError`
  the moment a *watched* (not quick-simmed) match tried to commit its
  result. All three are reassigned wholesale, never deep-mutated in place,
  which is exactly what `$state.raw` is for. `src/validate.js`'s old
  "Watch Match" section and five "Regression" sections drove
  `_applyUserSub`/`_applyFormationChange` directly against a hand-wired
  `_watchState` bundle global — that's gone with `watchmatch.js`, so those
  became real Vitest tests instead of bundle-eval checks; a `matchScreenSrc`
  read was added alongside the other `<name>ScreenSrc` reads for the
  string-presence checks that still make sense post-move.
- **The entry route (`src/lib/ui/EntryScreen.svelte`, R1) is the marketing home
  and the club picker in one scrolling page**, mounted into `#ng` — the only
  island that lives outside `#app`. It replaced `renderNewGame()` and all of
  `#ng`'s markup (manager-name field, emoji team grid, league filter buttons,
  both import paths), which are deleted. `boot()` still decides whether `#ng`
  or `#app` is shown, and both it and EntryScreen now reveal the shell through
  one shared `enterGame()` in `src/ui/renderers.js` rather than each doing the
  same four DOM steps by hand. Three things a later session will otherwise get
  wrong: the picker shows **`startingBudget(reputation)`, never a club's
  `budget` field** — `startNewGame()` recomputes budgets from reputation, so
  the data figure is wrong for all but a couple of clubs (Arsenal's file says
  £130M, a new save starts on £102M), which is why that formula was extracted
  out of `startNewGame()` into an exported `startingBudget()` and is now the
  single source for both; **`startNewGame()` does not clear a previous
  career's fixtures/standings** (it uses `putFixturesBulk`/`putStandingsBulk`,
  not the `replaceAll*` variants), which is harmless only because a new career
  is unreachable while a save exists — fix it before making one reachable, and
  it is `plan-gate` work; and **"Continue your career" is deliberately not
  built** (deferred to R7 along with the Settings link that would make it
  reachable) — an earlier `#menu` hash route was written and then removed in
  code review for producing four defects at once. `src/game/clubStrength.js`
  holds the squad-strength/key-player/difficulty maths, rating players via
  `matchEngine.js`'s own `primaryRating()` so the picker agrees with the
  simulation.
- **Data reconciliation (Phase 6) replaced 7 of the 9 leagues' rosters with
  footy-sim's**, and along the way found the reconciliation's own premise
  half-wrong: `docs/plan/06-data-reconciliation.md`'s evidence section
  checked player *freshness* per club but never checked whether footy-sim's
  *club list* for a league matched pitch's — it didn't, and not because of a
  footy-sim data error. footy-sim's Prem file has Coventry/Ipswich/Hull and
  not Burnley/West Ham/Wolves; verified against real results, that's the
  correct 2026/27 top flight — pitch's own team CSVs were the ones a season
  stale. `tools/reconcile.mjs` therefore trusts footy-sim for club-to-league
  placement too, not just roster content: a club footy-sim places in a
  tracked league gets that club's existing pitch metadata (crest, stadium,
  budget) if pitch has it anywhere, or synthesized metadata scaled off that
  league's other clubs if it doesn't (`tools/lib/teamSynthesis.mjs`); a pitch
  club no footy-sim league ever claims has left the tracked tier and is
  dropped, not carried forward stale. Every one of the 7 leagues' footy-sim
  club count matched its real division size exactly once this was applied
  (20/24/24/24/18/20/18) — the prior per-club matching (before this was
  understood) left several clubs on 0 players and would have failed any
  literal reading of the plan's Step 3 gate for every single league. The
  6-attribute → 4-aggregate weights (`tools/lib/rating.mjs`) are calibrated,
  not the plan doc's starting values verbatim — `tools/calibrate-weights.mjs`
  fits them by least squares against the ~700 players present in both
  datasets, landing mean absolute error at 3.84 (starting weights: 11.92)
  against the plan's ~4-point threshold; rerun it if the calibrated weights
  in `tools/weights.json` ever look off, don't hand-tune them. A thin
  footy-sim squad (Mansfield Town: 1 row, Paris FC: 6) gets topped up from
  its existing pitch roster rather than shipped unplayable — see
  `docs/plan/04-migration-phases.md`'s Phase 6 status note for the fuller
  list of where delivery diverged from the plan doc's literal text, and why.
- **Two build paths run side by side.** Vite builds the app; `src/build.py`'s
  concatenation survives *only* to feed `src/validate.js`, which asserts against
  the bundle's raw source text and cannot read a Vite bundle. Don't delete
  `build.py`, and don't repoint the validator at Vite output. `npm run build`
  runs both.
- **The deployed artifact is the Vite build.** `wrangler.jsonc` serves `./dist`,
  and **Cloudflare Workers Builds — not GitHub Actions — deploys it**, straight
  from the GitHub repo. Never re-add a deploy step to CI: two systems deploying
  one Worker race each other. The legacy `index.html` is now built for the
  validator only.

  Its dashboard settings, which live outside this repo and are easy to get
  wrong:

  | Setting | Value |
  |---|---|
  | Build command | `npm run build:app` |
  | Deploy command | `npx wrangler deploy` |
  | Non-production branch deploy command | `npx wrangler versions upload` |
  | Root directory | `/` |

  Two traps, both already paid for once. **Root directory is `/`, not `dist/`** —
  `dist/` is gitignored, so pointing at it fails during clone with `root
  directory not found`, before anything installs; where output is *served* from
  is `wrangler.jsonc`, not this field. And **`build:app`, not `build`** —
  `build:legacy` shells out to `python3`, and exists only to feed `validate.js`,
  which CI already gates. Cloudflare runs its own install step, so the build
  command must not repeat one.
- **`wrangler.jsonc` is no longer assets-only (ROADMAP.md item 7).** It now
  has a `main` (`functions/_worker.js`) and a `d1_databases` binding, standing
  up Pitch's first server-side request handling (Google OAuth + a D1-backed
  cloud save) alongside the static asset serving above. `functions/_worker.js`
  sees every request first and explicitly falls through to
  `env.ASSETS.fetch(request)` for anything under `/api/*` it doesn't own — the
  asset-serving behavior this Worker had before is unchanged, just no longer
  automatic. **`functions/` mirrors Cloudflare *Pages*' `functions/api/**`
  file convention for readability and portability, but isn't auto-routed** —
  Pitch deploys as a plain Worker, not Pages, so `_worker.js` dispatches to
  each handler manually; see its header comment. The `d1_databases.database_id`
  in `wrangler.jsonc` is still a placeholder (`wrangler d1 create pitch-db`
  hasn't been run against a real account — this repo's sessions don't have
  Cloudflare credentials) and `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/
  `JWT_SECRET` aren't set as secrets yet; `wrangler.jsonc`'s own comment block
  has the exact remaining steps. Until then `/api/auth/google` answers a
  clean 500 rather than breaking the deploy.
- **Test coverage is still narrow.** `src/validate.js`'s 1209 checks run on
  every push and PR, joined by a Playwright smoke test that drives a real career,
  an accent-contrast check over all 186 clubs, and — since Phase 5 —
  `npm run test` (Vitest) for `src/game/`'s pure substitution/formation-change/
  opponent-generation logic. None of it covers UI correctness screen by
  screen — which is why a green build is not evidence a screen works. See
  `verification-before-completion`.

## 1) Snapshot

- Turn-based by gameweek via an **event queue** (`save.pendingEvents`, built
  and drained in `src/modules/gameweek.js`): one button press pops exactly one
  event — a league fixture, a cup tie, a European matchday — through a
  pre-match screen and a result. **The gameweek advances only when the queue
  is empty.** Cup opponents are pre-drawn when the queue is built. Treat this
  as load-bearing; see `plan-gate`.
- Full English pyramid (4 tiers, playoffs), 7 domestic cups, Champions/Europa/
  Conference League, youth academy with a potential/wonderkid system, player
  aging and retirement, multi-season careers.
- Single save per browser, **IndexedDB** (`pitch_fc`, `DB_VERSION = 3`), 8
  object stores: `save`, `teams`, `players`, `fixtures`, `standings`,
  `transfers`, `honors`, `seasons`. **No migration path exists.** A schema
  change without one orphans every existing save — gate it (`plan-gate`).
  Export/import as a `.pitch` file (FNV-1a integrity hash) already works and
  is the user's only escape hatch if a save breaks; don't regress it.
- Domain status: **pitch-sim.com is still served by GitHub Pages** (`CNAME` is
  still present and untouched). The Cloudflare Worker (`pitch`) is live and
  deployed on every push to `main`, but reachable today only at its
  `workers.dev` URL — the custom-domain cutover is a separate, deliberate step
  per the plan's Phase 0, not yet done.

## 2) Tech stack — current vs. target

| | **Today** | **Target (per the plan)** |
|---|---|---|
| Build | **Vite** (`vite.config.ts`, root `web/`, output `dist/`). `src/build.py` still concatenates for the validator only | Vite alone, once `validate.js` retires |
| Modules | **Real ES modules** — 333 top-level names, 278 import bindings | same |
| UI | **All 9 screens, the live-match route and the pre-game entry route are real Svelte islands** (`src/lib/ui/`: EntryScreen, TabBar, LeagueScreen, HomeScreen, SquadScreen, TacticsScreen, AcademyScreen, TrophiesScreen, SettingsScreen, TransfersScreen, MatchScreen), mounted from `src/main.js`. `src/ui/*.js` now holds only bridge/legacy-modal code (`home_transfers.js`, `squad_tactics_offers.js`, `inbox.js`, `helpers.js`, `renderers.js`) — no screen-level `innerHTML` renderers remain, and `prematch.js`/`watchmatch.js` are deleted outright | Svelte 5 (runes) — **Phases 4, 5 and 6 done; the redesign (R0–R8, `docs/plan/07-redesign.md`) supersedes the old Phase 7 — R0–R3 shipped** |
| Styling | `shell.html`'s CSS custom properties, plus `src/app.css` `@theme` tokens | Tailwind v4, `@theme` tokens |
| Club accent | `src/lib/theme.mjs` — runtime `--color-club` with an oklch contrast guard | same |
| Persistence | IndexedDB via `src/modules/db.js` (unchanged in the target too) | same |
| Game logic (non-DOM) | `src/modules/` (simulation, data) + `src/game/` (pure UI-adjacent rules: substitution/formation-change validation, opponent stub generation) — the latter is new in Phase 5, covered by Vitest instead of `validate.js`'s bundle-eval checks | same |
| Tests | `src/validate.js` (1209 checks) + Vitest (`src/game/*.test.js`, unit) + Playwright smoke at 390×844 | Vitest + Playwright — `validate.js` is retired section by section, not deleted wholesale |

Don't introduce a different UI framework, CSS approach, or build tool than
what's in the target column — the choice is already made and reasoned through
in the plan; re-litigating it mid-implementation wastes the phase structure
the plan exists to provide.

**Design direction is also already decided**: "Broadcast Kit" — broadcast-
graphics visual language (score bugs, condensed numerals) with a runtime
per-club accent color. See `docs/plan/02-design-system.md` for the full mobile
UX spec, tokens, and the design canvas it was drafted against.

## 3) Repository Layout

- `index.html` — **build artifact.** Gitignored, regenerated by every build,
  never hand-edited or committed. Don't be confused if it's missing from a
  fresh clone — that's correct; run `npm run build`.
- `src/build.py` — the concatenation pipeline. Module load order is a real
  dependency graph (data files → `db` → `matchEngine` → `standings` →
  `fixtures` → `cups` → `transfers` → `potential` → `injuries` → `promotion` →
  `youthAcademy` → `save` → `season` → `gameweek` → `ui/*`); reordering breaks
  the build in ways that only surface at runtime.
- `src/validate.js` — the 1209-check validator; `npm run build` runs it and
  aborts on any failure.
- `src/shell.html` — HTML/CSS shell, no JS.
- `src/modules/` (13 files) — game logic, **no DOM access**. This boundary
  matters: it's what makes the planned UI rebuild tractable without touching
  the simulation.
- `src/game/` (5 files, new in Phase 5) — UI-adjacent pure logic that isn't
  simulation math (substitution/formation-change validation, opponent stub
  generation, club-strength metrics for the entry picker) and isn't rendering
  either. **No DOM access**, same rule as
  `modules/`. Covered by Vitest (`*.test.js` alongside each file, `npm run
  test`) instead of `validate.js`, since it's consumed by Svelte components
  via real imports and never enters `build.py`'s concatenated bundle.
- `src/ui/` (5 files) — DOM rendering. What's left after Phase 4/5 replaced
  every screen-level renderer with a Svelte component: bridge code
  (`home_transfers.js`'s `renderHome`/`handleEndOfSeason`), legacy modals
  (`squad_tactics_offers.js`'s Offers, `inbox.js`), and shared helpers
  (`helpers.js`, `renderers.js`).
- `src/data/` (10 league files + `csv/`) — team and player data. **Phase 6
  reconciled 7 of the 9 leagues against `footy-sim`'s CSVs**: deeper rosters,
  full names, nationality everywhere (not just the PL), and footy-sim's
  club-to-league placement trusted outright (verified against real 2026/27
  promotion/relegation results — see `docs/plan/06-data-reconciliation.md`'s
  Phase 6 status note in `04-migration-phases.md`). Serie A and Eredivisie
  stay pitch-native — footy-sim has no CSVs for either. Hand-edit via the CSV
  pipeline only, never the generated `.js` files directly:
  `tools/csv-to-league.mjs` (CSV → `.js`, replaces the retired
  `src/csv_to_league.py`) for a manual edit to an existing league's CSVs, or
  `tools/reconcile.mjs` (footy-sim CSV → pitch CSV, then feed that into
  `csv-to-league.mjs`) to re-pull from footy-sim after its data changes —
  `tools/audit-rosters.mjs` is a read-only sanity diff worth running first.
  All three live in `tools/`, backed by shared helpers in `tools/lib/`
  (CSV parsing, fuzzy team-name matching, the calibrated attribute-mapping
  weights in `tools/weights.json`, the Step 3 validation gate, JS generation,
  and the footy-sim-vs-footy-sim departures diff against
  `tools/footysim-snapshot.json`).
- `.claude/skills/` — `delivery-loop`, `plan-gate`, `scope-fence`,
  `memory-hygiene`, ported from `footy-sim` and retargeted at this repo's
  actual files, plus `systematic-debugging` and
  `verification-before-completion`, adapted from `obra/superpowers` (MIT).
  Use them; see §5.
- `wrangler.jsonc` — Cloudflare Workers config. `assets.directory` is `./dist`,
  which must stay in step with Vite's `outDir`. Also carries `main`
  (`functions/_worker.js`) and the `pitch-db` D1 binding since ROADMAP.md item
  7 — see the file's own header comment.
- `functions/` — Pitch's only server-side code (ROADMAP.md item 7): Google
  OAuth + a D1-backed cloud save, running in the Cloudflare Workers runtime,
  not the browser. `_worker.js` is the manual dispatcher (`wrangler.jsonc`'s
  `main`); `api/auth/**` and `api/save.js` mirror PocketRPG's Pages
  `functions/api/**` layout for portability without being auto-routed the
  way Pages routes them; `_lib/{jwt,auth}.js` are the session/JWT helpers.
  Covered by Vitest (`functions/_lib/jwt.test.js`), not `validate.js` — it
  never enters `build.py`'s bundle.
- `migrations/` — D1 schema migrations (`0001_init.sql`: `users`,
  `oauth_identities`, `saves`). Apply with `wrangler d1 migrations apply
  pitch-db --local` (dev, no Cloudflare account needed) or `--remote`
  (production, after `wrangler d1 create pitch-db`).
- `.assetsignore` — **now inert.** Wrangler reads it from the assets directory,
  and that is `dist/` now, not the repo root. It doesn't need to do anything:
  `dist/` holds only build output, so `src/` and repo tooling can't leak into
  the served site. Kept because it matters again if the root is ever served.
- `.github/workflows/deploy.yml` — despite the filename, **one job and no
  deploy**: `build` runs on every push/PR (both build paths, the validator,
  lint, the 186-club accent check, Playwright). Deploying is Cloudflare's.

## 4) Build / Test / Deploy

```bash
npm run dev              # Vite dev server with HMR, :5173
npm run build            # both paths: legacy bundle + validator, then the Vite app
npm run build:legacy     # python3 src/build.py — bundle, validate, assemble index.html
npm run build:app        # Vite → dist/
npm run validate         # node src/validate.js — re-run just the 1209 checks
npm run test             # Vitest — src/game/*.test.js (pure logic, no bundle needed)
npm run check:accents    # club accent contrast, all 186 clubs
npm run test:e2e         # Playwright, 390×844
npm run lint             # ESLint + eslint-plugin-svelte
npm run deploy           # manual escape hatch — Cloudflare normally deploys
```

`build:legacy` and `validate` shell out to system `python3`/`node` and need no
`npm install`. Everything else needs `npm ci` first.

**The validator has no accepted flakes.** It never samples match outcomes, so
CI must not pass or fail because of `Math.random()`. Calibrated goal rates,
win rates and scorer distributions need a deterministic, injectable RNG before
they become automated assertions. Treat every red check as actionable.

## 5) Agent Best Practices

- **Check which phase of the plan is current before starting non-trivial
  work.** `docs/plan/04-migration-phases.md` has the phase table; this file's
  §0/§2 summarize where things stand as of the last update. If they disagree,
  the live plan doc wins — fix this file in the same change.
- **`.claude/skills/plan-gate`** before touching the IndexedDB schema, the
  event queue, simulation math, the module load order, the data pipeline, or
  the footy-sim attribute-mapping step.
- **`.claude/skills/delivery-loop`** for every implementation task — triages
  spike vs. checklist vs. stepped, runs Plan → Build → Self-Review → Verify.
  A spike answers a question and ships no code; don't let one drift into an
  implementation without re-triaging.
- **`.claude/skills/scope-fence`** on every edit to existing code — this repo
  will accumulate a lot of "old way / new way" adjacent mess as the migration
  proceeds. Flag it, don't fix it inline, unless it's the phase you're on.
  It now also carries a diff-vs-intent check to run before committing.
- **`.claude/skills/systematic-debugging`** the moment the task is a broken
  thing rather than a new one. Root cause before fix; stop and question the
  architecture after three failed attempts rather than trying a fourth. It
  also holds the rule that a failing check is actionable, not a reason to rerun
  until random outcomes happen to pass.
- **`.claude/skills/verification-before-completion`** before claiming anything
  works, passes, or is done. A green build proves no known regression in what
  the 1209 checks cover — never that a screen renders. Includes the screenshot
  rule for any new or restyled screen.
- **`.claude/skills/memory-hygiene`** when updating this file or a skill.
  `BRIEFING.md` (a duplicate, drifted-stale architecture doc) was removed —
  this file is now the single source for gameplay invariants; keep it honest
  as the migration changes what's true.
- Comments: few, and only for a non-obvious invariant. Don't narrate what code
  does.
- Direct user/developer instructions outrank this file. Update this guide in
  the same change when it goes stale — especially the "current vs. target"
  table in §2 and the phase status in §0, which will go stale fastest.
