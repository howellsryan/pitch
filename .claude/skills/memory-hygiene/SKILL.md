---
name: memory-hygiene
description: Use when writing to or reading from persistent agent memory - BRIEFING.md, .claude/skills/*, or the rebuild plan in howellsryan/footy-sim's docs/plan/ - meant for future sessions. Governs WHAT deserves persisting, HOW to write it so it survives time, and the recall rule - verify remembered facts against live state before acting on them.
---

# memory-hygiene: memory is a claim about the past, not a fact about the present

## Where memory actually lives in this repo — read this part first

This repo has no `CLAUDE.md`. Its long-standing equivalent is `BRIEFING.md` —
"paste as first message in every new session" — but that instruction predates
Claude Code's own memory conventions, and **Claude Code does not auto-load
`BRIEFING.md` the way it auto-loads a `CLAUDE.md`.** Skills under
`.claude/skills/` load on demand based on their own descriptions regardless,
but nothing currently tells a fresh session to go read `BRIEFING.md`, or states
repo policy like "run `plan-gate` before touching the save schema" the way a
`CLAUDE.md` would.

That's a real gap, not a design choice — flagged per `scope-fence` rather than
fixed here. If you're the one who closes it, do it by adding a short
`CLAUDE.md` that orients a fresh session and points at `BRIEFING.md` for
detail, matching the pattern in `howellsryan/footy-sim`'s own `CLAUDE.md` —
and delete this paragraph once it's no longer true.

**A second, unusual wrinkle**: the rebuild plan this repo is executing
(`docs/plan/00-overview.md` onward) lives in a *different* repository,
`howellsryan/footy-sim`, not in this one. Reading only what's in `pitch` will
miss it. Say which repo a plan reference is in when you cite one.

## Writing: what deserves persistence

Persist what a future session cannot rederive from reading the code:

- **Decisions and their WHY** — e.g. why `index.html` is a gitignored build
  artifact now instead of committed, why the rebuild keeps `src/modules/`
  and replaces only `src/ui/`.
- **Corrections received from the user** — persist the principle, not just the
  one-off fix.
- **Non-obvious constraints** — e.g. why `src/build.py`'s `MODULES` order
  matters (implicit globals, no real imports yet), why the IndexedDB schema
  has no migration path.
- **User preferences** — how they like scope handled, what they care about
  (see `scope-fence`).

Do NOT persist what the code already shows plainly (a function's own logic, a
formula you can just read) — that's bloat that goes stale the moment the code
changes.

## Writing: how

- **Right tier.** Every-session relevance → `BRIEFING.md` (or a future
  `CLAUDE.md`, kept terse — it's cost on every session). A repeatable
  workflow → a skill, here in `.claude/skills/`. Cross-cutting rebuild
  decisions → `howellsryan/footy-sim`'s `docs/plan/`, not this repo.
- **Prune when you add.** If a new note supersedes a `BRIEFING.md` line, delete
  the old line in the same change — `BRIEFING.md` already carries a warning
  against letting itself drift into a changelog.
- **Write the trigger with the fact**: "when touching the save schema,
  remember X" — not just X.

## Recall: the verification rule

1. **Grade the staleness risk.** Decisions age slowly; file locations, module
   boundaries, and "which phase of the rebuild is this" age fast in a repo
   being migrated piece by piece.
2. **Fast-aging fact + consequential action = verify first** — e.g. don't
   assume a module is still concatenated by `build.py`'s globals-on-`window`
   pattern once the Vite migration starts touching it; grep for it.
3. **Live state wins** on disagreement — and fix the memory in the same
   breath.
4. **Say which you're using**: "per `BRIEFING.md`" vs "verified just now" vs
   "per the footy-sim rebuild plan."

## The maintenance habit

A memory proves wrong: fix it immediately, don't route around it. This repo
has no dedicated maintainer session sweeping stale docs — that job falls to
whoever next touches the area.
