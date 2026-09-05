# Playable Key Moments — Consolidated Roadmap

> **Status:** proposed programme / architecture decision record. No runtime behaviour is changed by this document.
>
> **Source priority:** this consolidated roadmap is based primarily on the independent review, architecture proposal and revised delivery plan added after the original PR #35 roadmap. **Where those newer reviews conflict with the original roadmap, the newer reviews win.** The original roadmap is retained only where it adds useful context that was not superseded.
>
> **Product direction:** Pitch remains a football-management simulator. This programme adds an **optional short playable-moments mode** for decisive football situations. It does **not** add continuous 11v11 player control, Player Career, or a second football simulation.
>
> **Hard constraints:** free assets only; no user-operated Blender or other manual art-tool workflow; browser/mobile first; no Unity/Unreal migration; Pitch remains authoritative for football outcomes; Quick Sim and Watch Match remain supported; no browser/E2E automation suite is introduced.

---

## 1. Executive summary

The long-term product goal is to add a third match choice alongside **Quick Sim** and **Watch Match**:

1. **Quick Sim** — existing instant authoritative simulation.
2. **Watch Match** — existing ledger-driven Broadcast presentation.
3. **Play Key Moments** — Pitch simulates the match normally, but selected decisive actions pause before their terminal resolution and become short user-controlled scenes.

The intended experience borrows the best part of Score!-style touch interaction and the old Jumpers for Goalposts pattern of a simulated match interrupted by playable situations, while retaining Pitch's Football Manager-like simulation authority.

The key architectural rule is:

> **The renderer presents the football; Pitch decides the football.**

That means the 3D layer may display a shot, goalkeeper save, one-on-one, penalty or free kick, but it does not independently create a goal, scorer, chance, foul, injury, corner, possession phase or competition result.

The independent review materially changed the original plan in four important ways:

- **Do not pre-select PlayCanvas.** Three.js is the provisional first candidate for the small, code-first scene we need. PlayCanvas remains the closest challenger. The POC must benchmark the same visual slice in both and choose based on evidence.
- **Do not assume a free football animation library already exists.** Generic packs may help with locomotion, but exact strike, goalkeeper-dive and contact quality must be proven. Procedural/code-authored skeletal motion is an acceptable and expected fallback.
- **Do not make penalties the first authoritative integration.** Pitch currently has an open-play shot seam but does not yet model positioned in-match penalties/direct free kicks or per-kick shootouts authoritatively. A penalty-style scene is useful as a visual POC harness, but the first real match integration must use an existing open-play chance.
- **Do not ship five mechanics as the first MVP.** The first career MVP should make existing open-play attacking shots and goalkeeper decisions reliable, persistent and enjoyable. Penalties, free kicks, passes, aerial actions and shootouts then follow as domain-backed phases.

The programme is therefore delivered in eight phases:

| Phase | Name | Outcome |
| --- | --- | --- |
| **1** | **POC — prove the seams and the experience** | Choose the renderer, prove the free/no-editor asset pipeline, establish prepare/resolve/commit, and integrate one temporary open-play chance. |
| **2** | **MVP — reliable Play Key Moments career mode** | A real career can opt into persistent, crash-safe open-play attacking and goalkeeper moments. |
| **3** | **Snapshot and one-on-one variations** | Broaden the proven shot/keeper mechanic without introducing new authoritative action families. |
| **4** | **Penalties and direct free kicks** | Add proper authoritative set-piece semantics, then make them playable. |
| **5** | **Final pass, cutback, cross and rebound** | Add playable actions that can create a downstream chance without letting presentation invent football. |
| **6** | **Headers, volleys and broader goalkeeper saves** | Expand contact types, trajectories and free/procedural animation coverage. |
| **7** | **Shootouts and competition integration** | Replace aggregate shootout verdicts with a versioned, rules-correct per-kick authoritative process. |
| **8** | **Presentation and long-term rollout** | Deepen scene direction, audio, replay, quality tiers, asset upgrades, accessibility and long-career compaction. |

There is deliberately **no calendar/staffing estimate** in this roadmap. The renderer, animation quality and persistent phase-continuation seams must be proven before estimates for the broader feature have useful confidence.

---

## 2. Product intent and boundaries

### 2.1 What Play Key Moments should feel like

Pitch should still feel like a management simulation. Tactics, roles, player attributes, fatigue, opposition quality and the authoritative action ledger create the football situation. The user then gets a brief opportunity to execute the decisive action.

Examples of the eventual experience include:

- a striker receiving a high-quality open-play chance and the user choosing placement/power;
- a goalkeeper facing a one-on-one and the user choosing positioning/dive timing;
- a penalty kick;
- a direct free kick around/over a wall;
- a final through ball or cutback;
- a cross followed by a header or volley;
- a decisive shootout kick or save.

The user is **not** moving a player continuously around the pitch for 90 minutes.

### 2.2 Non-goals

The programme does not add:

- continuous 11v11 football control;
- Player Career;
- a second result engine;
- a physics simulation that decides official football outcomes;
- online multiplayer football;
- paid assets or paid animation packs;
- manual Blender work for the user;
- a separate Unity, Unreal or Godot application;
- licensed player likenesses or assets taken from commercial football games;
- a browser/E2E test suite.

### 2.3 Relationship to the broader Pitch roadmap

Playable Key Moments is an **independent optional programme**, not a silent replacement for the remaining career-depth roadmap.

Before implementation begins, the first implementation slice must reconcile the live repository's actual delivered career phases with any stale status headings in `AGENTS.md`, `CLAUDE.md` or strategy documents. Do not infer that a phase is unfinished simply because an old heading says so when its runtime delivery is already present.

When the optional playable mode becomes real behaviour, contributor guidance should be narrowed from the old blanket "simulator-only / no manual controls" wording to the intended product boundary:

> **No continuous/manual 11v11 control and no second match engine. Optional short playable moments are allowed only through the authoritative continuation contract.**

Do not make that durable instruction change merely because this planning PR exists; make it in the implementation-preparation slice when the product behaviour actually starts to change.

---

## 3. Current architecture and the seam we must create

### 3.1 Existing authority

Pitch already has the right foundation:

- `src/modules/matchEngine.js` orchestrates authoritative football outcomes;
- `src/modules/matchActionResolver.js` resolves tactical routes, actors, targets, pressure, chances, shots and terminal finishes;
- the current simulation allocates a fixed **14-field deterministic RNG packet** for each phase;
- `src/game/broadcastSimulation.js` presents the authoritative ledger spatially but is not football authority;
- Quick Sim and segmented watched matches use the same underlying football model;
- match simulation has an explicit version tuple and refuses silently incompatible partial versions;
- the existing T7 statistical gates protect the relationship between player quality, tactics, specialist attributes and match results.

### 3.2 Current blocker: a shot is already finished before UI sees it

Today, `resolveAuthoritativePhase()` reaches `resolveShotOutcome()` during the phase. The finished record is then appended to the action ledger and the goal event is emitted before the UI can ask the user what they want to do.

Therefore the playable feature must **not** work by taking a completed goal/save/miss and overwriting it after the gesture.

The engine needs a prepared continuation boundary:

```text
CURRENT AUTOMATIC
phase
  -> allocate fixed packet
  -> choose route / participants / chance
  -> resolve shot finish
  -> append ledger / event
  -> remaining phase effects
  -> next phase

TARGET SHARED PATH
phase
  -> allocate fixed packet ONCE
  -> choose route / participants / chance / pressure
  -> prepare decisive action
       |
       +-- automatic or ineligible
       |      -> resolve finish immediately
       |
       +-- interactive and eligible
              -> return PENDING CONTINUATION
              -> persist / obtain validated user intent
              -> resolve finish ONCE
  -> commit ledger / event
  -> apply remaining phase effects ONCE
  -> next phase
```

