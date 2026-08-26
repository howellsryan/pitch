---
name: verification-before-completion
description: Use before claiming any work is done, fixed, working, or passing - and before every commit, PR, or handoff back to the user. Requires fresh evidence from an actual run, not inference from the code reading correctly. Do not use as a substitute for the delivery-loop Verify step; this is the standard that step has to meet.
---

# verification-before-completion: evidence before claims

## The iron law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

Before writing "works", "fixed", "passing", "done", or any paraphrase of them:

1. **Identify** the command or observation that would prove it.
2. **Run it** — fully, now, on the current state of the code.
3. **Read** the whole output and the exit code.
4. **Confirm** the output actually supports the specific claim you're making.
5. **Then** claim it, and say what you ran.

A claim you inferred rather than observed is a guess with a confident tone.

## What a green build does and does not prove

`npm run build` runs the bundle, then `src/validate.js`'s **1078 checks**, and
CI adds ESLint, the 186-club accent contrast check, Vitest over `src/game/`,
and a Playwright smoke test at 390×844.

That is a real safety net and a narrow one. **430 of the validator's assertions
are string matching against the bundle's raw source text.** It can confirm a
function exists and is named what you think. It cannot see a screen. Green
means "no known regression in the areas covered", never "the thing I built
works."

| Claim | What actually proves it |
|---|---|
| "The validator passes" | `npm run validate` just now, and you read `RESULT: N passed, 0 failed` |
| "The pure logic is correct" | `npm run test` — a Vitest case that failed before your fix and passes now |
| "The screen renders correctly" | A real screenshot at 390×844, looked at |
| "The career still plays" | `npm run test:e2e`, or a gameweek played by hand in the browser |
| "No console errors" | The console, open, after driving the feature |
| "The build deploys" | `npm run build:app` succeeded and `dist/` has the expected output |

## The screenshot rule

**A token, background, border, or color is not verified until you have seen it
render opaque in a real screenshot.** Do not infer it from the component's own
CSS reading correctly.

This rule exists because League and Home shipped live with transparent card
backgrounds. Their `<style>` blocks were correct. `--color-surface` was absent
from `:root` entirely, so `background: var(--color-surface)` silently resolved
to `transparent`, and the cards just read as "slightly flat" — easy to miss,
and missed. It surfaced only when Squad's bottom sheet rendered fully
see-through and a `getComputedStyle()` check showed the token empty.

Applies to every new or restyled screen before you call it done.

## Verifying a fix specifically

A fix is verified when you have watched the **transition**, not just the end
state:

1. Reproduce the failure and see it fail.
2. Apply the fix.
3. See it pass.

Step 1 is the one that gets skipped, and skipping it is how you ship a change
that fixed nothing because the bug was somewhere else. For `src/game/`, encode
this as a Vitest case — the substitution and formation-change rules moved out
of `watchmatch.js` specifically so this is possible.

## Red flags in your own writing

Each of these means stop and go run something:

- "should work now", "should be fixed", "probably fine"
- "I've made the change, it looks correct"
- "the logic is right so it will render"
- "this matches the pattern in the other screen"
- Any completion claim where you cannot name the command you ran
- Reporting a result from a run made *before* your most recent edit

## Reporting honestly

State both halves — what you verified, and what you did not:

```
Verified: npm run build (1078 passed, 0 failed); Squad screen at 390x844,
screenshot checked, bottom sheet renders opaque.
Not verified: Transfers virtualization under a full 3,000-row list; European
matchday path.
```

If a check failed, say so with the output. If you skipped a step, say which.
An honest "I couldn't verify X" is worth more than a confident claim that
turns out to be wrong on the next session.
