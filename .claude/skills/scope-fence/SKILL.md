---
name: scope-fence
description: Use on every task where you will modify existing code. Fences your changes to exactly what was asked. Adjacent problems get FLAGGED, never silently fixed. Keeps diffs minimal and reviewable in a codebase mid-migration off a hand-copied build. Do not use it to refuse legitimate follow-through the task actually requires.
---

# scope-fence: do what was asked, flag what you found

CI runs `src/validate.js`'s 1180 checks on every push and PR — but that catches
behavioural regressions in the areas it tests, not everything. Most UI,
most one-off logic paths, and the whole rebuild-in-progress are outside its
reach. The diff is still the primary review for everything the validator
doesn't cover, and a tight, single-purpose diff is reviewable by eye where a
drive-by refactor bundled in with it is not.

## The fence

1. **Restate the task as a boundary.** One sentence before editing: "The task
   is X. The fence is: files/behaviour needed for X."
2. **Inside the fence: full effort.** Do X completely, including its genuine
   requirements (updating `BRIEFING.md` if a module's responsibilities or the
   build/deploy pipeline change, keeping `RENAMES` in `src/build.py` in sync if
   you rename something the bundler's regex-based module stripping depends on).
3. **Outside the fence: eyes open, hands off.** This repo is mid-migration —
   `src/modules/` and `src/ui/` still concatenate into one file via
   `src/build.py`; the plan (`docs/plan/`) has that changing to real ES
   modules and a Svelte UI over several phases. You will see things worth
   cleaning up along the way. Don't, unless it's the phase you're actually
   working. Record them instead.
4. **Flag, do not fix.** If you noticed something, end with:

```
Noticed, NOT touched: <issue> - <why it matters> - <suggested follow-up>
```

No flags → no report. Don't list what you changed — the diff already shows it.

## Decision rules for the gray zone

- Would the requested change BREAK without this extra edit? In scope.
- Merely "while I'm in here"? Out. Flag it.
- No known list of pre-existing scratch files or dead code exists in this repo
  yet. If you find some, that's exactly the kind of thing to flag rather than
  quietly delete — and worth adding to this skill once a real list exists.