### 3.3 Automatic behaviour must remain exactly compatible

The null-intent/automatic branch is a compatibility boundary.

Refactoring a phase into prepare/resolve/commit must preserve, for the same seed and inputs:

- the same action ledger;
- the same result/events;
- the same RNG allocation/cursor behaviour;
- the same segmented/whole-match parity;
- the same discipline/injury/substitution cadence;
- the same statistics and tactical analysis;
- the existing standard and deep balance gates.

Playable input is allowed to change an interactive result. Once a goal becomes a save or vice versa, later score-dependent tactics and therefore later match events may legitimately diverge. We do **not** require two intentionally different match states to reconverge after that point.

### 3.4 Exactly-once continuation

When a phase is paused for user input, resuming must not re-run work already applied.

The continuation must preserve enough state to ensure the following are not duplicated:

- RNG packet allocation;
- fatigue/state sampling;
- possession/route/actor selection;
- discipline checks;
- injury checks;
- AI substitution decisions;
- phase counters/stat mutations;
- action-ledger writes.

A resume-twice test is mandatory before a career rollout.

---

## 4. Renderer decision: evidence in Phase 1, not assumption

The original roadmap selected PlayCanvas too early. The newer review replaces that with a measured renderer gate.

### 4.1 Candidate order

| Candidate | Role in POC | Current view |
| --- | --- | --- |
| **Three.js** | First candidate | Provisional preference for a few bounded actors, a controlled camera, procedural geometry and code-authored animation. Direct Svelte lifecycle integration; use existing `AnimationClip`/`AnimationMixer`, not a home-grown animation engine. |
| **PlayCanvas standalone npm engine** | Required bounded comparison | Strong challenger if its animation/state tooling materially simplifies the exact proven rig/clip workflow without unacceptable payload/init cost. Hosted Editor is not required. |
| **Babylon.js modular packages** | Conditional fallback evaluation | Consider only if mixing/retargeting humanoid sources becomes a demonstrated blocker and Babylon's current retargeting tooling solves it cleanly. |
| **Existing SVG/Canvas 2D** | Debug/accessibility/fallback harness | Useful for proving normalized input and as a non-WebGL fallback. It does **not** prove the requested 3D presentation or animation quality. |
| Godot | Excluded from POC | A second application/export lifecycle is unjustified for short scenes. |
| Unity / Unreal / streamed engine | Excluded | Too much application/deployment/hosting complexity for this browser-first feature. |

### 4.2 Fair comparison rule

Three.js and PlayCanvas must be compared using the **same**:

- camera framing;
- pitch/goal/ball geometry;
- shooter/keeper character;
- animation/motion data;
- lighting/shadows;
- device/browser;
- build mode;
- network profile;
- user interaction.

Record for each:

- pinned package versions;
- production-built JS transfer size;
- loader/decoder transfer size;
- 3D asset transfer size;
- parse/init time;
- cold scene-ready time;
- repeat scene-ready time;
- representative frame-time distribution;
- cleanup/resource lifecycle after repeated entry/exit;
- implementation complexity of the exact scene.

Do not compare a raw renderer-core gzip number against a full engine bundle and call that evidence.

### 4.3 Choose once

At the Phase 1 renderer gate:

- choose one renderer;
- remove the losing spike from production paths;
- do **not** build a multi-engine framework;
- preserve only a narrow conceptual interface such as `mount(sceneData)`, `present(plan)` and `dispose()`;
- keep all football rules outside the renderer so replacing presentation later is possible without replacing football authority.

---

## 5. Free-assets-only and zero-manual-editor strategy

### 5.1 The requirement

The user must never need to:

- open Blender;
- retarget a skeleton manually;
- edit keyframes;
- export models;
- clean up animation files by hand;
- buy animation packs to unblock the feature.

For POC and MVP, prefer pipelines with **no Blender dependency at all**. Headless Blender may be considered only later if a proven free source needs it and the full command is deterministic, reproducible and unattended.

### 5.2 Do not confuse a large animation count with football coverage

The original plan cited generic libraries with 100+ animations. The independent review correctly notes that this does not prove they contain:

- a convincing football strike;
- left/right strike variants;
- goalkeeper anticipation;
- low/high dives both directions;
- spread/smother actions;
- catch/parry contact;
- landing/recovery;
- headers/volleys/crosses.

Those actions must be **inspected**, not inferred from a marketing count.

### 5.3 POC motion strategy

Start with **one rig and one stylized body**. Reuse it for shooter and goalkeeper with kit/material differences.

Use free source motion where it is actually compatible and useful. Generate the missing football-specific motion in code where necessary.

| Need | Preferred POC method | Acceptance concern |
| --- | --- | --- |
| Character body/rig | Exact verified zero-price Quaternius or KayKit candidate; repository-owned articulated fallback if needed | Licence/redistribution, rig hierarchy, bind pose, readable proportions/kit. |
| Idle/jog | Compatible free clips or small procedural cycle | Root motion, no obvious foot sliding. |
| Strike | Code-authored plant → backswing → contact → follow-through if no exact free clip passes | Stable plant foot and believable ball contact. |
| Keeper ready/dive | Code-authored anticipation → push-off → root arc → reach → landing → recovery if required | Both sides, no last-frame teleport/snap, plausible reach. |
| Save/catch/parry | Domain provides permitted intercept/time; presentation corrects hands within bounded visual limits | Official finish and visual contact must agree. |
| Ball | Procedural sphere/material or verified CC0 model | Correct scale and deterministic trajectory. |
| Pitch/goal/net | Procedural scene geometry | Lightweight, stable dimensions and goal-line semantics. |
| Club identity | Reuse `resolveMatchKits()` outputs | Existing clash/contrast logic; goalkeeper kit needs separate contrast. |

The aim is **stylized-realistic**, not photorealistic. Camera work, correct contact timing, ball movement and coherent keeper behaviour matter more than high polygon counts.

### 5.4 Code-authored movement is not a custom animation engine

Agents may maintain versioned pose/contact recipes and bone/joint curves in source. The selected renderer's existing animation mixer should play/blend them.

Do not build:

- a universal humanoid retargeter;
- a physics-driven whole-body controller;
- a bespoke generic animation framework;
- a procedural animation research project.

The code-authored vocabulary should remain as small as the scenarios require.

### 5.5 External candidate status

The following are **candidate evidence, not an approved inventory**:

| Source | What is currently useful | What must still be proven before use |
| --- | --- | --- |
| Quaternius Universal Base Characters | Producer states CC0/glTF and compatibility with its ecosystem. | Exact zero-price archive, included licence, rig identity, kit suitability and appearance. |
| Quaternius Universal Animation Library / Library 2 | Broad CC0-labelled general animation collections with distinct free/source tiers. | Exact clips in the zero-price archive; do not assume football/keeper coverage. |
| KayKit Character Animations | Current reviewed page listed 161 animations, CC0, with defined rig sizes. | Exact useful clips, character licence, bind/rest-pose compatibility. |
| Kenney animated characters | CC0 lightweight character precedent. | Football visual/movement suitability. |
| CMU motion database soccer material | Official index exposes soccer kick recordings and historic free-use language. | Current complete terms, redistribution rights, unattended acquisition/conversion and keeper coverage. Not approved yet. |
| Adobe Mixamo | Adobe permits royalty-free use in games. | Unattended acquisition/raw redistribution in a public web repo is not proven. Keep out of default pipeline unless exact terms/process are verified. |

