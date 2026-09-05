# Playable Key Moments — Phase 2 MVP delivery evidence

> This file records implementation and verification evidence for Phase 2 only. It does not expand the scope in `docs/plan/playable-key-moments-roadmap.md`.

## Scope fence

Phase 2 delivers a real career **Play Key Moments** option for existing open-play finishing and goalkeeper decisions. It does not add penalties, direct free kicks, passing/crossing interactions, headers/volleys, per-kick shootouts, continuous 11v11 control, a second match engine, a second fixture lifecycle or a new persistence store.

## Shipped architecture

- Career session/versioning, JSON-safe continuation state, pre-finish eligibility/pacing and compact receipts: `src/modules/playableMomentsCareer.js`.
- Compare-and-swap persistence against the existing active `save` row: `src/modules/playableMomentsPersistence.js`.
- Authoritative prepare/persist/commit/acknowledge/ready-to-close coordination: `src/modules/playableMomentsRuntime.js`.
- Career route orchestration remains in `src/lib/ui/MatchScreen.svelte`; Watch Match and Play Key Moments share the existing managed-match adapter and Play still closes through `advanceOneFixtureWithResult()`.
- `src/lib/ui/PlayableMomentOverlay.svelte` is presentation/input only. It submits normalized intent or asks to Simulate the same pending moment; it does not decide the official football result.
- Selection is pre-finish and includes xG, score/minute, pacing, soft cap and scheduled match importance. Match importance comes only from the existing event (competition/round/gameweek), never from the would-have-been shot or result.

## Persistence and recovery invariants

- A pending moment is saved before user input is accepted.
- Session, active career slot, pending revision and moment ID are checked before commit.
- Repeating the identical submission returns the durable stored result; a stale/different second intent is rejected.
- Switching to another career slot invalidates the old playable session rather than allowing a stale tab/session to write into the newly active career.
- A committed result remains a distinct durable state until the result presentation is acknowledged, covering refresh after commit but before reveal.
- Full time is checkpointed before the existing fixture/gameweek closeout runs.
- The playable session is cleared only after the existing match result/world settlement succeeds.
- The session is stored inside the existing save row, so local export/import and cloud save continue to use the established save-envelope owner rather than a Play-Key-Moments-specific persistence path.
- Renderer initialization failure resolves the same already-saved pending moment automatically. Pointer/button interaction is blocked until renderer initialization finishes, preventing user intent from racing the fallback.

## Verified runtime baseline

The final Phase 2 runtime/code head before this evidence-only documentation update was:

`841144d8c6e4d4115ff9e867ad5dd981790aa1ed`

GitHub Actions run `33994034390` and Cloudflare Workers build `d8bf4f4e-1596-4c11-9193-72a132e5ebaa` both evaluated that exact head successfully on 5 September 2026.

### Automated verification

- [x] legacy build / replacement-contract gate — PASS (`1160` legacy assertions passed; only the repository's already-superseded allowlisted assertions remained; deterministic replacement contracts passed)
- [x] Vite production build — PASS (`290` modules transformed; build completed successfully)
- [x] lint — PASS
- [x] full Vitest suite — PASS: **116 test files / 901 tests**
- [x] UI emoji audit — PASS: **44 source files / 0 emoji glyph violations**
- [x] standard match-balance gate — PASS: **3,000 simulations total**
- [x] deep T7 guardrail — PASS: **25 scenarios × 100 paired seeds = 5,000 simulations**, with **0 seed mismatches** in every reported scenario
- [x] club-accent audit — PASS: **181 clubs checked / 0 failures**
- [x] Agent skills lock/check — PASS
- [x] Cloudflare branch preview on the same runtime head — PASS
- [x] persistence/reload/idempotency regression coverage reviewed
- [x] interactive calibration coverage reviewed
- [x] pre-finish match-importance/selection coverage reviewed
- [x] stale-career-slot persistence protection reviewed
- [x] renderer-fallback/input-race protection reviewed
- [ ] rendered mobile/wide Play Key Moments flow inspected on a real browser/device in this implementation session — **not available from this GitHub-only session; requires manual preview review**

### Preview

- Stable branch preview: `https://feat-playable-key-moments-mvp-pitch.rlh.workers.dev`
- Verified runtime version preview: `https://cfc5eb0c-pitch.rlh.workers.dev`
- Cloudflare Version ID: `cfc5eb0c-cfe4-4e90-b962-13ec6e9f5a67`

## Calibration evidence

`src/modules/playableMomentsCalibration.test.js` deterministically covers the Phase 2 interaction contract without replacing the unchanged automatic match-balance gates:

- poor → average → strong → near-perfect attacking input progressively improves execution quality;
- player shooting ability remains material for identical high-quality user input;
- defensive pressure worsens placement while preserving the user's submitted intent;
- xG/chance context remains material to blocking;
- a better goalkeeper read can change the authoritative result from goal to save for the same chance context;
- goalkeeper ability remains material for identical positioning/timing input.

`src/modules/playableMomentsSelection.test.js` additionally proves scheduled match importance can affect selection probability while hypothetical auto-result/finish data cannot.

## Verification limitations to keep explicit

The repository intentionally has no browser/E2E suite. Source review, unit/contract coverage and CI are not substitutes for rendered-device inspection. The automated gates and Cloudflare deployment prove the code builds, validates, preserves the automatic football guardrails and deploys; they do **not** prove mobile/wide visual quality or game feel. Those remain a manual review item on the branch preview.

The production build still reports the repository's existing large-main-chunk warning (`index` around 1.36 MB minified / 415 kB gzip). The Playable Key Moments renderer itself remains code-split as a separate lazy chunk (~9.8 kB / 3.49 kB gzip on the verified runtime build), so this Phase 2 change does not make the 3D renderer part of initial app loading.

## Deferred beyond Phase 2

Phase 3 broadens snapshot/one-on-one staging variations. Set pieces, final passes/crosses, headers/volleys, shootouts and presentation polish remain in their later roadmap phases and must not be pulled into this MVP review.
