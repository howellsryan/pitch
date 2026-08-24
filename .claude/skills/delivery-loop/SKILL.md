---
name: delivery-loop
description: Use at the start of any implementation task, before the first edit - triages the work (checklist vs stepped) and runs a lightweight Plan -> Build -> Self-Review -> Verify loop inside this one session. No subagents for delivery. Do not use for pure questions or research.
---

# delivery-loop: one session, four mindsets

CI runs `npm run build` (which bundles and then runs `src/validate.js`'s 1180
checks) on every push and PR — a real safety net, but a narrow one. It doesn't
know whether a screen looks right, whether a new UI interaction works, or
whether a plan-gate-worthy change is actually sound. The discipline below still
has to live in how the session runs, not just in the pipeline. Roles below are
mindsets you switch between, not agents you spawn.

## Triage first

State the tier and a one-line reason, then act:

- **`delivery-loop: checklist`** — a single file/module with an obvious way to
  check it (a roster/team-data CSV edit run through the existing pipeline, a
  `shell.html` CSS/copy tweak, a self-contained one-function fix).
- **`delivery-loop: stepped`** — everything else: new mechanics, anything
  crossing the `src/modules/`/`src/ui/` boundary (or their post-migration
  equivalents), anything touching the save schema or simulation math, changes
  to the module load order or the build/deploy pipeline. Run the loop below.

When in doubt, start checklist and escalate the moment the task surprises you.

## The loop (stepped tier)

1. **Plan** — read the relevant files first; `BRIEFING.md` orients but doesn't
   substitute for reading the code, especially mid-migration. State: goal,
   which files/modules are touched, what could break, how you'll check it
   worked. For anything touching module ordering, name the exact slot in
   `src/build.py`'s `MODULES` list you're relying on (or the import you're
   adding, post-migration).
2. **Build** — make the change. Respect the existing pattern in the file
   you're editing rather than introducing a new one — `modules/` stays DOM-free,
   rendering stays in `ui/` until its Svelte migration phase.
3. **Self-Review** — read your own diff cold, as if reviewing someone else's
   PR. Look specifically for: a function name that collides with an existing
   one without an entry in `build.py`'s `RENAMES`, a save-schema change not
   mirrored everywhere `db.js` reads/writes that store, a module added in the
   wrong load-order slot, an event-queue change that could let the gameweek
   advance with `pendingEvents` non-empty.
4. **Verify** — run `npm run build` (bundles, then runs the 1180 checks; fails
   loudly on the first problem) before anything else. That's necessary, not
   sufficient: open the built `index.html` in a browser and exercise the
   changed feature by hand — play a gameweek, open the affected screen or
   modal, watch a match if match logic changed, check the console for errors.
   Say explicitly what you checked and what you didn't.

   (This step will change shape as the rebuild progresses — `npm run dev` once
   Vite lands in Phase 2, then a proper mobile-viewport check once there's a
   real UI to screenshot in Phase 3+. Update this skill in the same change
   that makes the current wording wrong.)

Commit once Verify passes.