No asset enters production because a search result merely says "free".

---

## 6. Automated asset and provenance pipeline

The implementation target is a reproducible, editor-free build.

### 6.1 Source manifest

Create a future `assets/playable-sources/manifest.json` containing, for every external source:

- asset/source name;
- creator;
- original URL;
- exact zero-price tier/archive/version;
- licence and local licence/notice file;
- whether attribution is required;
- acquisition method;
- source SHA-256;
- expected rig signature/clip inventory where applicable.

Prefer vendoring small redistributable source files so normal builds do not rely on a marketplace login, expiring URL or mutable "latest" download.

Reject a source if its required input cannot be acquired through an approved unattended path.

### 6.2 Build tool

Create a future `tools/playable-assets.mjs` (or equivalent project-native script) that:

1. validates source hashes and licence metadata;
2. rejects unexpected/missing files;
3. inventories nodes, materials, bones and animation clips;
4. checks rig mappings where required;
5. generates repository-owned procedural movement from versioned recipes;
6. retargets only through a pinned existing library and explicit mapping if genuinely necessary;
7. validates generated GLB/glTF;
8. optimizes only with measured-safe transformations;
9. emits a deterministic report and output hashes.

### 6.3 Validation

Use existing tooling rather than visual faith alone, for example:

- Khronos glTF validation;
- finite transform checks;
- expected track/bone binding checks;
- clip duration bounds;
- root displacement bounds;
- planted-foot drift checks;
- strike/contact distance checks;
- mirrored joint handedness checks;
- output reproducibility/hash checks.

These mathematical gates supplement human visual inspection. They cannot prove that movement looks natural.

### 6.4 Optimization

Use pinned glTF Transform or equivalent only after measuring the scene.

Do not introduce Draco, KTX2 or another decoder merely because compression exists. Include decoder transfer/init cost in the decision and adopt compression only when the net result is worthwhile on Pitch's target mobile profile.

### 6.5 Correct Vite asset path

The original roadmap proposed `public/assets/playable/`, but the live Vite setup uses `root:'web'` with `publicDir:false`.

Therefore generated runtime assets should be emitted under a source-owned path such as:

`src/assets/playable/generated/`

and imported explicitly from the **lazy scene module**, for example via Vite URL imports.

Requirements:

- no 3D asset is eagerly loaded on ordinary management-app startup;
- GLB/textures remain external assets where that is the measured best path;
- renderer imports stay out of the legacy/domain dependency graph;
- `src/build.py` legacy ordering/syntax constraints remain respected;
- a future `assets:playable:check` can rebuild from clean pinned inputs and verify output hashes/provenance.

---

## 7. Interaction resolution contract

### 7.1 Raw pointer movement is not a result

The UI normalizes input into a versioned football intent. The exact schema may evolve, but the first shot intent should remain compact and semantic, for example:

```text
version
aimX       # normalized goal-plane horizontal target
aimY       # normalized goal-plane vertical target
power      # bounded normalized intent
timing     # if the scenario actually uses a timing window
inputMode  # pointer / tap+controls / keyboard / simulate
```

Do not add `curl`, weak-foot modifiers or shot archetypes until the canonical player/action model has corresponding semantics or a clearly justified versioned mechanic.

### 7.2 Resolver ownership

The pure domain resolver combines validated intent with the already-prepared football context:

- authoritative shooter/keeper/player IDs;
- effective canonical player attributes;
- chance quality/xG;
- pressure/defender context;
- deterministic phase packet/state;
- scenario geometry;
- permitted action type.

It then returns:

- authoritative finish (`goal`, `saved`, `blocked`, `missed`, etc. as supported);
- compact trajectory/contact plan for presentation;
- any authoritative metadata required by the existing ledger/stat path.

The renderer does not calculate the official goal.

### 7.3 Visible result must agree with intent and authority

Examples of mandatory coherence:

- aim clearly outside the goal cannot become a goal because a favourable random finish roll was already waiting;
- a saved shot must reach a permitted keeper interception/contact;
- a blocked shot must have a plausible blocker in the authorized scene plan;
- a missed shot must exit the valid goal frame;
- the ball must leave the foot at the presentation contact point, not before/after it arbitrarily;
- 30/60/120 Hz rendering must not change the result of the same recorded intent.

### 7.4 User skill matters, football quality still matters

The gesture should alter execution, but should not provide a universal probability bonus.

A good user input can improve the chosen aim/power execution, while:

- Shooting/related canonical execution ability controls error envelope;
- pressure affects execution;
- goalkeeper quality affects permitted save/interception envelope;
- chance quality and geometry remain meaningful;
- a weak player does not become elite merely because the user swipes perfectly.

Do not double-count fatigue/player quality if the effective player selector has already incorporated it.

---

## 8. Deterministic pre-shot geometry

Broadcast's current coordinates are deliberately a **presentation simulation** generated after an authoritative ledger record exists. They can depend on elapsed presentation time and on `record.finish`.

They therefore cannot become the authoritative input geometry for Play Key Moments.

Create a small pure **moment geometry projection** from pre-outcome semantics.

Initial geometry should include only what the scenario needs, for example:

- coordinate/version system;
- canonical attack direction;
- goal frame dimensions;
- shooter and goalkeeper IDs;
- shooter/ball start point;
- goalkeeper start point/depth;
- channel (left/central/right) or normalized lateral position;
- pressure level/authorized defender relationship;
- contact time/interaction window;
- legal action types.

Generate any variation from a deterministic seed derived from the already-allocated phase state with a named/versioned salt. Do not draw fresh UI randomness.

Normalize user input to a canonical goal-facing orientation. The renderer can rotate/mirror presentation for ends/half-time without changing the semantic meaning of `aimX/aimY`.

Broadcast may later consume the same compact plan for transition continuity, but it must not feed outcome-conditioned/elapsed-time coordinates back into the football resolver.

---

## 9. Persistence, anti-reroll and lifecycle

Persistence is not required for the isolated visual harness, but it is mandatory before Phase 2 can ship in a real career.

### 9.1 One continuation per slot/fixture

Persist one current playable continuation with a stable identity that includes or can reconstruct:

- slot ID;
- fixture ID;
- stable moment ID;
- expected fixture/match revision;
- complete simulation version tuple;
- scene/geometry version;
- intent schema/resolver version;
- prepared phase state needed to resume exactly once;
- deterministic packet or reconstructable packet state;
- plain player snapshots required by the prepared resolution;
- status: pending / committed;
- committed normalized intent if submitted;
- authoritative committed result/receipt.

Do not persist renderer objects, GPU resources, DOM nodes or Svelte proxies.

### 9.2 Save before enabling input

For a real career moment:

1. prepare the eligible phase;
2. durably save pending context;
3. only then enable user interaction;
4. user submits one intent;
5. atomically validate revision + resolve + store intent/result + advance authoritative state/receipt;
6. only after successful commit reveal the official outcome;
7. presentation/replay may finish afterwards.

A cosmetic replay must never be the save trigger.

### 9.3 Duplicate/stale behaviour

- duplicate submission of the same committed intent returns the stored result;
- a different second intent is rejected;
- stale tab/revision submission is rejected;
- failed commit leaves the moment recoverable rather than revealing an unsaved official result;
- a pre-submit **Simulate** action resolves automatically from the same existing packet/context;
- a post-submit **Skip** skips presentation only;
- refresh/reopen cannot generate a more favourable keeper/shot roll;
- finished per-moment detail is compacted instead of accumulating full replay state forever.

### 9.4 Upgrade compatibility

Started moments retain their simulation/scene/intent versions.

