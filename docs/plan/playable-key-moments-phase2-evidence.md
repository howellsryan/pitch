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

## Persistence and recovery invariants

- A pending moment is saved before user input is accepted.
- Session, pending revision and moment ID are checked before commit.
- Repeating the identical submission returns the durable stored result; a stale/different second intent is rejected.
- A committed result remains a distinct durable state until the result presentation is acknowledged, covering refresh after commit but before reveal.
- Full time is checkpointed before the existing fixture/gameweek closeout runs.
- The playable session is cleared only after the existing match result/world settlement succeeds.
- The session is stored inside the existing save row, so local export/import and cloud save continue to use the established save-envelope owner rather than a Play-Key-Moments-specific persistence path.

## Verification gate

Final evidence must be recorded against one exact pushed SHA before Phase 2 is called complete.

- [ ] legacy build / replacement-contract gate
- [ ] Vite production build
- [ ] lint
- [ ] full Vitest suite
- [ ] standard 3,000-simulation T7 balance gate
- [ ] deep 5,000-simulation T7 guardrail
- [ ] 186-club accent audit
- [ ] Cloudflare branch preview on the same final head
- [ ] persistence/reload/idempotency regression coverage reviewed
- [ ] interactive calibration coverage reviewed
- [ ] rendered mobile/wide Play Key Moments flow inspected where available

## Verification limitations to keep explicit

The repository intentionally has no browser/E2E suite. Source review, unit/contract coverage and CI are not substitutes for rendered-device inspection. Any mobile/wide visual or device check that cannot be performed during the implementation session must remain explicitly unverified rather than being inferred from CSS or a successful build.

## Deferred beyond Phase 2

Phase 3 broadens snapshot/one-on-one staging variations. Set pieces, final passes/crosses, headers/volleys, shootouts and presentation polish remain in their later roadmap phases and must not be pulled into this MVP review.
