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
- the older Phase 5 continuation overlay source contract was updated to assert the same compatibility authority through the new Phase 8 director rather than requiring the obsolete direct-import implementation shape.

## Verification evidence

Before this final documentation checkpoint, Phase 8 code had already reached:

- legacy build — success;
- app build — success;
- lint — success;
- the remaining unit failures were stale source-shape assertions caused by the intentional director abstraction, and those contracts were updated without weakening their authority guarantees.

The final PR must not be promoted from Draft until the exact final documentation/code SHA passes:

1. Agent workflows;
2. legacy build;
3. app build;
4. lint;
5. full unit tests;
6. deep match-balance check;
7. accent validation;
8. artifact upload.

## Human preview evidence still required before merge

Repository rules intentionally do not add browser/E2E automation solely for this presentation phase. The deployed Phase 8 preview should therefore receive a human smoke check for:

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