Do not silently relabel a pending moment to the newest code version. Either:

- support the started version through a compatibility path; or
- block/resume with a recoverable explanation while retaining the save.

This gives ordinary crash/reload/idempotency safety. It is **not** intended to make an offline single-player save tamper-proof against a user editing their own local data.

---

# 10. Phased delivery roadmap

## Phase 1 — POC: prove the seams and the experience

### Objective

Prove that Pitch can support an enjoyable, deterministic short 3D football interaction using only free/reproducible assets and no manual editor workflow, **without changing automatic match behaviour**.

Phase 1 is not one giant implementation. It contains four internal workstreams that must close in order because each removes a different major risk.

### Phase 1A — preparation and automatic baseline

#### Why

Before the result engine is split around a pending shot, freeze evidence for the current authoritative behaviour and align the product boundary.

#### Work

- load the locked repository workflows and required plan gate;
- reconcile actual delivered roadmap status from repository evidence before changing durable contributor instructions;
- document the narrow optional-playable product exception for the implementation stream;
- capture exact automatic whole/segmented match parity evidence on current code;
- capture current T7 standard/deep balance evidence without changing thresholds;
- inspect live-match save, fixture and `pendingEvents` ownership;
- identify exact modules/functions that may own prepared continuation, intent validation and presentation adapter responsibilities;
- define preliminary version IDs for prepared continuation, geometry and intent.

#### Requirements

- no simulation constants are tuned in this preparation slice;
- no renderer is imported into domain code;
- no new DB/gameweek queue is proposed;
- current match modes continue unchanged.

#### Exit evidence

A short implementation plan exists for prepare/resolve/commit, versioning and eventual persistence, anchored to current repository ownership and baselines.

### Phase 1B — finish seam and headless contracts

#### Why

User interaction cannot safely modify a shot that the engine has already completed. This is the core football-authority prerequisite.

#### Work

- split the existing action resolution into a prepared decisive-action seam;
- allocate the current 14-field RNG packet exactly once;
- prepare route, actors, target, pressure, xG/chance and required player state without resolving the terminal finish;
- implement a null/automatic intent path that resolves immediately;
- implement versioned shot-intent validation and a preliminary interactive shot resolver;
- create deterministic pre-shot geometry independent of Broadcast's result-aware live coordinates;
- return a compact presentation plan from the same official resolution;
- add preliminary interactive calibration policies so result/aim coherence is protected from the first resolver.

#### Requirements

- eligibility for an interactive moment **must not** inspect `packet.shot`, `packet.finish` or the would-have-been automatic goal/save/miss;
- automatic/null intent must preserve exact existing football output and RNG behaviour;
- renderer/Svelte/browser/DB code cannot enter the pure action resolver;
- no phase effect may run twice after continuation resume;
- do not invent unsupported player attributes such as weak-foot/curl just for the minigame.

#### Unit/evidence gate

- whole-match baseline vs refactored automatic branch: exact result/ledger/event parity;
- multiple segmented execution sizes: exact automatic parity;
- RNG packet/cursor parity on automatic branch;
- suspend before terminal resolution → resume once vs twice: no duplicate fatigue/counters/discipline/injury/AI-sub effects;
- outside-goal interactive aim cannot produce a goal;
- same prepared state + same normalized intent yields same result regardless of presentation frame rate.

### Phase 1C — visual, renderer and asset feasibility

#### Why

This phase must prove that the **free, no-manual-editor visual workflow can actually look and feel acceptable**. Passing domain tests is not enough.

#### Harness

Use a **synthetic penalty-style scene** because it is the cleanest visual challenge:

- one shooter;
- one goalkeeper;
- ball;
- goal/net/pitch area;
- aim input;
- strike contact;
- goalkeeper anticipation/dive;
- goal/save/miss/blocked-style presentation as supported by the harness.

This is explicitly **not an authoritative career penalty** and cannot write a real fixture result.

#### Work

- establish one locked/free asset source manifest;
- prove one humanoid rig/body or repository-owned articulated fallback;
- prove a strike animation with foot contact;
- prove keeper ready + dive left/right + landing/recovery;
- generate missing football motion from versioned code recipes rather than requiring Blender;
- build procedural pitch/goal/ball where practical;
- implement the same normalized input contract used by the headless resolver;
- implement a short accessible tap/keyboard alternative and explicit Simulate action;
- build the exact same scene in Three.js and a bounded equivalent PlayCanvas spike;
- measure production-built transfer/init/frame/lifecycle evidence;
- choose and document one renderer;
- delete/retire the losing production spike rather than preserving multi-engine complexity.

#### Visual acceptance

Inspect at normal speed and slow motion for:

- planted-foot sliding;
- foot/ball contact offset;
- snapping or inverted limbs;
- impossible keeper last-frame movement;
- dive reach exceeding the authorized plan;
- ball teleportation;
- goalkeeper/ball contact mismatch;
- left/right mirroring defects;
- kit readability/contrast;
- browser gesture conflicts.

A static human model loading successfully does **not** pass this gate. A discs-only interaction prototype does **not** pass this gate.

#### Formative usability check

Use a small formative sample (for example ~5 willing testers, not presented as statistically meaningful retention research):

- can they understand aiming after one concise instruction?;
- can they explain why the attempt succeeded/failed?;
- can they perceive a difference between high/low player or goalkeeper quality/pressure?;
- do they want another attempt?;
- do touch/browser navigation gestures interfere?

Record confusion and qualitative feedback. Do not use silent telemetry as a substitute for observed feedback.

#### Renderer/performance evidence

At minimum record:

- production JS/assets/decoder bytes;
- cold scene-ready time;
- repeat entry time;
- frame-time profile on documented devices;
- real touch-device behaviour where available;
- repeated mount/dispose lifecycle;
- any unavailable iOS/device verification explicitly.

### Phase 1D — integrated authoritative vertical slice

#### Why

The visual harness proves presentation, but the programme is only viable if it can pause and resume a real authoritative match phase correctly.

#### Work

- reuse the chosen scene/controller for **one existing authorized open-play shot** in a temporary/test fixture path;
- stop before terminal finish;
- create and freeze scene/input context;
- support attacking shot intent;
- support a bounded goalkeeper defensive intent at the same seam;
- resolve and commit once through the real action ledger/stat path;
- resume the real phase and match;
- verify score/event/stat/tactical-analysis consistency;
- verify an interactive result can legitimately change downstream match state;
- do not yet roll this into persisted careers.

#### Exit evidence

Phase 1 is complete only when all of the following are true:

1. automatic/null-intent behaviour remains exactly compatible;
2. one real open-play chance can pause before finish, accept normalized intent and commit once;
3. both attacking and keeper input are demonstrated at the seam;
4. visual outcome agrees with authoritative result and trajectory/contact plan;
5. the chosen renderer and free/no-editor asset pipeline have measured mobile evidence;
6. one shooter/keeper rig has acceptable strike/dive/recovery quality;
7. no paid/non-approved asset is in the repo;
8. provenance/build inputs are reproducible and locked;
9. renderer/3D assets are absent from ordinary initial management load;
10. real touch-device verification is recorded where available;
11. existing build/lint/unit/balance/accent gates remain green;
12. POC game feel is judged promising enough to justify persistent career work.

### Stop rule

If free/procedural movement is not convincing, interaction feels unfair, or mobile lifecycle/performance is not viable:

- revise the bounded POC;
- try a different verified free rig/motion approach;
- reconsider the Three.js/PlayCanvas choice based on evidence;
- reduce visual complexity;
- report the limitation clearly.

