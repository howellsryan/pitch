# 05 — Skills to vendor, and how the workflow changes

## What to take from 3site

`howellsryan/3site` vendors five skills. Three transfer; two don't.

| Skill | Source | Take it? | Why |
|---|---|---|---|
| **`frontend-design`** | Anthropic | **Yes** | The anti-default design process. Read before any new screen |
| **`web-design-guidelines`** | Vercel Labs | **Yes** | Accessibility/UX checklist, run against every finished screen |
| **`ui-ux-pro-max`** | nextlevelbuilder | **Yes, `--domain ux` only** | Excellent UX/touch/contrast data; generic style picks — see doc 02 |
| `react-best-practices` | Vercel Labs | **No** | React-only |
| `composition-patterns` | Vercel Labs | **No** | Same |

```bash
git clone --depth 1 https://github.com/howellsryan/3site /tmp/3site
cp -r /tmp/3site/.claude/skills/frontend-design       .claude/skills/
cp -r /tmp/3site/.claude/skills/web-design-guidelines .claude/skills/
cp -r /tmp/3site/.claude/skills/ui-ux-pro-max         .claude/skills/
```

`frontend-design` ships an Anthropic `LICENSE.txt` that must travel with it (the
`cp -r` handles this). The Vercel Labs and nextlevelbuilder skills carried no
license file in the 3site checkout — attribute them as 3site does in its own
`CLAUDE.md`, and check `vercel-labs/agent-skills` upstream before publishing pitch
more widely. pitch is a **public** repo, so this matters more than it did.

## What to take from footy-sim

**✅ Done** — the four skills below are ported into `pitch`'s `.claude/skills/`,
retargeted at this repo's real files (`howellsryan/pitch#1`). A `CLAUDE.md` was
added alongside them (not originally scoped in this doc, but a direct
consequence of doing this properly — see that PR and this repo's own
`memory-hygiene` skill for why). This section is kept as the record of the
reasoning, not as an outstanding TODO.

footy-sim's four workflow skills are worth carrying into pitch, which has none:

| Skill | Why it applies to pitch |
|---|---|
| **`delivery-loop`** | Triage + Plan/Build/Self-Review/Verify. Retarget Verify at `npm run dev` and `validate.js` |
| **`plan-gate`** | Retarget the triggers — see below |
| **`scope-fence`** | More important in pitch, not less: 22 modules and a live site |
| **`memory-hygiene`** | pitch has `BRIEFING.md` to keep honest, which goes stale faster than a CLAUDE.md |

**`plan-gate`'s trigger list needs rewriting entirely.** Its current triggers name
footy-sim's files. pitch's equivalents:

- **The IndexedDB schema** (`modules/db.js`, `DB_VERSION = 3`, 8 stores, no
  migration path) — the highest-stakes surface in the repo
- **The event queue** (`save.pendingEvents`, `modules/gameweek.js`) — one pop per
  press; the gameweek advances only when it empties
- **Simulation math** (`modules/matchEngine.js`, `standings.js`, `promotion.js`)
- **The module load order** — `build.py`'s `MODULES` list, later
  `src/game/`'s import graph
- **The data pipeline** (`csv_to_league.py`, later `tools/csv-to-league.mjs`)
- **The attribute mapping** in the footy-sim reconciliation (doc 06) — it changes
  every player's rating, so it changes every match

## New skills to write

**`deploy`** — preflight (`npm run check && node validate.js && npm test &&
npm run build && npx size-limit`), then `wrangler deploy` for main or
`wrangler versions upload` for a preview. Where the secrets live, how to roll back
a bad version. pitch-sim.com is a live site with real visitors; a rollback
procedure that exists only in someone's head is not a rollback procedure.

**`mobile-verify`** — run `npm run dev`, open the app at 390×844, screenshot each
changed screen and check doc 02's quality floor. This is done by hand: the
repository has no Playwright/E2E suite and one must not be added, so "verify the
screen" means looking at a real rendered screenshot, not automating a browser.

**`design-system`** — a thin pointer at `docs/design-system.md` so every UI session
starts from the real tokens instead of re-inventing a blue across nine screens.

**`validate`** — a wrapper that knows how to run the 1,190 checks at whatever stage
the migration is in. The invocation changes three times between Phase 1 and Phase
4 (bundle path, then IIFE target, then Vitest); a skill absorbs that so nobody
skips it because they can't remember the command.

## Documentation: `BRIEFING.md` is the file that matters

pitch's `BRIEFING.md` (25KB) is a genuinely good agent brief — invariants,
anti-patterns, the event queue, the cup structure, the watch-match architecture,
explicit ❌ markers for known failure modes. It is better than either repo's
`CLAUDE.md`.

It is also **the file this migration invalidates fastest**. Its Commands table
points at `/home/claude/pitch2`; its Source Map describes `build.py` and `ui/`.

Two rules:
- **Update it in the same commit as the change that invalidates it.** That's what
  `memory-hygiene` is for.
- **Keep the invariants and anti-patterns; replace the paths.** The ❌ list is
  hard-won knowledge — the `showModal()`-inside-a-match trap, the stale
  `index.html` shadowing the build output, `processCupRounds()`. Some become moot
  as the architecture changes; note *why* rather than deleting silently, or
  someone reintroduces them.

| Phase | What goes stale in `BRIEFING.md` | Fix |
|---|---|---|
| 1 | Commands table, build/output paths | Repo-relative paths |
| 2 | Source Map, "no framework", build order | Vite, `src/game/`, the import graph |
| 3 | — | Add the design-system pointer and the five-tab IA |
| 4 | The `ui/` half of the Source Map, the watch-match section | Shrink per screen; note why the inline-panel workaround is gone |
| 5 | Watch Match architecture | Rewrite for the route-based viewer; keep the sub rules |
| 6 | Data pipeline, league counts | One Node converter, 9 leagues |
| 7 | Save/Load section | PWA caching, and that a SW update must never touch IndexedDB |

Also fold footy-sim's `docs/ARCHITECTURE.md` in or delete it — it describes a
refactor of a codebase that is being retired. Don't carry two architecture docs.

## Session shape

For a typical "rebuild screen X":

1. `delivery-loop` triage → `stepped` for any screen.
2. Read `docs/design-system.md` and the legacy renderer you're replacing.
3. `frontend-design` if the screen needs new visual thinking.
4. Build.
5. `web-design-guidelines` + `ui-ux-pro-max --domain ux` as a review pass.
6. `mobile-verify` → inspect the running app at 390×844.
7. `validate` → 0 failures.
8. `scope-fence` on the diff: is anything in here not the screen?
9. Commit, push, open the preview URL on your phone.

Steps 5–7 are the ones that get skipped under time pressure, and they're the ones
separating this from another round of "looks fine on my laptop".
