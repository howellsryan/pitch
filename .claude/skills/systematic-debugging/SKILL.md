---
name: systematic-debugging
description: Use when any technical issue needs diagnosis - a failing validator check, a bug that only appears in the browser, a screen that renders wrong, a save that will not load, a build that breaks. Forces root cause before any fix, and stops the guess-and-check loop after three failed attempts. Do not use when implementing a feature that is not yet broken.
---

# systematic-debugging: root cause before fix, always

## The iron law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

This repo has already paid for the alternative twice, and both cases are worth
remembering because neither was caught by CI:

- **`@theme` needed two separate fixes, not one.** Phase 2 shipped
  `src/app.css` without `@import "tailwindcss";`, so Vite never processed it.
  Fixing that looked like the answer. It wasn't — plain `@theme { … }` only
  emits a custom property for a token Tailwind's scanner sees used by a real
  utility class, and every screen consumes these as raw `var(--color-surface)`
  inside a component `<style>` block. League and Home shipped **live** with
  transparent card backgrounds before anyone noticed. The first fix addressed a
  real problem that was not the whole root cause, which is exactly what a
  symptom fix looks like from the inside.
- **`DataCloneError` on a watched match.** The symptom was `putFixture`
  throwing. The cause was three assignments up: Svelte 5 deep-proxies anything
  given to plain `$state()`, and IndexedDB's structured clone cannot serialize
  a Proxy. Fixing at the `putFixture` call site would have produced a
  workaround that broke again on the next store write.

## The four phases

Complete each before starting the next.

### Phase 1 — Root cause investigation

1. **Read the whole error.** Stack trace, line numbers, the actual thrown type.
   `DataCloneError` names its own cause if you read it as a clue about
   *serialization*, not about the function that threw.
2. **Reproduce consistently.** Can you trigger it every time? If not, that is
   data, not an excuse — see the flake rule below.
3. **Check recent changes.** `git diff`, recent commits, which migration phase
   last touched this file. This repo is mid-rebuild; the answer is often "this
   screen became a Svelte island last week and kept a legacy caller."
4. **Instrument the boundaries before proposing a fix.** When a value crosses
   a boundary — `src/modules/` → component, component → IndexedDB, CSV →
   `tools/csv-to-league.mjs` → generated `.js`, Vite build → served `dist/` —
   log what enters and what exits each side. One run that shows *which* hop
   corrupts the value beats three speculative fixes.
5. **Trace backwards to the source.** Where did the bad value originate? What
   called that with it? Fix where it enters the system, not where it surfaces.

### Phase 2 — Pattern analysis

Find a working example in the same codebase and diff it against the broken one.
Every screen's `load()` already has `if (!save || save._deleted) return;` —
MatchScreen's missing guard was visible the moment it was compared against a
sibling. List every difference before deciding which one matters; "that can't
be it" is how the `$state.raw` distinction gets skipped.

### Phase 3 — Hypothesis

State it in one sentence: "I think X is the root cause because Y." Test with
the smallest possible change, one variable at a time. If it doesn't work, form
a **new** hypothesis — do not stack a second fix on top of the first.

### Phase 4 — Implementation

1. **Get a failing check first.** For `src/game/` and anything else pure and
   DOM-free, that means a real Vitest case in `*.test.js` — write it, watch it
   fail, then fix. This is where the substitution and formation-change rules
   already live precisely so they are testable. For UI, the equivalent is a
   reproduction you can re-run by hand: the exact screen, the exact tap
   sequence.
2. **One fix.** No "while I'm here" (see `scope-fence`).
3. **Verify with evidence** — `verification-before-completion`, not "should
   work now."

## The three-fix circuit breaker

Count your attempts. This is the rule most worth keeping:

- **Fewer than 3 failed fixes** → return to Phase 1 with what you just learned.
- **3 or more** → **stop. Do not attempt fix #4.** Three failures where each
  one reveals a new problem somewhere else is not a run of bad hypotheses, it
  is a wrong architecture. Say so, and put the architectural question to the
  user before editing anything else.

The signature: each fix works locally and breaks something adjacent; the fixes
start requiring "just a small refactor" of something you weren't asked to
touch.

## The flake rule

`validate.js`'s "Home win rate >20% over 30 games" check is genuinely
stochastic and fails roughly **1 run in 8, on unmodified `main`**. That is the
one sanctioned "not my change" verdict in this repo.

Everything else claiming to be a flake is a root cause you have not found yet.
Before calling anything flaky:

1. Re-run **once**. Not three times until it goes green — that is selecting for
   the answer you want.
2. Confirm it fails on `main` too, or that it died before any test body ran.
3. Otherwise it is real. Seeding the RNG to make a stochastic check
   deterministic is simulation math and needs `plan-gate` first.

## Red flags — stop and return to Phase 1

- "Quick fix now, investigate later"
- "Just try changing X and see"
- Proposing a fix before tracing where the bad value came from
- "It's probably the …" (probably is not a root cause)
- Changing several things at once so you can't tell what worked
- "One more attempt" when you have already tried two

## Common rationalizations

| Excuse | Reality |
|---|---|
| "It's a simple bug, skip the process" | Simple bugs have root causes too, and the process is fast for them. |
| "Just try this one thing first" | The first fix sets the pattern. `@theme` is the case study. |
| "CI is green so it's fixed" | CI covers 1078 assertions against bundle source text. It has never once checked whether a screen renders. |
| "It only happens in the browser, so I can't test it" | Then the browser IS the test. Open it and drive the screen. |
| "Probably a flake" | One check in this repo is flaky. Yours is probably not it. |
| "I'll write the test after I confirm the fix" | For `src/game/` that inverts the only real safety net you have. |

## When investigation genuinely finds nothing

Document what you ruled out, implement appropriate handling (a guard, a clearer
error), and say plainly that the root cause is unknown. Do not describe it as
fixed.
