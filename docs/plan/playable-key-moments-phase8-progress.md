# Playable Key Moments — Phase 8 Delivery Evidence

## Status

Phase 8 implementation complete on `feat/playable-key-moments-phase8`; final exact-head verification is the remaining merge-readiness gate.

Plan gate: `docs/plan/playable-key-moments-phase8-plan-gate.md`.

Phase 8 remains presentation-only. Match resolution, deterministic packets, competition progression, fixture settlement and playable-session persistence remain owned by the Phase 1–7 football/runtime modules.

## 8A — reusable scene director

Implemented:

- `playableMomentsSceneDirector.js` is the single presentation-routing boundary;
- pure scenario classification for open-play shots, direct free kicks, penalties and shootouts;
- old continuation/contact sessions remain explicit compatibility families rather than being re-enabled as current selectable events;
- one scene plan carries presentation version, adapter ID, interaction family, framing recipe, quality tier, motion preference, audio policy and replay recipe;
- Three.js adapters remain lazy imports behind the director;
- the overlay no longer owns renderer-family selection directly.

Authority protection:

- building a scene plan does not mutate the authoritative `moment` or preferences;
- the director never receives permission to decide finish/outcome;
- unsupported/disabled presentation fails through the established automatic fallback boundary rather than creating a new football path.

## 8B — coherent visual and animation system

Phase 8 deliberately reuses the already-refined Phase 6/7 procedural Three.js ecosystem rather than replacing stable visual code:

- one procedural humanoid model family remains in use;
- goalkeepers retain distinct kit/shorts/gloves presentation;
- free-kick wall models remain inside the same shot renderer;
- open-play, direct-free-kick, penalty and shootout presentation share the same shot adapter;
- the scene director owns bounded camera/framing recipes for future adapter evolution without moving authority into the renderer;
- quality profiles now expose bounded 30/45/60 FPS presentation targets, with the overlay enforcing the selected cadence.

The renderer still animates from the authoritative Phase 6/7 ball/keeper/body-motion result data. No new animation can change a goal/save/miss/block verdict.

## 8C — safe/free audio and atmosphere

Implemented a lazy Web Audio layer using generated oscillator/noise cues only — no paid/licensed audio assets and no manual asset-editing pipeline.

Bounded cues include:

- set-piece whistle;
- strike;
- goalkeeper contact;
- net/goal;
- woodwork when exposed by the authoritative result;
- crowd goal reaction.

Audio:

- is unlocked only after user interaction;
- can be muted independently;
- has bounded local volume;
- is derived from the committed result;
- silently degrades when AudioContext is unavailable;
- is never the sole carrier of result information.

## 8D — replay and drama

Implemented replay of the same committed `moment` + `resolution` only:

- replay restarts presentation animation, not football resolution;
- no resolver, simulation or writeback callback exists in the replay function;
- replay is capped to three plays;
- replay can be explicitly skipped;
- Continue Match remains available;
- reduced-motion presentation disables replay animation;
- penalties, shootouts and late-match moments receive a bounded longer drama recipe;
- normal moments use the shorter standard replay recipe;
- no frames/video/scene recording is persisted.

## 8E — quality tiers and delivery

Implemented versioned local presentation preferences:

- `auto`;
- `low` — 30 FPS target;
- `medium` — 45 FPS target;
- `high` — 60 FPS target.

`auto` uses coarse device memory, hardware concurrency and pixel-density hints to select a bounded tier. Renderer/WebGL failure still falls back safely.

The Three.js adapters remain dynamically imported, so automatic match modes do not eagerly depend on playable rendering. Production builds continue to emit the playable renderers as separate lazy chunks.

Quality selection is presentation-only and is not included in match inputs, deterministic packets or save authority.

## 8F — long-career compaction

Added explicit presentation storage contracts:

- presentation history capped to 24 compact receipts;
- compact presentation metadata budget capped at 4096 bytes for the tested history envelope;
- scene state, animation frames, replay frames, audio state and renderer state are explicitly non-durable;
- diagnostics are memory-only and capped separately;
- full replay/scene blobs are never written into the career save.

This keeps Phase 8 additions bounded rather than allowing presentation history to grow with career length, protecting the roadmap's existing `<50 MiB` long-career design constraint.

## 8G — rollout and failure controls

Implemented a versioned local rollout policy:

- master Play Key Moments presentation enable/disable;
- per-family switches for open play, direct free kicks, penalties and shootouts;
- current-family disablement resolves the same persisted pending moment automatically;
- renderer failure before resolution uses the same-pending-moment automatic fallback;
- renderer failure after commit cannot re-resolve and leaves the committed textual result/Continue path available;
- legacy continuation/contact families remain compatibility-readable;
- presentation version is separate from simulation/session versions.

Quick Sim and Watch Match remain first-class paths in `MatchScreen.svelte` and do not read presentation preferences or import the Three.js renderers.

## Live-match fixed-cadence regression fix

A Phase 7/8 live-broadcast regression was found during preview review: the constants still encoded the intended `120 phases × 750 ms = 90 seconds`, but an event-heavy match could take materially longer because `MatchScreen` waited for `isBroadcastReady(...)` and retried every 80 ms whenever presentation choreography overran its 750 ms phase slot. Those retries accumulated on top of the nominal 90-second regulation duration.