Do **not** respond by buying an asset pack, asking the user to use Blender, or expanding to five scenario families before the POC is convincing.

### Out of scope for Phase 1

- real career persistence/migrations;
- real in-match penalties/free kicks;
- shootouts;
- through balls/crosses;
- headers/volleys;
- full stadium/crowd detail;
- multiple player body/face systems;
- continuous approach/dribbling control;
- long replay storage.

---

## Phase 2 — MVP: reliable Play Key Moments career mode

### Objective

Ship the first real optional **Play Key Moments** mode in a career using the action family Pitch already models authoritatively: **open-play finishing and goalkeeper decisions**.

This phase deliberately replaces the original five-family MVP. Penalties, direct free kicks, passing chains, aerial mechanics and shootouts have their own later domain-backed phases.

### 2A — persistence and crash-safe continuation

#### Work

- extend the existing save/slot/envelope lifecycle with the versioned pending continuation contract;
- persist pending context before enabling input;
- atomically commit validated intent + official result + advanced state + receipt;
- explicitly serialize Maps/plain player snapshots required by match state;
- support refresh/reopen recovery;
- reject stale tabs/revisions/different second intents;
- make duplicate identical submission idempotently return stored result;
- preserve export/import and cloud round trips;
- test two career slots with overlapping fixture IDs;
- handle unsupported started simulation/scene/intent versions without silent reinterpretation;
- compact completed moment data rather than accumulating replay state indefinitely.

#### Requirements

- use existing DB/save envelope and fixture/gameweek ownership;
- do not create a parallel database;
- do not create a second gameweek queue;
- do not persist Svelte proxies or renderer/GPU objects;
- pending moment cannot survive as an unresolved fragment of an already-finalized fixture.

### 2B — attacking open-play interaction

Support a bounded shot decision only:

- the engine selects the chance and shooter;
- the engine supplies authorized geometry/pressure/keeper context;
- user controls goal-plane aim and supported execution intent;
- no continuous running/dribbling approach;
- canonical player quality controls execution envelope;
- official shot finish and presentation plan resolve together;
- **Simulate** before submission uses the existing automatic branch from the same packet/context.

### 2C — goalkeeper interaction

Support a bounded keeper decision using the same authoritative resolution contract:

- engine-selected keeper;
- authorized start depth/context;
- user selects positioning/dive/spread direction or timing only where supported;
- keeper quality remains meaningful;
- saved/parried/caught presentation agrees with official intervention;
- no second goalkeeper result engine.

The mode must give the user defensive jeopardy rather than only arcade scoring opportunities.

### 2D — moment selection and pacing

Moment selection happens **before terminal finish** and must not know the auto result.

Eligibility can consider:

- chance quality/xG;
- action route/context;
- managed team side;
- score and minute;
- match importance where available;
- recent playable-moment pacing;
- a soft per-match cap;
- scenario repetition.

Rules:

- zero eligible moments in a match is valid;
- never manufacture a chance to hit a quota;
- never select only would-have-been goals or misses using `packet.finish`/auto result;
- the original **3–7 moments** idea is a pacing hypothesis to test, not an acceptance quota;
- measure how eligibility itself affects average goals/team advantage.

### 2E — complete match lifecycle

Exercise through the existing owner paths for:

- league matches;
- domestic cup matches;
- European matches;
- half-time;
- substitutions;
- injuries;
- live tactics/mentality;
- match pause/resume;
- quick presentation skip;
- repeated playable scenes in one fixture;
- fixture full-time finalization;
- post-match stats/results/world projection;
- slot save/export/cloud behaviour.

Knockout shootout verdicts remain automatic in Phase 2.

### 2F — accessibility, fallback and feature flag

MVP ships these immediately rather than deferring them:

- pointer/touch interaction;
- mouse support;
- keyboard/tap-based non-drag aim/action alternative;
- reduced-motion presentation;
- explicit Simulate action;
- replay/result-hold skip;
- WebGL/renderer initialization failure fallback;
- asset-download failure fallback that **automatically resolves the same pending moment**, never creates a replacement chance;
- feature flag / scenario kill switch;
- clean renderer/resource disposal when leaving a scene.

### Phase 2 calibration

Before feature-flag rollout, create synthetic deterministic user policies such as:

- poor input;
- average input;
- strong input;
- near-perfect input.

Run paired scenarios across:

- player ability bands;
- goalkeeper ability bands;
- pressure levels;
- chance-quality/xG buckets;
- home/away/managed side where relevant;
- representative tactics/team-quality differences.

Measure at least:

- goals added/removed relative to automatic policy;
- shot-on-target rate;
- keeper-save effect;
- quality ordering;
- user-skill ordering;
- strong-team advantage;
- selection bias caused by moment eligibility.

Set numeric acceptance relationships **before** tuning to make them pass. Keep the existing automatic T7 thresholds unchanged.

### Phase 2 save correctness tests

Exercise failures at least at:

- before pending context save;
- after pending save before input;
- during user input/cancel;
- before submit commit;
- after commit before outcome reveal;
- during replay/result hold;
- immediately before fixture closeout;
- write failure/full-time retry;
- duplicate submission;
- stale competing tab;
- export/import/cloud round trip.

Same stored intent/result must resume identically.

### Phase 2 exit criteria

MVP is complete when:

1. a real career can choose **Play Key Moments**;
2. eligible open-play attacking shots and goalkeeper decisions can occur through a full fixture;
3. match authority remains in the existing engine/ledger path;
4. pending/committed moments survive refresh/reopen without rerolls or duplicate mutations;
5. automatic Quick Sim/Watch/null-intent behaviour remains protected;
6. moment selection does not inspect known auto finish or manufacture quota chances;
7. accessibility/fallback/Simulate are usable;
8. interactive calibration relationships are within predeclared bounds;
9. existing standard/deep balance gates remain unchanged and green;
10. renderer remains lazy and resources clean up over repeated entries;
11. branch preview is inspected at mobile/tablet/desktop/reduced-motion dimensions;
12. real touch-device behaviour is recorded where available.

### Out of scope for Phase 2

- real playable penalties;
- real playable direct free kicks;
- passing/crossing interactions;
- headers/volleys;
- per-kick shootouts;
- full stadium presentation polish.

---

## Phase 3 — snapshot and one-on-one staging variations

### Objective

Make the existing shot/keeper mechanic feel substantially more varied **without adding a new authoritative football action family**.

### Why this comes next

The MVP will prove one finish seam. The lowest-risk way to deepen enjoyment is to represent more of the open-play chances that the engine already authorizes before changing the engine to create new set-piece/pass chains.

### Scope

Add deterministic staging variants such as:

- central snapshot;
- left/right-channel snapshot;
- edge-of-box attempt where supported by chance semantics;
- close-range attempt;
- one-on-one with keeper deeper;
- one-on-one with keeper advancing;
- increased/reduced defender pressure;
- short receive/set before a shot where this is presentation of the same authorized action, not a new possession.

### Domain requirements

Before input, geometry must authorize:

- lateral channel;
- shooter distance band;
- pressure level;
- keeper starting depth;
- defender relationship where a block is possible;
- legal shot/keeper actions.

Do not infer these from an already-finished Broadcast scene.

### Presentation requirements

- reuse the same selected renderer and scene lifecycle;
- reuse shooter/keeper rig and proven movement vocabulary;
- add only motion variants needed by the authorized staging;
- preserve foot/ball and keeper/ball contact quality;
- no continuous user locomotion;
- camera changes alone do not count as a new mechanic if underlying challenge is identical.

### Calibration

Every meaningful new geometry/mechanic variant gets its own paired interactive calibration. Do not assume the MVP's central-shot balance transfers to a one-on-one.

