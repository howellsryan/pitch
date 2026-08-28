---
name: memory-hygiene
description: Use when writing to or reading from persistent agent memory - CLAUDE.md, .claude/skills/*, or the rebuild plan in docs/plan/ - meant for future sessions. Governs WHAT deserves persisting, HOW to write it so it survives time, and the recall rule - verify remembered facts against live state before acting on them.
---

# memory-hygiene: memory is a claim about the past, not a fact about the present

## Where memory actually lives in this repo — read this part first

Three tiers, each with a different job:

- **`CLAUDE.md`** — auto-loaded every session. Orientation: what this repo is,
  where it stands in the rebuild, current-vs-target architecture, the
  invariants worth restating rather than only linking to. Kept terse
  deliberately — it's cost on every session. It is also now the *only*
  gameplay/architecture reference (event queue, cup structure, match-engine
  invariants) — a separate `BRIEFING.md` used to carry that depth but drifted
  out of sync with the actual code and was removed rather than fixed twice;
  don't recreate a second doc for "the deep stuff," extend the relevant
  CLAUDE.md section instead.
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

- **Right tier.** Every-session relevance, including deeper gameplay/
  architecture detail → `CLAUDE.md`, kept honest but terse — it's cost on
  every session. A repeatable workflow → a skill, here in `.claude/skills/`.
  Cross-cutting rebuild decisions → `docs/plan/`, right here in this repo.
- **Prune when you add.** If a new note supersedes an existing `CLAUDE.md`
  line, delete the old line in the same change — don't let the file drift
  into a changelog of its own history.
- **Write the trigger with the fact**: "when touching the save schema,
  remember X" — not just X.

## Writing a skill: the description is the whole contract

A skill's body is worthless if the description never fires, and actively
harmful if the description fires *instead* of the body. Rules:

- **Start with "Use when…"** and describe **triggering conditions only** — the
  situation, the symptom, the file being touched.
- **Never summarize the workflow.** A description that explains what the skill
  does gives a future session a shortcut it will take, and the body becomes
  documentation it skips. "Use when a screen renders wrong" fires the skill.
  "Runs a four-phase root-cause process" invites reading the summary and moving
  on.
- **State the non-trigger too.** Every description ends with a "Do not use
  for …" clause. Without it the skill fires on adjacent work and gets ignored
  by habit.
- **Keep it under ~500 characters.** Descriptions are always-visible cost,
  once per skill, every session.
- **Third person, concrete symptoms.** Name the error, the file, the screen —
  the words a future session will actually be thinking.

Audit an existing description by asking: could a session read *only* this and
believe it now knows what to do? If yes, it is summarizing the workflow. Cut it
back to the trigger.

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
