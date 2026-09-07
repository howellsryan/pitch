# Verification and deployment contract

Read before verification, commits or PR handoff. Paths are repository-relative.

## 3) Build, validation and deployment

Two build paths intentionally coexist:

```bash
npm run dev              # Vite dev server
npm run build            # legacy validation path + Vite app
npm run build:legacy     # src/build.py -> legacy bundle + validate_p0 bridge
npm run build:app        # Vite -> dist/
npm run test             # Vitest + UI emoji audit
npm run check:accents    # all 186 clubs
npm run lint             # ESLint + eslint-plugin-svelte
```

**There is no end-to-end/browser test suite, and one must not be added.** The
Playwright suite, its config and its opt-in workflow were deliberately deleted:
they cost more to run and maintain than they caught. Do not add `@playwright/test`,
a `test:e2e` script, a `tests/` spec directory, Puppeteer, Cypress, `vitest
--browser`, or a CI job that drives a real browser. If a change needs proof it
works in the browser, open the app and look at it — see the definition of done below.

- Vite `dist/` is the deployed artifact.
- `src/build.py` remains because the legacy validator asserts against concatenated raw source. P0+ route that gate through `src/validate_p0.py`, which permits only an explicit allow-list of superseded source-shape assertions and requires deterministic replacement contracts. Do not interpret the legacy validator's allow-listed failure count as a green-by-itself result; the bridge must pass.
- CI (`.github/workflows/deploy.yml`) **does not deploy**. Its per-commit gate runs both builds, lint, Vitest and the accent audit — that is the whole gate; there is no browser job to add to it. Cloudflare's Git integration owns production and branch previews.
- Do not re-add a GitHub Actions deploy step; two deploy systems racing the same Worker is a known failure mode.
- Cloudflare build command is `npm run build:app`; `wrangler.jsonc` serves `./dist`.


## 7) Definition of done for roadmap phases

The baselines in [delivery-baselines.md](delivery-baselines.md) are a historical record of what each phase actually
shipped against. Where one cites a Playwright/browser count, that is history:
the suite has since been deleted and those bullets are retired, not targets to
reproduce. Every other bullet still stands.

A phase is not complete until, where applicable:

- old saves migrate or fail safely with an actionable recovery path;
- authoritative Quick Sim/Broadcast outcome boundaries are preserved;
- deterministic regression tests cover new domain rules — as Vitest unit/contract tests over `src/modules/` and `src/game/`, never as browser specs;
- the affected 390px mobile journey is exercised by hand in a running app, with wider responsive checks when the surface changed;
- rendered screenshots are inspected for new/restyled UI;
- storage/performance budgets have not materially regressed (reasoned about and, for simulation/persistence work, measured by hand — there is no automated benchmark any more);
- this guide and the roadmap status are current;
- the PR explains shipped scope, migration impact, deferred scope and the next milestone;
- CI and the Cloudflare branch preview are green on the final pushed SHA.


## 8) End-of-session handoff

Whenever code is committed/pushed:

- wait for CI on the final SHA before reporting completion;
- confirm the Cloudflare branch preview corresponds to the final SHA where a preview is expected;
- visually inspect changed UI rather than inferring it from source;
- report: what changed, verification/test counts, PR link, direct live preview link, next milestone, and any check that could not be completed.