The fix keeps the authoritative engine cadence unchanged and compresses only ledger-driven presentation time:

- the football engine still advances exactly one authoritative phase at a time;
- the public cadence remains one phase every 750 ms, which maps 120 phases to exactly 90 real seconds and therefore one real second to one match minute;
- long internal positioning, route, carry, restart, goal-hold and half-time choreography is advanced in stable 50 ms presentation substeps at a separate accelerated presentation clock;
- routine build-up labels may compress inside a single frame;
- shots, goals, half-time and restart/set-piece states are semantic presentation milestones and remain surfaced as visible frames;
- score, ledger result, player statistics, RNG, match balance and fixture outcome are untouched;
- non-ledger presentation behaviour is unchanged.

A new regression suite, `liveMatchFixedCadence.test.js`, proves the user-facing timing contract directly rather than merely checking constants:

- seeded full matches for seeds 12, 34 and 56 run all 120 authoritative phases;
- every individual authoritative phase must become broadcast-ready within its 750 ms wall-clock budget;
- the test is not allowed to grant extra time for event-heavy phases;
- all returned goal presentations must equal the authoritative ledger goal count;
- `120 × 750 ms = 90,000 ms` is locked as the regulation wall-clock target.

The test was introduced red before the implementation change and reproduced the regression. After the final presentation-clock correction, it passes alongside the existing `ledgerBroadcast.test.js` semantics, including shot visibility, goal visibility, half-time ordering, no invented goals and seeded full-ledger drainage.

## Accessibility and mobile

Retained and strengthened:

- gesture-independent Left/Centre/Right + Low/Mid/High button controls;
- pointer-cancel protection;
- minimum 44px controls, 46px on narrow mobile;
- system `prefers-reduced-motion` support plus explicit full/reduced/system preference contract;
- textual instructions and committed-result copy outside the canvas;
- muted audio support and silent fallback;
- explicit replay skip;
- reduced-motion result path without replay animation.

## Bounded diagnostics

Added local in-memory presentation diagnostics only:

- maximum 32 entries;
- presentation version;
- scenario family;
- quality tier;
- renderer load duration;
- fallback boolean;
- replay count.

Arbitrary player names, user IDs and input vectors are stripped by the diagnostics contract. No external analytics service is introduced.

## Regression coverage added

- `playableMomentsPhase8Presentation.test.js`
  - preference normalization;
  - quality tier selection;
  - reduced motion;
  - pure scene classification/planning;
  - rollout switches;
  - shootout compatibility;
  - bounded drama recipes.
- `playableMomentsPhase8Boundaries.test.js`
  - authoritative-result audio mapping;
  - diagnostic sanitisation/cap;
  - long-career presentation storage cap;
  - non-durable renderer/replay/audio state.
- `playableMomentsPhase8OverlaySource.test.js`
  - one director boundary;
  - replay cannot call authoritative callbacks;
  - post-commit renderer failure cannot simulate again;
  - accessible controls;
  - bounded quality/audio/replay controls.
- `playableMomentsPhase8VisualAndIndependence.test.js`
  - one procedural visual ecosystem;
  - keeper distinction;
  - free-kick wall reuse;
  - lazy renderer delivery;
  - Quick Sim/Watch independence;
  - current playable-event policy remains shot/set-piece/save only.
- `liveMatchFixedCadence.test.js`
  - exact 90-second regulation cadence contract;
  - every seeded phase bounded to 750 ms regardless of event density;
  - no authoritative goal lost while presentation catches up.
- the older Phase 5 continuation overlay source contract was updated to assert the same compatibility authority through the new Phase 8 director rather than requiring the obsolete direct-import implementation shape.

## Verification evidence

The completed timing-fix code head `1ef0a76990ebea4f97789eb5c31b58dc1c28d201` passed:

- Agent workflows;
- legacy build;
- app build;
- lint;
- full unit tests, including the new fixed-cadence seeded regression suite;
- deep match-balance check;
- accent validation;
- artifact upload.

The final PR must not be promoted from Draft until this documentation checkpoint also passes the same exact-head workflow gates.

## Human preview evidence still required before merge

Repository rules intentionally do not add browser/E2E automation solely for this presentation phase. The deployed Phase 8 preview should therefore receive a human smoke check for:

- a normal live game completing at approximately 90 real seconds for 90 regulation match minutes;
- event-heavy live games not accumulating extra wall-clock delay;
- shots, saves, goals, restarts and half-time remaining visibly coherent at the fixed cadence;
- scoreboard/commentary/pitch remaining synchronized while presentation catches up;
- narrow iPhone-class viewport;
- wider mobile/tablet/desktop;
- touch/tap and pointer input;
- normal and reduced motion;
- Auto/Low/Medium/High quality selection;
- sound enabled/muted after user gesture;
- replay and Skip Replay;
- penalty/direct-free-kick/open-play/save/shootout presentations;
- orientation/resize behaviour;
- renderer/WebGL failure fallback where practical.

No human-only preview result is claimed in this document until it has actually been observed.
