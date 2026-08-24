# Pitch — UI/UX rebuild + Cloudflare delivery plan

**Status: proposal. Nothing in this plan has been implemented.**

## The decision

**`howellsryan/pitch` is the base.** The game ships from there. `footy-sim`
contributes its player/club data and its CSV validation pipeline, and is
otherwise retired.

That reverses the original framing of this plan, which was written before
`pitch` was on the table. Everything in `docs/plan/` has been rewritten against
the new base.

Read in order:

| Doc | Covers |
|---|---|
| `01-tech-stack.md` | Target stack, and the specific shape of pitch's codebase |
| `02-design-system.md` | The chosen direction, the canvas, mobile UX spec |
| `03-cloudflare-workers.md` | Hosting, moving pitch-sim.com off GitHub Pages, CI, PWA |
| `04-migration-phases.md` | Phase-by-phase build order |
| `05-skills-and-workflow.md` | Skills to vendor, workflow, doc upkeep |
| `06-data-reconciliation.md` | Merging footy-sim's data into pitch's schema |

## Why pitch wins

Read from source (`pitch_source.zip`, 22 modules + `BRIEFING.md`), not from the
README's claims:

| | pitch | footy-sim |
|---|---|---|
| Leagues / clubs | 9 / 186 | 7 / ~140 |
| Match sim | `matchEngine.js`, 34KB, tick-by-tick, xG, in-match subs and mentality | `engine.js`, 687 lines, returns a scoreline |
| Cups | 7 domestic + UCL/UEL/UECL, pre-drawn opponents, real prize money | none |
| Pyramid | 4 English tiers, 2-leg playoff semis + final, AI leagues resolve by reputation | flat promotion/relegation |
| Progression | potential system, youth academy, wonderkids, age curves, retirement | aging + retirement |
| Persistence | IndexedDB, 8 object stores, FNV-1a integrity hash, export as `.pitch` file | one `localStorage` key |
| Tests | `validate.js` — 1,190 checks, DOM stubbed, run in Node against the bundle | none |
| Live | pitch-sim.com | not deployed |

pitch is roughly a generation ahead. The original plan had a whole phase for
*building* a match timeline so matchday could feel like something; pitch has one
already.

## What's actually wrong with pitch

The engine is not the problem. Four things are:

1. **The UI is desktop-shaped.** A 72px icon sidebar with 9 items, degrading to a
   7-item bottom bar on mobile. Micro-labels at 8–10px. An 11-column CSS grid for
   the squad table (`.sq-tbl-hdr`, `shell.html:313`). It is dense-desktop UI
   squeezed onto a phone, and the game is played on a phone.
2. **The build only runs where it was written.** `build.py` and `validate.js`
   carry hardcoded `/home/claude/pitch2` and `/mnt/user-data/outputs` paths — six
   occurrences. Nobody else can build the game as it stands.
3. **No CI, and deployment is manual.** There is no `.github/` at all. The 898KB
   `index.html` is committed by hand and served by GitHub Pages via `CNAME`. The
   1,190-check validator exists but nothing forces it to run.
4. **Rendering is `innerHTML` template strings**, same as footy-sim — with the
   extra constraint that the live match viewer is a hand-rolled inline-panel
   system, because `showModal()` inside `#modal-bd` destroys the running match.

None of that is engine work. It's a UI rebuild, a build port, and a deploy
pipeline.

## The four decisions this plan makes

1. **Keep `modules/`, replace `ui/`.** pitch already separates DOM-free game logic
   (`modules/`, 12 files) from rendering (`ui/`, 7 files). That boundary is the
   thing that makes this tractable. `modules/` becomes the domain layer almost
   unchanged; `ui/` is deleted screen by screen and rebuilt in Svelte.
2. **Adopt a real toolchain.** Vite + Svelte 5 + Tailwind v4 + TypeScript,
   replacing `build.py`'s concatenation. `validate.js` survives the transition and
   is only retired once Vitest covers the same ground.
3. **Reconcile the data, don't copy it.** footy-sim's rosters are deeper (3,455
   players vs 2,997) and fresher in some leagues, staler in others, and use a
   different schema. This needs a converter and a per-league audit, not a `cp`.
   See `06-data-reconciliation.md` — it is the one place this plan disagrees with
   the brief.
4. **Move pitch-sim.com to Cloudflare Workers.** GitHub Pages can't do preview
   deploys, and preview URLs on a real phone are the review loop for mobile design
   work.

## Design direction: settled

**Broadcast Kit** — broadcast-graphics vocabulary for football identity, a runtime
club accent for career-mode identity. Drafted across Home, Live match and Squad:

**https://claude.ai/code/artifact/ba8a8511-c76c-44cc-887c-13d8d1388465**

Sources in `design-canvas/`. Two alternates (Matchday Programme, Scout Console)
sit on the canvas's second page with their trade-offs, in case either pulls harder.

## Rough sizing

Each phase ends deployable.

| Phase | What ships | Effort | Status |
|---|---|---|---|
| 0 | pitch, unchanged, live on Workers at pitch-sim.com | ~3 hours | ✅ deployed; domain cutover outstanding |
| 1 | Portable build + CI running the 1180 checks | ~1 day | ✅ done |
| 2 | Vite/Svelte/Tailwind toolchain; `modules/` as real ES modules | ~2 days | not started |
| 3 | App shell, bottom nav, design tokens, first screen | ~2 days | not started |
| 4 | Screen-by-screen rebuild (7 screens) | ~1 day each | not started |
| 5 | Live match viewer | ~2 days | not started |
| 6 | Data reconciliation with footy-sim | ~2 days | not started |
| 7 | PWA, perf budget, polish | ~1 day | not started |
| 8 | Optional: cloud saves, shareable careers | open-ended | not started |

"Day" = a focused working session. Status column is the one thing in this
table that will go stale fastest — update it in the same commit that finishes
or starts a phase, per `memory-hygiene`.

## Data: decided

footy-sim's rosters win for every overlapping league, unconditionally — no
per-league audit gate. `06-data-reconciliation.md` has the evidence and, more
importantly, a new pipeline requirement that makes the "which one is fresher"
question stop mattering going forward: **player departures**. A CSV snapshot
always drifts (Jorginho has already moved to a league neither dataset tracks);
the fix isn't a one-time cleanup, it's teaching the generator to notice when a
player disappears from every tracked league's CSV and drop them from the pool,
same way it already tracks players moving club. That lands in Phase 6.
