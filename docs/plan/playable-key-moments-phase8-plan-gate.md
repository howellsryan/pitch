# Playable Key Moments — Phase 8 Plan Gate

## Status

Approved implementation plan for Phase 8 on `feat/playable-key-moments-phase8`, stacked on the verified Phase 7 branch.

Phase 8 is a presentation and rollout phase. It must not move football resolution, RNG, competition progression, fixture settlement, or playable-session authority into rendering code.

## Objective

Turn the already-proven playable-moment feature set into one cohesive, maintainable Pitch presentation system with bounded audio, replay, quality tiers, storage behaviour, accessibility and rollout controls.

The implementation follows the roadmap's 8A–8G slices and preserves the existing automatic and simulation paths.

## Scope fence

### In scope

- reusable scene-director data and renderer-adapter boundary;
- presentation quality/refinement that consumes already-authoritative scene/result data;
- optional repository-generated audio and stadium atmosphere;
- replay of an already-committed authoritative result;
- low/medium/high/auto presentation quality profiles;
- long-career presentation-state compaction and measurable storage bounds;
- Play Key Moments feature flag and per-scenario presentation kill switches;
- renderer/asset failure fallback;
- presentation preferences and accessibility controls;
- local bounded presentation diagnostics needed to validate quality/fallback behaviour;
- compatibility for older already-started playable sessions.

### Explicitly out of scope

- changing match balance, xG, chance selection, shot resolution, goalkeeper resolution, penalty rules, shootout rules or competition progression;
- adding a second match engine or renderer-owned football outcome;
- re-enabling generic passing, through-ball, crossing, tackling, interception, caution or dispossession interruptions as new playable events;
- changing Quick Sim or Watch Match to depend on the playable renderer;
- paid/licensed assets or any workflow requiring manual Blender/editor work;
- unbounded replay recording or durable full-scene persistence;
- external analytics/telemetry services;
- a universal animation/IK project.

Legacy continuation/contact scene data remains readable where an older persisted session requires it, but Phase 8 does not broaden the current playable-event policy.

## Non-negotiable authority invariants

1. `moment` + committed `resolution` remain the only football truth consumed by presentation.
2. A renderer may interpolate, pose, frame, light, animate and replay; it may not decide whether a shot scores, is saved, is blocked or misses.
3. Replay is presentation-only and must never call a resolver or write match state again.
4. Quality tier, motion preference and audio preference must never alter a football input or result.
5. Renderer failure before resolution must resolve the same already-persisted pending moment through the existing automatic fallback path; it must not create a new moment or RNG packet.
6. Renderer failure after resolution must preserve and display the committed result without re-resolving it.
7. Quick Sim and Watch Match remain functional without the playable renderer.
8. Old/unversioned presentation state must remain readable; unsupported future presentation versions fail safely without corrupting match authority.

## Delivery slices

### 8A — reusable scene director

Introduce a small pure scene-director layer that classifies the authoritative moment and builds a presentation plan. The plan owns presentation concerns only:

- scenario family;
- renderer adapter;
- actor/ball/world staging already supplied by authoritative geometry;
- camera/framing recipe;
- interaction copy/control family;
- animation/replay recipe;
- quality profile;
- reduced-motion behaviour;
- audio cue family;
- fallback capability.

`PlayableMomentOverlay.svelte` should consume this director rather than directly owning scenario-specific renderer selection.

Existing Three.js renderers remain adapters initially. Do not rewrite proven geometry/resolution logic merely to satisfy the abstraction.

### 8B — visual quality and animation refinement

Extend renderer adapters with bounded quality options and coherent presentation settings:

- pixel-ratio/shadow/detail budgets;
- clearer kit/keeper contrast;
- deterministic left/right handling;
- existing procedural body/ball timing retained and refined only where measurable;
- one result-driven animation path for the currently supported shot/free-kick/penalty/shootout families.

No new football action is introduced in this slice.

### 8C — audio and atmosphere

Add a small lazy Web Audio presentation layer using repository-generated synthesis/noise only. No external/licensed audio assets are required.

Bounded cue set:

- strike;
- keeper contact;
- net/goal;
- woodwork where the authoritative result exposes it;
- whistle/set-piece cue;
- crowd swell/goal reaction;
- subtle optional ambience.

Audio starts only after a user gesture, is independently mutable, and has no effect on resolution.

### 8D — replay and drama

Add a short replay of the same committed `moment` + `resolution`:

- replay restarts presentation animation only;
- no authoritative write is delayed waiting for replay;
- replay is skippable;
- reduced-motion users receive an immediate/static alternative;
- no replay video/scene blob is persisted.

Major-moment drama variants must be bounded presentation recipes, not new simulation states.

### 8E — quality tiers and delivery

Add versioned presentation preferences with `auto`, `low`, `medium`, and `high` tiers.

`auto` chooses a bounded tier from browser/device capability hints. All tiers render the same authoritative result. The preference layer is local presentation state rather than career simulation state.

Renderer load remains lazy; failure falls through the existing authoritative fallback.

