---
name: delivery-loop
description: Use at the start of any implementation task, before the first edit - triages the work (spike/checklist/stepped) and runs a gated Plan -> optional Architect -> Build -> Code Review -> Verify loop inside this one session. Code Review and Verify are both mandatory gates. No subagents for delivery. Do not use for pure questions or research, and do not re-triage mid-task once the loop has started.
---

# delivery-loop: one session, gated steps

CI runs `npm run build` (bundles, then `src/validate.js`'s checks) on every
push and PR — a real safety net, but a narrow one. It can't tell whether a
screen looks right, whether a new UI interaction actually works, or whether
a plan-gate-worthy change is sound. The steps below carry that judgment.
They're mindsets you move through in this one session, never separate
agents you spawn — a read-only `Explore` fan-out for research is the one
sanctioned exception.

## Triage first

State the tier and a one-line reason, then act. **Don't re-triage mid-task
once the loop has started** — if reality contradicts the tier you picked,
stop, say so out loud, and restart from Plan rather than quietly downgrading
to skip a step you no longer feel like doing.

- **`delivery-loop: spike`** — the ask is a *question*, not a change: is this
  feasible, what would it cost, does the engine already do this, why is this
  screen slow. **The deliverable is an answer, not code.** Investigate as
  cheaply as possible, report what you found, and stop. Anything you wrote to
  get the answer is throwaway — say so, and do not let it become the
  implementation by default. If the answer turns out to be "yes, and here's
  how", that's a new task: re-triage it.
- **`delivery-loop: checklist`** — a single file/module with an obvious way to
  check it (a roster/team-data CSV edit run through the existing pipeline, a
  `shell.html`/Svelte CSS or copy tweak, a self-contained one-function fix).
  Skip the loop below; apply the change and hold it to
  `verification-before-completion` directly.
- **`delivery-loop: stepped`** — everything else: new mechanics, anything
  crossing the `src/modules/`/`src/ui/` boundary (or their post-migration
  equivalents), anything touching the save schema or simulation math, changes
  to the module load order or the build/deploy pipeline. Run the loop below.

When in doubt, start checklist and escalate the moment the task surprises you.
A spike that starts producing code you want to keep has stopped being a spike
— stop and re-triage rather than quietly shipping exploration.

## The loop (stepped tier)

Announce each step on one line before starting it, and close it with a short
handoff note (what you did, what's next) before moving to the next one —
that's what makes the gate real instead of a formality nobody checks.

1. **Plan** — read the relevant files first; reading the code beats
   remembering it, especially mid-migration. State: goal, which files/modules
   are touched, what could break, and the concrete success criteria Verify
   will check against. For anything touching module ordering, name the exact
   slot in `src/build.py`'s `MODULES` list you're relying on (or the import
   you're adding, post-migration). Anything on `plan-gate`'s list — the
   IndexedDB schema, the event queue, simulation math, the module load order,
   the CSV pipeline, the footy-sim attribute mapping — uses that skill's plan
   format for this step, not a lighter one.
2. **Architect** (optional) — for a design that's genuinely novel or spans
   several systems (a new save-schema shape, a mechanic touching three-plus
   modules), sketch the shape — data flow, new fields, which module owns
   what — *before* writing code, where a wrong turn is still cheap to undo.
   Skip this for anything with an obvious shape; most tasks don't need it.
3. **Build** — make the change. Respect the existing pattern in the file
   you're editing rather than introducing a new one — `modules/` stays
   DOM-free, rendering stays in Svelte components (or `src/ui/` for whatever
   hasn't migrated yet).
4. **Code Review** (always, after Build, before Verify) — invoke the
   `code-review` skill against the working diff. This step judges the diff
   *itself* — correctness bugs, reuse/simplification/efficiency issues —
   independent of this task's own success criteria; that's Verify's job, not
   this one. Run it at `medium` effort; raise to `high` for anything on
   `plan-gate`'s list. Verdict is PASS or FAIL, findings ranked by severity
   with file:line and the concrete failure scenario for each.
   **FAIL → back to Build.** Address every finding — fix it, or state why
   not (`scope-fence` still applies: don't fix unrelated issues surfaced
   along the way) — then Code Review again. **Loop until PASS before Verify
   starts.**
5. **Verify** (always) — adversarial verification against Plan's stated
   success criteria, not a re-read of the diff. Run `npm run build` (bundles,
   then the validator; fails loudly on the first problem), `npm run test`
   (Vitest), and `npm run lint` before anything else — necessary, not
   sufficient. **A new feature adds its own checks in the same change** — new
   `validate.js` assertions, or a `src/game/*.test.js` file — this is
   CLAUDE.md's standing policy, not an optional nicety, and Verify is where it
   gets enforced. Then open the app and exercise the changed feature by hand —
   play a gameweek, open the affected screen or sheet, watch a match if match
   logic changed, check the console for errors. Say explicitly what you
   checked and what you didn't.

   `verification-before-completion` is the evidence standard this step has to
   meet — fresh evidence from an actual run, never inference from the code
   reading correctly. It also carries the screenshot rule for anything that
   renders.

Commit only once Verify passes.

Related: `plan-gate` (when a written plan is mandatory before Plan even
starts), `scope-fence` (staying inside the boundary through Build and Code
Review alike), `systematic-debugging` (when the task is a broken thing rather
than a new one), `verification-before-completion` (the evidence bar Verify
has to meet), `code-review` (the skill the Code Review step invokes).