### Exit criteria

- representative open-play chance geometries map to visibly distinct but authoritative scenes;
- no new chance is created solely by presentation;
- user skill and player/keeper quality remain ordered correctly across variants;
- selection/pacing remains statistically acceptable;
- mobile performance stays within frozen budgets;
- no regression to automatic modes.

---

## Phase 4 — authoritative penalties and direct free kicks

### Objective

Add **real in-match penalty and direct-free-kick semantics to Pitch's authoritative model first**, then connect the proven playable scene mechanics.

### Why this cannot be part of the earlier MVP

At the reviewed code state:

- `foul_won` does not describe a positioned set piece;
- no authoritative in-match penalty/direct-free-kick shot branch exists in the action resolver;
- the renderer cannot invent an award/location/taker/wall and still claim that Pitch owns football outcomes.

### 4A — set-piece domain model

Add versioned authoritative semantics for at least:

**Penalty**

- award reason/context as appropriate for current abstraction;
- attacking/defending team;
- designated taker;
- goalkeeper;
- penalty location/geometry contract;
- separate penalty resolution/calibration path;
- ledger/stat/event projection.

**Direct free kick**

- award and deterministic location/distance/channel;
- taker;
- goalkeeper;
- wall participants/size/position semantics;
- direct-attempt eligibility;
- authoritative finish/restart semantics;
- ledger/stat projection.

Do not force these through open-play xG/block rules if their probability structure is materially different.

### 4B — automatic compatibility first

Before interactive control:

- new set-piece paths work automatically;
- whole/segmented execution is deterministic;
- competition/world statistics remain correct;
- no duplicate foul/shot/corner/restart projection;
- balance calibration is established for automatic penalties/free kicks.

### 4C — playable penalty

Reuse the Phase 1 synthetic visual lesson, now driven by a real authoritative penalty continuation:

- aim/power/keeper intent as supported;
- same crash-safe continuation/receipt protocol;
- same accessibility/Simulate fallback;
- separate penalty balance policy;
- result/presentation coherence.

### 4D — playable direct free kick

Add:

- wall visualization from authoritative semantics;
- goal-facing input with supported curve/power only if the domain contract explicitly introduces those mechanics;
- deterministic shot trajectory/error;
- keeper/wall intervention coherence;
- save/miss/block/goal/restart consistency.

Do not invent a `curve` player attribute merely for presentation. If curl/technique is a gameplay input, define how current canonical player attributes affect it.

### Exit criteria

- penalties and direct free kicks exist as authoritative automatic actions;
- playable versions pause/resume through the same continuation system;
- penalty/free-kick calibration is separate and defensible;
- renderer does not invent wall/award/taker/outcome;
- existing competition and match stats remain correct;
- automatic and interactive accessibility/fallback paths work.

---

## Phase 5 — final pass, cutback, cross and rebound

### Objective

Move beyond terminal shots by allowing the user to execute an authoritative **continuation action** that can create or alter the downstream chance.

### Core rule

A presentation pass must never create an extra possession/chance merely because the user drew a good line.

The engine must authorize:

- the current attacker/ball actor;
- eligible receiver/runners;
- defenders/interceptors;
- pass/cross/cutback type;
- target space/geometry;
- success/failure consequences;
- the downstream authoritative chance if the action succeeds;
- restart/turnover/corner/rebound consequences where supported.

### Scope

Introduce scenario families incrementally:

1. final pass / through ball into space;
2. cutback;
3. cross;
4. rebound/second ball where the authoritative vocabulary can genuinely represent it.

Each action should be a separate small domain/calibration slice rather than one giant "passing engine" rewrite.

### Input

Normalize user input to an authorized passing target/trajectory concept, not raw physics.

Potential semantic fields may include:

- target point/zone;
- weight/power;
- timing where relevant;
- selected eligible receiver if the scenario permits choice.

The exact schema is versioned per action family.

### Requirements

- receiver must be authorized/onside by domain context;
- failed pass produces the authoritative turnover/interception/restart;
- a successful pass creates only the downstream state authorized by the engine;
- presentation cannot add a corner, second shot or possession outside the ledger;
- scene geometry must be pre-outcome/deterministic;
- pass success must remain sensitive to canonical player attributes and defensive context;
- no continuous free movement control.

### Exit criteria

- at least one final-pass family can lead to a downstream playable/automatic shot through authoritative state;
- stats/ledger remain coherent end-to-end;
- failures are as well represented as successes;
- no duplicated possession/chance events;
- calibration covers user skill, passer quality, receiver/defender context and downstream goal impact.

---

## Phase 6 — headers, volleys and broader goalkeeper saves

### Objective

Expand the physical/contact vocabulary once the main ground-shot/pass pipeline is mature.

### Scope

Potential additions:

- standing/running header;
- attacking header from cross/set piece;
- volley;
- half-volley;
- higher/lower goalkeeper reaction saves;
- catch vs parry vs smother where authoritative resolution supports the distinction;
- broader one-on-one spread/rush presentation.

### Animation/motion gate

Every new contact type requires an actual free/procedural solution before it enters the roadmap's implementation slice.

For each:

- source/provenance verified;
- rig compatibility verified;
- code-authored fallback identified where feasible;
- contact frame/point defined;
- left/right/mirror behaviour inspected;
- recovery/landing inspected;
- impossible reach/snap prevented;
- mobile frame/load cost measured.

Do not write implementation assuming an imaginary free header/keeper clip exists.

### Domain requirements

- authoritative action defines contact type and eligible actor;
- trajectory/contact plan and finish agree;
- keeper intervention remains bounded by authoritative context;
- aerial execution uses canonical attributes or an explicitly designed extension rather than hidden arbitrary ratings;
- result statistics remain derived from the authoritative ledger.

### Exit criteria

- new contact types feel materially different and visually coherent;
- user input has clear semantic meaning;
- ability/pressure/keeper relationships pass calibration;
- asset/motion pipeline remains unattended and free;
- no regression to earlier ground interactions.

---

## Phase 7 — shootouts and competition integration

### Objective

Replace the current aggregate deterministic knockout shootout verdict with a **versioned, rules-correct per-kick authoritative process**, then expose individual kicks/saves as playable moments.

### 7A — per-kick authoritative shootout

The competition/domain layer must own:

- eligible taker order;
- goalkeeper identity;
- kick index/round;
- current shootout score;
- early mathematical conclusion;
- transition to sudden death;
- sudden-death paired-round rules;
- final winner;
- idempotent competition progression;
- save/resume state and simulation versions.

The renderer cannot decide whether a tie is won.

### 7B — automatic shootout first

Before user interaction:

- per-kick automatic shootout is deterministic;
- competition progression happens exactly once;
- early conclusion works;
- sudden death works;
- reload/retry cannot duplicate advancement;
- domestic cup/European ownership remains in existing competition paths.

### 7C — playable shootout

Allow managed-team kicks and goalkeeper attempts to use the same proven penalty interaction contract.

Requirements:

- each pending kick is persisted/committed once;
- user cannot refresh to reroll;
- Simulate resolves the same pending kick automatically;
- post-submit Skip only skips presentation;
- final competition advancement follows committed per-kick state;
- AI kicks remain deterministic and compatible.

### Exit criteria

- shootout rules are correct across normal and sudden-death endings;
- competition progression is idempotent;
- playable and automatic kicks share the authoritative resolver;
- save/export/cloud recovery works mid-shootout;
- no aggregate-verdict shortcut competes with the new authoritative process for new-version matches.

---

## Phase 8 — presentation and long-term rollout