### 8F — long-career compaction

Do not persist full render state, animation frames, audio state or replay recordings. Durable playable state remains the compact authoritative session/receipts already required for correctness.

Add pure storage-estimation/compaction contracts around presentation metadata so tests can demonstrate that presentation additions remain bounded and do not threaten the existing `<50 MiB` long-career design target.

### 8G — rollout controls

Add a versioned local rollout policy:

- master Play Key Moments presentation enable/disable;
- scenario-family kill switches for supported current families;
- automatic fallback when renderer/assets fail;
- legacy compatibility adapter for old persisted session families;
- no dependency from Quick Sim/Watch Match on renderer availability.

Presentation versioning is separate from simulation/session versions so a visual rollout can be reverted without invalidating a saved football result.

## Preference model

Presentation preferences are versioned, local and bounded:

- quality: `auto | low | medium | high`;
- motion: `system | full | reduced`;
- audio enabled: boolean;
- audio volume: bounded 0–1;
- replay enabled: boolean;
- Play Key Moments presentation enabled: boolean;
- per-scenario presentation switches.

Defaults must preserve current behaviour where practical and respect `prefers-reduced-motion` when motion is set to `system`.

These preferences are not included in deterministic match inputs.

## Scene family policy

### Current enabled presentation families

- open-play shot/chance;
- goalkeeper save attempt against a shot;
- direct free kick;
- penalty;
- shootout kick/save.

### Compatibility-only families

Older persisted continuation/contact sessions may be rendered through their existing adapter or safely auto-resolved if the adapter is unavailable. They are not newly selected by Phase 8.

## Failure matrix

| Failure | Required behaviour |
| --- | --- |
| Three.js/module load fails before submit | Existing same-pending-moment automatic fallback |
| WebGL initialization fails before submit | Existing same-pending-moment automatic fallback |
| Renderer fails after authoritative commit | Text/control fallback showing committed result; no resolver call |
| Audio unavailable | Silent presentation only |
| Replay unavailable | Continue remains available immediately |
| Unsupported quality hint | Fall back to `auto`/medium-safe profile |
| Unsupported presentation version | Safe compatibility/fallback; never mutate football state |
| Kill switch disabled | Use automatic resolution / non-interactive presentation path without changing Quick Sim/Watch |

## Accessibility requirements

- retain keyboard/tap alternatives to gestures;
- minimum touch-friendly controls on narrow mobile;
- reduced-motion preference must affect intro/result/replay animation, not result semantics;
- readable result/instruction text remains available if canvas is unavailable;
- audio is optional and never the sole carrier of result information;
- pointer cancel/orientation changes must not reinterpret an already-recorded intent.

## Diagnostics

Use only bounded local/session diagnostics for presentation verification. Record coarse fields such as:

- presentation version;
- scenario family;
- selected quality tier;
- renderer load duration;
- renderer-ready/fallback outcome;
- replay count within the active presentation.

Do not collect player names, user input vectors, account data or external identifiers, and do not send diagnostics to an external service.

## Verification plan

Automatic gates on the final Phase 8 head:

1. `npm ci`
2. `npm run build:legacy`
3. `npm run build:app`
4. `npm run lint`
5. `npm run test`
6. `npm run balance:match:deep:check`
7. `npm run check:accents`

Targeted Phase 8 tests additionally prove:

- scene classification/plan is pure and does not mutate authoritative input;
- quality/motion/audio preferences cannot alter resolution data;
- replay never calls resolution/writeback;
- renderer failure preserves the same pending or committed authority boundary;
- quality profiles are bounded;
- diagnostics are bounded/sanitized;
- presentation storage metadata remains compact;
- rollout kill switches do not change Quick Sim/Watch or automatic match output;
- current playable-event policy remains restricted to the established shot/set-piece/save families.

## Hands-on preview matrix

The deployed preview should be smoke-checked before merge on:

- narrow iPhone-class width;
- wider mobile;
- tablet/desktop;
- tap/button interaction as well as pointer gesture;
- reduced motion;
- low and high quality tiers;
- audio muted/unmuted after user interaction;
- replay/skip;
- orientation change;
- missing renderer/WebGL fallback where practical.

Browser/E2E automation is not added solely for Phase 8; repository verification plus human rendered-preview smoke checking remains the intended evidence boundary.

## Commit/checkpoint strategy

Use reviewable delivery checkpoints rather than one presentation rewrite:

1. plan gate + scene director contracts;
2. preferences/quality/rollout controls;
3. overlay integration + accessibility/replay;
4. renderer quality/refinement + audio;
5. storage/diagnostics + compatibility tests;
6. final evidence/handoff and full verification.

Each checkpoint must remain compatible with the authoritative Phase 7 session/result model.

## Exit gate

Phase 8 is ready for review when:

- 8A–8G are implemented within this scope;
- no supported automatic path depends on the playable renderer;
- automatic/balance gates remain green without threshold weakening;
- final branch verification is green on the exact pushed SHA;
- Phase 8 evidence/handoff records what changed and any remaining human-only preview checks.
