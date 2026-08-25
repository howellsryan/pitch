# CLAUDE.md — Pitch Contributor Guide

> Accurate, terse instructions for AI/human contributors, loaded every session.
> Update this file in the same change when behaviour or structure changes.

## 0) Orientation — read this before touching anything

- **Product**: a free-to-play, browser-based football career manager — 9
  leagues, 186 clubs, cups, European competitions, youth academy, a
  tick-by-tick match engine. Live at **pitch-sim.com**. No accounts, no
  backend: everything runs client-side and saves to the browser's IndexedDB.
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
  + CI) and Phase 2 (toolchain) are done. **Phase 3 (shell + first screen) is
  underway.** `src/lib/ui/TabBar.svelte` and `src/lib/ui/LeagueScreen.svelte`
  are real Svelte 5 components, mounted as islands into the legacy shell from
  `src/main.js` — the bottom nav is Svelte-rendered (9 legacy screens fold
  into 5 destinations: Home, Squad, Play, Transfers, League; Tactics/Academy/
  Trophies/Settings/Inbox are reachable via quick-links on Home and Squad
  instead of their own nav slot), and League (`renderCompetitions`) is the
  first fully-migrated screen — real Svelte markup and data-fetching, no
  `innerHTML`, `animate:flip` on table reordering. Everything else in
  `src/ui/` (Home, Squad, Transfers, Tactics, Academy, Trophies, Settings,
  Inbox, watch-match) is still the hand-written `innerHTML` renderers,
  per Phase 4's screen-by-screen table. **`src/app.css`'s `@theme` block
  needed `@import "tailwindcss";` to actually work** — Phase 2 landed it
  without that import, so the Vite plugin never processed it and none of
  those custom properties existed at runtime until Phase 3's first Svelte
  component surfaced it (theme.mjs's direct `--color-club` write worked
  regardless, which is why it went unnoticed). The desktop sidebar (9 icons)
  is untouched — the 5-tab regroup is mobile-first per the design spec, and a
  persistent cross-screen context bar (crest/GW/budget) is deferred: it needs
  a real height-calc audit across every legacy screen's `100vh`-based layout,
  which wants its own pass rather than a blind one. The club accent layer
  (`src/lib/theme.mjs`) landed early with Phase 2 and already drives the live
  UI.
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
- **Test coverage is still narrow.** `src/validate.js`'s 1180 checks run on
  every push and PR, joined by a Playwright smoke test that drives a real career
  and an accent-contrast check over all 186 clubs. None of it covers UI
  correctness screen by screen. Vitest is installed but unused. See
  `scope-fence`.

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
| UI | Mostly hand-written `innerHTML` strings in `src/ui/*.js`, styled via `src/shell.html`'s inline CSS. TabBar and League are real Svelte islands (`src/lib/ui/`), mounted from `src/main.js` | Svelte 5 (runes) — **shell nav + first screen done, seven more to go (Phase 4)** |
| Styling | `shell.html`'s CSS custom properties, plus `src/app.css` `@theme` tokens | Tailwind v4, `@theme` tokens |
| Club accent | `src/lib/theme.mjs` — runtime `--color-club` with an oklch contrast guard | same |
| Persistence | IndexedDB via `src/modules/db.js` (unchanged in the target too) | same |
| Tests | `src/validate.js` (1180 checks) + Playwright smoke at 390×844 | Vitest + Playwright — `validate.js` is retired section by section, not deleted wholesale |

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
- `src/validate.js` — the 1180-check validator; `npm run build` runs it and
  aborts on any failure.
- `src/shell.html` — HTML/CSS shell, no JS.
- `src/modules/` (13 files) — game logic, **no DOM access**. This boundary
  matters: it's what makes the planned UI rebuild tractable without touching
  the simulation.
- `src/ui/` (8 files) — DOM rendering. This is what gets replaced by Svelte
  components, screen by screen, from Phase 3 onward.
- `src/data/` (10 league files + `csv/`) — team and player data. **Do not
  assume this is final** — the plan's Phase 6 reconciles it against
  `footy-sim`'s CSVs (deeper rosters, full names, nationality across all
  leagues) and adds a "player departures" mechanism for real-world transfers
  out of the tracked leagues. Hand-edit via the CSV pipeline
  (`src/csv_to_league.py`) only, never the generated `.js` files directly.
- `BRIEFING.md` — the older, still-accurate architecture/invariants doc
  (event queue, cup structure, watch-match constraints). Read it alongside
  this file, not instead of it — it goes deeper on gameplay mechanics than a
  CLAUDE.md should.
- `.claude/skills/` — `delivery-loop`, `plan-gate`, `scope-fence`,
  `memory-hygiene`, ported from `footy-sim` and retargeted at this repo's
  actual files. Use them; see §5.
- `wrangler.jsonc` — Cloudflare Workers config. `assets.directory` is `./dist`,
  which must stay in step with Vite's `outDir`.
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
npm run validate         # node src/validate.js — re-run just the 1180 checks
npm run check:accents    # club accent contrast, all 186 clubs
npm run test:e2e         # Playwright, 390×844
npm run lint             # ESLint + eslint-plugin-svelte
npm run deploy           # manual escape hatch — Cloudflare normally deploys
```

`build:legacy` and `validate` shell out to system `python3`/`node` and need no
`npm install`. Everything else needs `npm ci` first.

**Known flake:** `validate.js`'s "Home win rate >20% over 30 games" check is
stochastic and fails roughly **1 run in 8** — on unmodified `main` too. CI is
therefore intermittently red through no fault of the change under test. Re-run
before investigating; seeding the RNG is simulation math and needs `plan-gate`.

## 5) Agent Best Practices

- **Check which phase of the plan is current before starting non-trivial
  work.** `docs/plan/04-migration-phases.md` has the phase table; this file's
  §0/§2 summarize where things stand as of the last update. If they disagree,
  the live plan doc wins — fix this file in the same change.
- **`.claude/skills/plan-gate`** before touching the IndexedDB schema, the
  event queue, simulation math, the module load order, the data pipeline, or
  the footy-sim attribute-mapping step.
- **`.claude/skills/delivery-loop`** for every implementation task — triages
  checklist vs. stepped, runs Plan → Build → Self-Review → Verify.
- **`.claude/skills/scope-fence`** on every edit to existing code — this repo
  will accumulate a lot of "old way / new way" adjacent mess as the migration
  proceeds. Flag it, don't fix it inline, unless it's the phase you're on.
- **`.claude/skills/memory-hygiene`** when updating this file, `BRIEFING.md`,
  or a skill. Note its flagged gap: this file closes it, but keep both docs
  honest as the migration changes what's true.
- Comments: few, and only for a non-obvious invariant. Don't narrate what code
  does.
- Direct user/developer instructions outrank this file. Update this guide in
  the same change when it goes stale — especially the "current vs. target"
  table in §2 and the phase status in §0, which will go stale fastest.