### Objective

Turn the proven feature set into a cohesive, maintainable long-term Pitch experience without moving football authority into presentation.

This phase **deepens** capabilities that must already exist earlier (accessibility, lazy loading, contact timing, calibration, cleanup); it does not postpone those fundamentals.

### 8A — reusable scene director

Replace scenario-specific duplication with a small scene director driven by pure scenario data.

Responsibilities may include:

- actor spawn/pose;
- ball spawn;
- keeper/defender/wall placement;
- camera selection and lens/framing;
- interaction instruction overlay;
- animation initialization;
- contact synchronization;
- trajectory presentation;
- result hold;
- replay camera;
- transition back to match/Broadcast;
- cleanup/disposal.

Do not turn this into another football simulation.

### 8B — visual quality and animation refinement

- improve stylized player readability;
- improve kit identity/keeper contrast;
- refine locomotion and body orientation;
- improve procedural/verified free movement recipes;
- add bounded IK/contact correction only if measured to improve quality without becoming a universal animation project;
- validate left/right variants;
- keep one coherent rig ecosystem where practical.

### 8C — audio and atmosphere

Using only provenance-safe free sources or repository-generated sound:

- ball strike;
- keeper contact;
- net;
- woodwork;
- whistle;
- crowd swell/goal reaction;
- subtle stadium ambience.

Requirements:

- lazy-loaded;
- optional/mutable;
- browser autoplay rules respected;
- reduced sensory/motion preferences respected where appropriate;
- no licensed broadcast/game audio.

### 8D — replay and drama

- short cinematic replay for selected major moments;
- late-game/cup-final presentation variants;
- goal/save reaction beats;
- replay skip;
- reduced-motion alternative;
- replay never delays authoritative writeback;
- no unbounded replay persistence.

### 8E — quality tiers and delivery

Establish measured low/medium/high presentation profiles if evidence justifies them:

- texture/shadow quality;
- model/detail choices;
- crowd/environment detail;
- optional effects;
- asset preload strategy.

Do not alter football resolution by quality tier.

### 8F — long-career compaction

- retain only compact durable receipts needed for correctness/history;
- do not store full scene state or replays across years;
- measure IndexedDB/cloud/export growth across long careers;
- preserve existing `<50 MiB` design constraint unless a separately approved product decision changes it.

### 8G — rollout controls

- feature flag for Play Key Moments;
- per-scenario kill switches;
- automatic fallback if renderer/assets fail;
- Quick Sim and Watch Match never depend on the playable renderer;
- staged enablement by scenario family;
- safe handling of old/new started simulation versions.

### Exit criteria

Full delivery is complete when:

- supported scenario families share a coherent scene/animation system;
- presentation feels like one game rather than unrelated minigames;
- audio/replay/quality tiers are optional and bounded;
- mobile performance remains acceptable;
- accessibility works across supported interactions;
- long-career storage remains bounded;
- automatic modes remain independent;
- interactive calibration and existing automatic balance relationships remain protected;
- free/no-manual-editor provenance/build rules remain enforceable.

---

# 11. Global verification requirements

These gates apply throughout the programme and are not optional phase-end polish.

## 11.1 Automatic regression

Whenever the action resolver/engine is touched:

- whole-match automatic execution vs expected baseline;
- multiple segmented execution sizes;
- null-intent vs pre-feature automatic outputs;
- exact automatic ledger/result/event parity where the schema/version is intended compatible;
- RNG packet/cursor parity on automatic path;
- current standard match balance gate;
- current deep T7 balance gate;
- no thresholds widened merely to obtain green.

## 11.2 Phase mutation replay

Suspend immediately before terminal resolution and test:

- resume once;
- resume twice / duplicate request;
- phase-boundary cadence positions;
- fatigue/fitness;
- discipline;
- injuries;
- AI substitutions;
- action/stat counters.

Each mutation must settle once.

## 11.3 Input/result coherence

Examples that should become pure contracts:

- outside-goal aim does not score;
- same intent at different renderer frame rates returns same result;
- resize/orientation after intent recording does not reinterpret result;
- saved trajectory reaches authorized keeper contact;
- blocked path has authorized blocker/contact;
- a committed intent is immutable;
- a stale second intent is rejected.

## 11.4 Save correctness

Test relevant crash boundaries around:

- pending save;
- input;
- atomic result commit;
- reveal;
- replay;
- fixture closeout;
- competition progression;
- cloud/export/import;
- stale tabs/revisions;
- duplicate submit.

## 11.5 UI/render lifecycle

Hands-on preview checks should include where relevant:

- narrow iPhone-class width;
- wider mobile;
- tablet;
- desktop;
- real touch device where available;
- keyboard/tap alternative;
- reduced motion;
- orientation change;
- pointer cancel/multitouch;
- hidden/background tab;
- missing/corrupt asset fallback;
- WebGL/context initialization loss where practical;
- repeated enter/exit.

The repository intentionally has no browser/E2E suite. Do not add one. Pure contracts and manual rendered evidence prove different things and both should be reported.

## 11.6 Build boundaries

Implementation PRs must run the applicable existing repository gate, including:

- both build paths;
- Vitest/unit tests;
- lint;
- standard/deep match balance checks where simulation changes;
- club accent audit;
- asset reproducibility/provenance check once introduced.

The renderer must remain absent from the legacy/domain dependency graph and ordinary background simulation.

---

# 12. Performance acceptance

Existing Pitch design constraints remain:

- **<20s** fresh-career load at the documented 4× CPU methodology;
- **<25s** full world week;
- **<50 MiB** storage;

The old browser automation asserting these was deliberately removed. Any implementation that changes persistence/world simulation must re-measure manually and document device/browser/method. Old P3 numbers are historical context, not proof for this feature.

## 12.1 Proposed POC targets to ratify with measurement

These are initial programme targets, not claims about current performance:

- **zero** renderer/3D binary requests during ordinary initial management-app load;
- cold playable scene ready within **3s** on a documented ~10 Mbps / 100 ms RTT profile;
- repeat playable scene ready within **500ms** on the same documented setup;
- target **60 fps** on capable devices;
- require p95 frame time below **33 ms** on the chosen supported low-tier device during the short action, otherwise simplify presentation;
- after **20 enter/exit cycles**, no active renderer/input loops remain and retained resources do not continue growing after warm-up/cleanup;
- record separate budgets for compressed JS, assets, optional decoders and warm-cache state at the renderer-selection gate.

Where browser tooling cannot expose trustworthy heap/GPU counters, record the measurement limitation rather than claiming perfect disposal.

If targets fail, first:

1. reduce scene complexity;
2. remove unnecessary decoders/effects;
3. optimize verified assets;
4. revisit renderer choice if evidence supports it.

Do not silently loosen existing career performance constraints to accommodate the feature.

---

# 13. Calibration principles

Interactive control can intentionally change results, but it must not destroy the football model built in T0–T7.

## 13.1 Preserve automatic calibration

The existing automatic standard and deep balance gates remain untouched.

## 13.2 Add interactive policy calibration

For every material interaction family, compare deterministic synthetic user policies over paired seeds.

Track relationships such as:

- poor < average < strong < near-perfect execution effectiveness, within bounded limits;
- stronger shooter > weaker shooter under identical user input/context;
- stronger keeper > weaker keeper under identical shot context;
- higher pressure worsens execution where the canonical model says it should;
- high-quality chances remain better than low-quality chances;
- tactics/team quality remain meaningful relative to user skill;
- moment-selection policy does not secretly favour one team/result class;
- average total scoring increase/decrease remains within predeclared product bounds.

