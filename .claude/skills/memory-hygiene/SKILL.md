---
name: memory-hygiene
description: Use when writing to or reading from persistent agent memory - CLAUDE.md, BRIEFING.md, .claude/skills/*, or the rebuild plan in docs/plan/ - meant for future sessions. Governs WHAT deserves persisting, HOW to write it so it survives time, and the recall rule - verify remembered facts against live state before acting on them.
---

# memory-hygiene: memory is a claim about the past, not a fact about the present

## Where memory actually lives in this repo — read this part first

Four tiers, each with a different job:

- **`CLAUDE.md`** — auto-loaded every session. Orientation: what this repo is,
  where it stands in the rebuild, current-vs-target architecture, the
  invariants worth restating rather than only linking to. Kept terse
  deliberately — it's cost on every session.
- **`BRIEFING.md`** — deeper gameplay/architecture reference (the event queue,
  cup structure, watch-match constraints). Not auto-loaded the way `CLAUDE.md`
  is; read it when a task actually needs that depth, and `CLAUDE.md` points at
  it for exactly that reason.
- **`.claude/skills/*`** — repeatable workflows, loaded on demand from their
  own descriptions.
- **`docs/plan/*.md`** — the rebuild plan itself: tech stack decision, design
  direction, the 8-phase migration order, the data-reconciliation spec. This
  used to live in a different repository (`howellsryan/footy-sim`, from early
  exploration before `pitch` was identified as the actual base) — it moved
  here once that was settled, and this copy is now authoritative. If you find
  yourself citing the footy-sim copy, you're looking at a stale fork of this
  one; use this one and update `footy-sim`'s if it matters.

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

- **Right tier.** Every-session relevance → `CLAUDE.md`, kept terse — it's
  cost on every session. Deeper gameplay/architecture detail → `BRIEFING.md`.
  A repeatable workflow → a skill, here in `.claude/skills/`. Cross-cutting
  rebuild decisions → `docs/plan/`, right here in this repo.
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
4. **Say which you're using**: "per `CLAUDE.md`" vs "verified just now" vs
   "per the rebuild plan (`docs/plan/`)."

## The maintenance habit

A memory proves wrong: fix it immediately, don't route around it. This repo
has no dedicated maintainer session sweeping stale docs — that job falls to
whoever next touches the area.
