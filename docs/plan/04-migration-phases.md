# 04 — Migration phases

Strangler-fig on `ui/`, not on `modules/`. **Every phase ends with a playable,
deployable game**, and `validate.js` passes at the end of every one.

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
   then runs `src/validate.js`) on every push and PR — 1180 checks, not the
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

## Phase 2 — Toolchain (~2 days)

**Ships:** identical game, built by Vite. Zero visible change — which is what
makes it the riskiest phase.

1. `npm i -D vite @sveltejs/vite-plugin-svelte svelte typescript svelte-check
   @tailwindcss/vite tailwindcss vite-plugin-pwa vitest @playwright/test eslint
   eslint-plugin-svelte size-limit`
2. **Convert `modules/` to real ES modules, one file at a time, in `build.py`'s
   declared dependency order**, running `validate.js` after each:
   `db → matchEngine → standings → fixtures → cups → transfers → potential →
   injuries → promotion → youthAcademy → save → season → gameweek`
3. Handle `season.js`'s dynamic `import('./cups.js')` (`build.py:77`) — check for a
   cycle once it's real.
4. Convert `data/*.js` from global assignment to explicit exports.
5. Keep `ui/` as-is, loaded as side-effect imports; keep `shell.html`'s markup and
   CSS verbatim in `index.html`. **The UI does not change in this phase.**
6. Configure a second IIFE build target so `validate.js` still has a bundle to
   check (`01-tech-stack.md`).
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

## Phase 3 — Shell and first screen (~2 days)

**Ships:** the Broadcast Kit identity, five-item bottom nav, one real screen.

1. `src/app.css` — the `@theme` token block from `docs/design-system.md`.
2. Build `src/lib/ui/` from the component inventory, against real data.
3. `App.svelte`: context bar (crest / GW / budget), screen slot, bottom nav —
   Home, Squad, **Play**, Transfers, League. Nine nav items become five; Tactics
   moves under Squad, Academy and Trophies under Home, Inbox to the context bar.
4. **Migrate League (`renderCompetitions`) first** — self-contained, and table rows
   re-ordering on `animate:flip` after a gameweek is the demo that justifies the
   rewrite.
5. Everything else stays in a `<LegacyPanel>` wrapper hosting the old renderer.
6. Add URL routing and switch `not_found_handling` to `single-page-application`.

**Watch:** the **Play** button pops one event off `save.pendingEvents` — it does
not advance a gameweek. Get this wrong and cups and Europe silently stop working.
Put a comment on it.

---

## Phase 4 — Screen by screen (~1 day each)

| # | Screen | Legacy source | Notes |
|---|---|---|---|
| 1 | **Home** | `ui/home_transfers.js` `renderHome` | Next fixture, form, table snippet, inbox |
| 2 | **Squad** | `ui/squad_tactics_offers.js` `renderSquad` | 11-column grid → two-line rows |
| 3 | **Tactics** | same file, `renderTactics` | Pitch graphic, 7 formations, mentality. Tap-to-swap, not drag |
| 4 | **Transfers** | `ui/home_transfers.js` (83KB) | **Biggest.** Split into Search / Shortlist / Offers / History. Virtualize |
| 5 | **Academy** | `ui/academy.js` | Smallest. Youth intake cards |
| 6 | **Trophies** | `ui/renderers.js` `renderHonours` | Honours cabinet |
| 7 | **Settings** | `ui/renderers.js` | Save export/import as first-class actions |

Per-screen recipe:

1. Read the legacy renderer end to end first.
2. Anything that computes rather than renders moves into `src/game/`, not into a
   component. The sub rules (GK↔GK, outfield↔outfield, 3-sub limit) are the clearest
   example — they're game rules currently living in `ui/watchmatch.js`.
3. Delete the `render*` function and its handlers together.
4. Rebuild from `docs/design-system.md`.
5. Add Vitest coverage for any logic you moved; add a Playwright screenshot at
   390×844.
6. Compare against the Phase-0 before-shot. Better, or just newer?
7. Run `validate.js`.

**Watch on Transfers:** 83KB in one file, and it owns offer generation and AI
negotiation as well as rendering. Run `plan-gate` and split it across more than
one session.

---

## Phase 5 — Live match (~2 days)

**Ships:** the matchday flow, rebuilt rather than ported.

`ui/watchmatch.js` (32KB) works around a constraint that disappears in Svelte: a
match becomes a route, and a substitution sheet a sibling component, so
`_openInlinePanel` and its z-index 10500 overlay go away.

1. Move the sub rules into `src/game/` first, with tests. Then build the UI.
2. Five beats: team news → kickoff → live → full time → after
   (`02-design-system.md`).
3. Keep speed control (1× / 4× / skip) — `ui-ux-pro-max`'s immersive-pattern rule
   requires a skip and it's right.
4. Keep the auto-pause-on-intervention behaviour. It is correct and players will
   expect it.

**Watch:** the tick loop drives from `matchEngine`. Do not let the UI's clock
become the source of truth for match state — the engine decides, the UI plays it
back.

---

## Phase 6 — Data reconciliation (~2 days)

Full detail in `06-data-reconciliation.md`. footy-sim wins for every overlapping
league — no per-league audit gate. Sequence: sanity-check diff → converter →
calibrate the attribute mapping → validate → import league by league → build the
departures diff category (a player absent from every tracked league's CSV gets
dropped from the pool, same machinery as the existing moved-club diff).

Deliberately after the UI work: importing 3,455 players is much easier to sanity-check
against a squad screen you can actually read.

**Watch:** import one league, play a full season, then do the next. A bad wage
regression doesn't show up until a club goes bankrupt in March.

---

## Phase 7 — PWA and polish (~1 day)

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