Do not tune first and invent thresholds afterwards.

Rare scenarios such as penalties/free kicks/shootouts need dedicated synthetic sampling; a handful of naturally occurring match events is not enough to validate them.

---

# 14. Risks and mitigations

| Risk | Mitigation / gate |
| --- | --- |
| Free animation quality is insufficient | Phase 1 explicitly proves strike + keeper dives/recovery; code-authored movement fallback; stop before expansion if visual target fails. |
| We accidentally require Blender | POC/MVP start without it; reject assets that require manual cleanup; optional headless use later only if reproducible/unattended. |
| Renderer choice is driven by preference rather than evidence | Same-scene Three.js/PlayCanvas benchmark in Phase 1; choose once. |
| Renderer payload harms management startup | Strict lazy import and zero initial 3D request gate. |
| A gesture overwrites an already-completed result | Prepare/resolve/commit boundary before terminal action. |
| Interactive eligibility leaks known outcome | Selection forbidden from using `packet.shot`, `packet.finish` or automatic terminal result. |
| User aim feels cosmetic/contradictory | Goal-plane/trajectory coherence contracts; outside goal cannot score. |
| Player quality is double-counted | Reuse canonical effective selectors once; no hidden generic bonuses. |
| Broadcast geometry becomes football authority | Pure pre-outcome moment geometry; Broadcast is presentation consumer only. |
| Refresh becomes a reroll exploit | Persist pending context before input; atomic committed intent/result receipt; duplicate/stale handling. |
| Phase resume duplicates injury/fatigue/sub effects | Exactly-once continuation tests at phase boundaries. |
| Asset licence is ambiguous | Locked source manifest, exact licence/tier/hash; "free" alone is rejected. |
| Generic animation pack lacks football clips | Inspect exact archives; procedural strike/keeper recipes; no assumed clip inventory. |
| A failed 3D load loses a chance | Automatically resolve the **same pending moment** from its existing packet/context. |
| Playable mode inflates scoring/team advantage | Interactive paired calibration from first resolver; predeclared bounds; existing T7 auto gates unchanged. |
| Storage grows with scene history | Persist compact continuation/receipt only; compact completed detail; no long replay history. |
| Feature destabilizes other match modes | Quick Sim/Watch never depend on renderer; feature/scenario kill switches. |
| Set pieces are presentation-only fiction | Phase 4 adds explicit authoritative penalty/free-kick semantics before career playability. |
| Shootout path conflicts with old aggregate verdict | Phase 7 introduces versioned per-kick authority and idempotent competition progression. |

---

# 15. Reuse and research references

These references are implementation inputs, not vendored dependencies or proof that a specific asset/runtime will pass the POC.

## Renderer / animation APIs

- Three.js `AnimationClip` — https://threejs.org/docs/pages/AnimationClip.html
- Three.js `AnimationMixer` — https://threejs.org/docs/pages/AnimationMixer.html
- Three.js `SkeletonUtils.retargetClip` — https://threejs.org/docs/pages/module-SkeletonUtils.html
- PlayCanvas standalone/Vite — https://developer.playcanvas.com/user-manual/engine/standalone/
- PlayCanvas animation documentation — https://developer.playcanvas.com/user-manual/animation/
- PlayCanvas retargeting support discussion — https://forum.playcanvas.com/t/animation-retargeting/28328
- Babylon animation-retargeting announcement/API example — https://forum.babylonjs.com/t/introducing-animation-retargeting/62547

## Asset build tooling

- glTF Transform CLI — https://gltf-transform.dev/cli
- Khronos glTF Validator Node API — https://github.com/KhronosGroup/glTF-Validator/blob/main/node/README.md

## Free asset candidates — not pre-approved

- Quaternius Universal Base Characters — https://quaternius.com/packs/universalbasecharacters.html
- Quaternius Universal Animation Library — https://quaternius.com/packs/universalanimationlibrary.html
- Quaternius Universal Animation Library 2 — https://quaternius.com/packs/universalanimationlibrary2.html
- KayKit Character Animations — https://kaylousberg.itch.io/kaykit-character-animations
- Kenney Animated Characters — https://kenney.nl/assets/animated-characters-protagonists
- CMU Motion Capture Database — https://mocap.cs.cmu.edu/
- Adobe Mixamo FAQ — https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html

## Relevant interaction precedent

- Golden Boot in PlayCanvas games showcase — https://playcanvas.com/industries/games
- Nordeus / Golden Boot showcase attribution — https://blog.playcanvas.com/playcanvas-showcase-2021/

Golden Boot is useful evidence that swipe-driven 3D football interaction has shipped on a browser-oriented engine. It is **not** evidence that its source, asset pipeline, animation budget or production approach is reusable by Pitch for free.

---

# 16. Implementation workflow and handoff rules

Each top-level phase should be delivered through its own reviewed implementation workstream/PR rather than one long-lived mega-branch.

Before any phase:

1. read current `AGENTS.md`, workflow contract and applicable locked skills;
2. reconcile this roadmap with current merged repository state;
3. use plan-gate when touching match simulation, persistence, gameweek lifecycle, asset/build pipeline or competition semantics;
4. define numeric calibration/performance acceptance before tuning;
5. keep scope to the named phase.

Every implementation handoff should state:

- phase/slice delivered;
- exact pushed SHA;
- relevant source-of-truth architecture changes;
- fresh build/test/lint/balance/asset-gate evidence;
- direct Cloudflare preview when UI exists;
- viewports/devices actually inspected;
- performance measurements actually taken;
- free-asset provenance introduced;
- limitations or unavailable device evidence;
- remaining work for the current phase;
- the next approved slice.

Do not describe:

- an untested asset route as a working pipeline;
- a synthetic penalty harness as a career penalty feature;
- a green unit suite as proof that animation looks natural;
- desktop mobile emulation as proof of iOS Safari GPU/memory behaviour;
- a POC as MVP;
- a phase as complete while its stated exit evidence is missing.

---

# 17. Programme definitions of done

## Phase 1 / POC done

A measured deployed POC proves:

- automatic match behaviour survives the prepare/resolve/commit refactor;
- one real open-play shot can suspend and resolve from user/keeper intent;
- Three.js vs PlayCanvas was fairly measured and one renderer selected;
- the selected renderer is lazy and cleans up;
- one free/reproducible humanoid workflow provides acceptable strike/dive/recovery movement;
- no user-operated Blender or paid asset is required;
- official result and visible trajectory/contact agree;
- mobile/touch performance and formative game feel justify continued investment.

## Phase 2 / MVP done

A real career can select **Play Key Moments** and finish complete fixtures using persistent, crash-safe open-play attacking and goalkeeper decisions, with:

- anti-reroll/idempotent continuation;
- accessible controls and Simulate fallback;
- dynamic but non-manufactured moment pacing;
- existing Quick Sim/Watch behaviour preserved;
- interactive calibration bounded against the authoritative football model;
- mobile lifecycle/performance verified.

## Full delivery done

Playable Key Moments supports the approved expanded scenario families through one coherent authoritative continuation architecture and one coherent renderer/scene system, including:

- varied shots/one-on-ones;
- authoritative penalties/free kicks;
- selected pass/cross/cutback/rebound interactions;
- aerial/volley/keeper contact types;
- rules-correct per-kick shootouts;
- reusable scene direction;
- free/provenance-safe presentation/audio/replays;
- accessibility and fallbacks;
- bounded performance/storage;
- deterministic persistence/versioning;
- calibration strong enough that user skill matters without replacing player/team/tactical quality.

The end state should feel like a natural extension of Pitch's simulation rather than a collection of arcade minigames attached to it.
