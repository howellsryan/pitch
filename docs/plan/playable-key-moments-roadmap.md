# Playable Key Moments — POC, MVP and Production Roadmap

> **Status:** proposed programme / architecture only. No runtime behaviour is changed by this document.
>
> **Product direction:** Pitch remains a football-management simulator. This proposal adds an **optional moment-level interaction mode** for decisive situations; it does **not** add continuous 11v11 player control or a second football simulation.
>
> **Hard constraints:** free assets only; browser/mobile first; no Unreal/Unity runtime; no user-operated Blender workflow; authoritative match outcomes remain owned by Pitch; Quick Sim and Watch Match remain supported.

## 1. Goal

Add a new match choice — **Play Key Moments** — in which Pitch simulates the match normally but pauses at selected decisive situations and lets the user execute a short football action such as a penalty, snapshot, one-on-one, free kick or goalkeeper save.

The experience should combine:

- Football Manager-style simulation authority;
- Score!-style touch interactions for short moments;
- the old Jumpers for Goalposts pattern of a simulated match interrupted by playable chances;
- the existing Pitch action ledger, tactics, player attributes and deterministic simulation rather than a separate arcade result generator.

The target is not EA FC-level continuous gameplay. The target is a distinctive browser-first management game where the user's tactics create the situations and the user occasionally executes the decisive action.

## 2. Non-negotiable architecture

### 2.1 Pitch remains authoritative

`src/modules/matchEngine.js` and the action resolver remain the football source of truth. A playable scene may resolve a previously deferred terminal action, but PlayCanvas must never independently invent a score, scorer, injury, card, possession phase or historical result.

Current architecture already gives us the correct foundation:

- the match advances through deterministic authoritative phases;
- each action-ledger record identifies route, actors, target, defender, shooter, xG and terminal finish;
- Broadcast consumes the ledger rather than inventing football outcomes;
- Quick Sim and watched matches use the same football model.

Playable moments should extend that contract, not replace it.

### 2.2 Three match modes

The intended end state is:

1. **Quick Sim** — current instant authoritative simulation.
2. **Watch Match** — current ledger-driven Broadcast.
3. **Play Key Moments** — authoritative simulation + Broadcast transitions + selected interactive moments.

An optional later setting may support **Attacking Moments Only**, but this is not needed for the POC or MVP.

### 2.3 One authoritative action, two resolution paths

Automatic path:

```text
phase -> authoritative action resolver -> finish -> ledger/stats
```

Interactive path:

```text
phase
  -> authoritative action created up to decisive action
  -> PlayableMoment payload created
  -> simulation pauses
  -> user gesture captured
  -> interaction resolver combines gesture + football context
  -> authoritative finish committed
  -> ledger/stats updated
  -> match resumes
```

The same moment must remain reproducible from the same simulation state and recorded user input. Reloading must not provide a new random chance or allow repeatedly re-taking a failed moment.

## 3. Technology decision

### 3.1 Use PlayCanvas Engine

Use the open-source **PlayCanvas Engine** through npm inside the existing Vite/Svelte application. Do not migrate Pitch into the hosted PlayCanvas Editor as its primary application architecture.

Reasons:

- MIT-licensed open-source engine;
- browser-native JavaScript/TypeScript runtime;
- WebGL2 and WebGPU support;
- glTF/GLB-first asset workflow;
- mobile browser focus;
- existing animation state graph/runtime concepts;
- compatible with Pitch's current Vite build rather than creating a second app/toolchain.

The PlayCanvas scene should be **lazy loaded only when a playable moment starts**. Quick Sim, menus and ordinary management screens must not pay the 3D runtime/asset cost on initial load.

### 3.2 Do not use Unreal Engine

Unreal is out of scope. A browser Unreal experience would normally require a significantly heavier WebAssembly/build path or remote Pixel Streaming infrastructure and would work against Pitch's free, lightweight browser-first deployment model.

Unity is also out of scope for the same architectural reason: a second game project/runtime would duplicate build, state and deployment concerns without providing enough value for short interactive scenes.

## 4. Free-assets-only policy

### 4.1 User workflow: zero Blender

The user must never need to open Blender, retarget a skeleton manually, edit keyframes or export assets.

For **POC and MVP**, make this even stricter:

- accept only assets already available as GLB/glTF or directly ingestible by the selected automated pipeline;
- prefer a character and animation library designed for the same rig;
- if an asset requires manual Blender cleanup, reject it and choose another free asset;
- no paid source files or paid animation tiers;
- no "temporary" paid asset placeholders.

For full delivery, a headless conversion step may be introduced only if it is completely scripted, reproducible and requires no human Blender interaction. It should not be necessary for the first two milestones.

### 4.2 Preferred asset stack

The initial shortlist is deliberately license-simple and format-friendly.

| Need | Preferred free source | Why |
| --- | --- | --- |
| 3D runtime | PlayCanvas Engine | MIT, npm, browser-native |
| Base humanoids | Quaternius Universal Base Characters or compatible CC0 character | free standard assets, glTF, universal humanoid rig |
| General animations | Quaternius Universal Animation Library / Library 2 | CC0, GLB/FBX exports, 120+/130+ animations, same universal-rig ecosystem |
| Alternate characters/animations | KayKit characters + KayKit Character Animations | CC0, GLTF/FBX, 100+ free humanoid animations |
| Prototype characters | Kenney animated character packs | CC0 and designed for lightweight game use |
| Football | CC0 GLB football (or generate a simple ball mesh/material in code) | avoids licensing ambiguity |
| Pitch/goal | procedural PlayCanvas geometry first | avoids asset weight and licensing entirely |
| UI/audio placeholders | existing Pitch UI + CC0 Kenney/OpenGameArt candidates | keep provenance simple |
| Environment/HDRI later | CC0-only source with recorded provenance | optional polish, not POC dependency |

### 4.3 Mixamo is not the default asset source

Mixamo is free to use in video games and its animations are useful, but Adobe restricts redistribution of raw character/animation files. Because Pitch is a public web repository and browser assets are directly delivered to clients, Mixamo should **not** be the POC/MVP default until we have a clear repository/distribution approach that complies with Adobe's terms.

CC0 glTF/GLB assets avoid this ambiguity and are therefore preferred.

### 4.4 Provenance gate

Every third-party asset introduced later must have a record containing:

- asset name;
- original source URL;
- author;
- exact licence;
- download date/version where available;
- original file hash;
- transformation/optimization commands;
- output file hash;
- whether attribution is required.

Create a dedicated asset provenance manifest when the first binary asset is committed. No asset enters production because a search result merely says "free".

## 5. No-Blender asset pipeline

Preferred pipeline:

```text
CC0 GLB / glTF source
        |
        v
licence + SHA provenance record
        |
        v
automated validation
  - glTF validity
  - texture dimensions
  - polygon/bone count
  - animation clip inventory
        |
        v
scripted optimization
  - glTF Transform / equivalent CLI
  - mesh/texture compression where appropriate
        |
        v
public/assets/playable/...
        |
        v
PlayCanvas lazy loader
```

The first implementation should favour **one compatible character/rig ecosystem** over a more attractive mixture of unrelated free characters. Avoiding runtime retargeting is more valuable than extra visual variety during POC/MVP.

## 6. Reuse before invention

Relevant precedents to study during implementation:

### Golden Boot — Nordeus / PlayCanvas

PlayCanvas's games showcase describes **Golden Boot** as a fast-loading 3D penalty-kick game where the player uses swipe gestures to guide the ball, using physics and animation to simulate football. This is the closest precedent for the POC.

What to reuse conceptually:

- short scene initialization;
- touch/flick input;
- compact mobile-first camera;
- ball/keeper response;
- short attempt -> outcome -> reset/exit loop.

### Free Kick Football — PlayCanvas showcase

PlayCanvas currently showcases a browser 3D free-kick game built around bending the ball past a wall and goalkeeper. This provides further evidence that the engine is appropriate for a later set-piece scenario.

### Venge.io / Anim State Graph precedent

PlayCanvas has documented Venge.io using its animation state graph to combine and blend humanoid character animations. Reuse that state-machine approach instead of building a custom animation framework.

### Open-source/tooling precedent

Use PlayCanvas's official engine examples and animation tutorials as implementation references. Prefer engine-native examples over copying undocumented game-specific code.

## 7. Core domain contract

Introduce a future pure-domain contract similar to:

```ts
type PlayableMoment = {
  version: number;
  matchId: string;
  phase: number;
  minute: number;
  scenario: PlayableScenario;
  attackingTeamId: string;
  defendingTeamId: string;
  actorId: string;
  targetId?: string;
  defenderIds: string[];
  goalkeeperId?: string;
  route: string;
  xg?: number;
  seed: number;
  geometry: PlayableGeometry;
  allowedActions: PlayableAction[];
  status: 'pending' | 'resolved';
};
```

The exact schema is a future implementation decision, but the ownership rules are fixed:

- match engine creates/authorizes the moment;
- PlayCanvas only consumes scene data and returns normalized user intent;
- a pure interaction resolver converts intent into an authoritative resolution;
- UI code cannot directly write goals/results;
- persistence records only enough pending/resolved state to make refresh/retry deterministic.

## 8. Gesture model

Raw touch coordinates must not directly decide goals.

Normalize a gesture into football intent such as:

```text
aimX
aimY
power
curl
timing
shotType/passType
```

Then resolve that intent against:

- shooter/actor attributes;
- dominant/weaker foot where available;
- defender pressure;
- goalkeeper ability;
- xG/chance context;
- shot angle/distance;
- fatigue/form/effective ability already represented by the player model;
- deterministic RNG allocated by the authoritative phase.

A perfect gesture improves execution; it does not turn a weak player into an elite finisher.

## 9. POC — prove the architecture

### 9.1 POC question

**Can Pitch launch a lightweight 3D penalty scene on a mobile browser, capture a satisfying swipe, resolve it deterministically using Pitch football context, show goal/save/miss, and return cleanly to the existing app without breaking the current simulator?**

The POC exists only to answer that question.

### 9.2 POC scope

One scenario only: **penalty kick**.

Include:

- PlayCanvas installed through npm and lazy imported;
- one simple 3D pitch/penalty-area scene;
- one goal;
- one ball;
- one free CC0 humanoid shooter;
- one free CC0 goalkeeper character, which may initially reuse the same base rig/model with kit variation;
- minimal idle/run/strike/dive presentation from free assets or a deliberately simple placeholder action;
- swipe/touch input with mouse fallback for desktop development;
- one deterministic resolver using supplied shooter and goalkeeper ratings;
- goal / saved / missed result;
- one short replay or result hold;
- return to the normal Pitch screen;
- reduced-motion fallback;
- no persistent career write beyond whatever isolated fixture/test harness is required.

### 9.3 POC may use a developer harness

Do **not** wire the first 3D attempt into the full gameweek lifecycle immediately.

A hidden/dev-only harness is acceptable for the first slice:

```text
Open POC -> load fixed penalty scenario -> swipe -> resolve -> display result -> exit
```

Once interaction, asset loading and mobile performance are proven, integrate the same scene with a real authoritative match state.

### 9.4 POC intentionally excludes

- free kicks;
- 1v1 movement;
- headers/volleys;
- 22 rendered players;
- player likenesses;
- crowd/stadium detail;
- commentary overhaul;
- career statistics changes;
- new persistent schema if avoidable;
- online multiplayer;
- sophisticated physics simulation;
- runtime animation retargeting;
- Blender/manual art work.

### 9.5 POC acceptance gate

The POC is successful only if all of the following are demonstrated on a deployed branch preview:

1. the ordinary app still loads normally before any PlayCanvas bundle is requested;
2. the 3D scene can be entered and exited repeatedly without leaked canvas/input loops;
3. touch interaction works on a real iPhone-size viewport;
4. the same scenario + same normalized gesture + same seed produces the same outcome;
5. changing shooter/keeper ability demonstrably changes the execution envelope;
6. ball release is synchronized with the strike presentation rather than obviously teleporting;
7. save/miss/goal each have a coherent visual outcome;
8. reduced motion remains usable;
9. no paid/non-approved asset exists in the repository;
10. asset provenance is documented;
11. normal Pitch build/lint/test/accent gates remain green;
12. hands-on mobile and desktop preview inspection is recorded because this repository intentionally has no E2E browser suite.

If the POC fails load-time, device stability or interaction-quality gates, stop and reassess before creating more scenarios.

## 10. MVP — make Play Key Moments a real game mode

### 10.1 MVP objective

Ship a genuinely enjoyable optional match mode with enough scenario variety that it does not feel like a penalty mini-game bolted onto the simulator.

### 10.2 MVP scenario library

Target **five core scenario families**:

1. **Penalty — attacking**
   - aim, power/placement;
   - keeper quality influences save envelope.

2. **One-on-one — attacking**
   - short controlled approach;
   - choose placement/power/chip where supported;
   - keeper advances according to authoritative context.

3. **Snapshot / open-play shot**
   - receive/settle or immediate strike;
   - pressure and body angle affect error;
   - variants can represent cutbacks and edge-of-box shots without a new mechanic.

4. **Direct free kick**
   - swipe/trajectory creates aim, curl and power;
   - wall and goalkeeper respond;
   - only generated from plausible authoritative context.

5. **Goalkeeper key moment**
   - penalty save or high-value 1v1/save situation;
   - user chooses/times dive or spread;
   - prevents the mode from becoming "your team gets arcade scoring chances only".

### 10.3 MVP match flow

Add **Play Key Moments** to the match choice screen.

Expected flow:

```text
Team News
  -> Play Key Moments
  -> simulation/Broadcast accelerates between important moments
  -> qualifying moment selected
  -> transition into PlayCanvas scene
  -> user action
  -> authoritative resolution committed
  -> result/replay
  -> return to match flow
  -> Full Time
  -> existing post-match/career projection
```

### 10.4 Moment selection

Do not use "exactly N events per match".

Moment eligibility should consider:

- chance quality/xG;
- match score and minute;
- penalty/free-kick status;
- one-on-one/high-value chance semantics;
- match importance;
- whether the user's team is attacking or defending;
- pacing/maximum playable moments;
- avoiding repetitive consecutive scenario types.

A comfortable 4-0 should usually expose fewer late moments than a 1-1 cup tie entering stoppage time.

Initial target: approximately **3-7 playable moments in a competitive match**, bounded by quality and context rather than guaranteed quota.

### 10.5 MVP persistence and anti-reroll

Before production MVP, pending interactive state must survive refresh/reopen safely.

Required behaviour:

- a pending moment has stable scenario/seed/context;
- once user input is submitted, normalized input and resolution become stable;
- reload cannot regenerate a more favourable keeper/shot roll;
- final match writeback happens through the existing authoritative fixture/gameweek path;
- abandoning a live interactive match cannot duplicate or erase already-resolved moments.

This persistence design triggers the repository plan-gate before implementation.

### 10.6 MVP animation library

Keep the animation vocabulary small and reusable:

**Outfield**

- idle / ready;
- jog/run;
- approach;
- right-foot strike;
- left-foot strike if a free compatible clip exists, otherwise mirrored/procedural presentation only after validation;
- pass/receive where needed by scene staging;
- success reaction;
- miss/frustration reaction.

**Goalkeeper**

- ready;
- shuffle;
- rush/spread;
- low left/right dive;
- mid/high left/right dive where free clips permit;
- catch/parry;
- recovery/reaction.

Use PlayCanvas animation state graphs/layers where helpful. Do not build a bespoke general-purpose animation engine.

### 10.7 MVP presentation target

Aim for **stylized-realistic**, not photorealistic:

- readable human proportions;
- team-colour kits;
- smooth animation;
- convincing ball movement;
- strong camera framing;
- lightweight shadows/lighting;
- responsive 60fps target on capable phones with graceful quality reduction;
- no licensed player faces or commercial football-game assets.

## 11. Full delivery after MVP

Only begin these phases after MVP proves retention/fun, technical stability and acceptable mobile performance.

### F1 — animation and movement quality

- improve locomotion blends and body orientation;
- expand strike/pass/header clips from CC0/free-compatible sources;
- add foot-contact animation events;
- add lightweight procedural correction/IK only where it materially improves contact;
- reusable goalkeeper animation graph;
- left/right/mirrored variants with validation against ugly skeletal inversions.

### F2 — attacking scenario expansion

Add:

- through ball into space;
- final pass/cutback;
- cross selection;
- volley;
- half-volley;
- header;
- long-range attempt;
- rebound/second-ball where authoritative action vocabulary supports it.

A pass should be playable only when the match engine has already authorized a plausible attacking phase. The user must not create arbitrary extra chances outside the authoritative match.

### F3 — defensive scenario expansion

Add:

- goalkeeper reaction saves;
- one-on-one rush/spread;
- penalty shootout goalkeeper actions;
- optional last-ditch defensive block/interception if a clear, fair touch interaction can be designed.

Do not add full defender movement control.

### F4 — set pieces

Expand to:

- crossed free kicks;
- corners;
- attacking headers;
- penalty shootouts;
- indirect/set-piece variants where the authoritative ledger can create a coherent scene.

### F5 — scene director

Build a reusable scene/camera director that selects presentation by scenario rather than hardcoding a separate mini-game for every event.

Responsibilities:

- spawn points;
- actor orientation;
- camera position/lens;
- animation state initialization;
- ball position;
- defenders/wall/keeper placement;
- contact timing;
- replay camera;
- transition back to Broadcast.

### F6 — spatial semantics enrichment

The current action ledger is not real spatial tracking data. Do not pretend its illustrative Broadcast coordinates are authoritative.

If more variation is needed, add a small deterministic **moment geometry projection** from semantic context such as:

- central/left/right channel;
- box/edge/outside-box distance band;
- pressure level;
- keeper starting depth;
- runner/defender relationship;
- preferred/weak-foot side.

This belongs in a pure domain layer and must not turn the whole match engine into a continuous physics simulation.

### F7 — audio and atmosphere

Using free/provenance-safe sources only:

- kick impact;
- net;
- post/crossbar;
- keeper contact;
- whistle;
- crowd swell/goal reaction;
- subtle stadium ambience.

Keep audio optional, lazy-loaded and respectful of browser autoplay rules.

### F8 — replay and drama

- short cinematic replay after major moments;
- late-game/cup-final camera treatment;
- goal/save reaction beats;
- skip replay option;
- reduced-motion alternative;
- never delay authoritative save/writeback merely to finish a cosmetic replay.

### F9 — calibration

Interactive control must not destroy the statistical model built in T0-T7.

Create deterministic calibration harnesses for representative synthetic user skill profiles, for example:

- poor input;
- average input;
- strong input;
- near-perfect input.

Measure:

- goal conversion by xG bucket;
- attribute sensitivity;
- goalkeeper sensitivity;
- penalties;
- free kicks;
- one-on-ones;
- average goals added/removed relative to automatic resolution;
- strong-team advantage;
- weak-team upset rates.

The user's input should matter materially, but squad/player quality must remain meaningful and the mode must not become a universal goal multiplier.

### F10 — performance and asset delivery

- lazy-load PlayCanvas runtime and scenario assets;
- code-split 3D code from the management shell;
- keep a small shared character/animation core;
- load scenario-specific assets only when needed;
- compress GLB/textures through a scripted toolchain;
- establish low/medium/high quality profiles where useful;
- release GPU resources when leaving the 3D scene;
- ensure background world simulation is never coupled to rendering.

### F11 — accessibility and control alternatives

- pointer/touch primary controls;
- mouse equivalent;
- accessible non-drag alternative where practical (for example aim controls + explicit action button);
- reduced motion;
- control sensitivity options if user testing demonstrates need;
- avoid gesture designs that conflict with browser navigation/scrolling.

### F12 — rollout

- feature flag while experimental;
- keep Quick Sim and Watch Match untouched;
- migrate no existing career until a persistent schema is actually required;
- roll out scenario families incrementally;
- keep the ability to disable a broken scenario without disabling all watched matches.

## 12. Suggested implementation sequence

### Programme A — POC

1. technical dependency/lazy-load spike;
2. free CC0 asset/provenance selection;
3. penalty scene + gesture normalization;
4. deterministic penalty resolver;
5. mobile/browser hands-on verification;
6. decide go/no-go.

### Programme B — MVP

1. formal PlayableMoment domain contract + plan-gated persistence design;
2. integrate penalty with a real watched fixture;
3. one-on-one + snapshot;
4. free kick + goalkeeper moment;
5. moment-selection/pacing system;
6. full match lifecycle, save/reload and calibration closeout.

### Programme C — Production depth

Deliver F1-F12 in small reviewed slices, prioritizing scenario reuse, animation quality, calibration and mobile performance over raw scenario count.

## 13. Testing strategy

Pitch intentionally has no E2E/browser automation suite. Do not reintroduce one for this programme.

### Pure/unit tests

Protect:

- moment eligibility;
- deterministic scenario generation;
- gesture normalization;
- interaction resolution;
- attribute sensitivity;
- keeper sensitivity;
- anti-reroll/resume state;
- Quick Sim/Watch behaviour when Play Key Moments is unused;
- ledger/stat consistency;
- calibration relationships.

### Manual rendered verification

For each user-visible slice inspect real branch previews at minimum:

- narrow iPhone-class width;
- a wider mobile/tablet width;
- desktop;
- reduced-motion mode;
- repeated enter/exit cycles;
- low/medium device performance where available.

Record the final pushed SHA and direct Cloudflare preview in PR handoff evidence.

## 14. POC/MVP performance budgets

Do not set a false final byte budget before measuring the first PlayCanvas spike. Establish and freeze baselines during POC.

Initial design goals:

- no PlayCanvas/3D payload on ordinary initial app load;
- interactive scene becomes usable quickly enough to feel like a match transition, not a second game loading;
- no long-running render loop after scene exit;
- no unbounded texture/model cache across repeated moments;
- stable memory across multiple playable events in one match;
- graceful fallback/message if required WebGL capability is unavailable.

The POC must record actual bundle delta, first-scene load time and repeat-scene load time before MVP begins.

## 15. Key risks and mitigations

### Risk: free animation quality is insufficient

Mitigation: stay stylized; build around one compatible CC0 rig ecosystem; make camera/timing/ball movement do more of the realism work; expand only with verified free clips; use small procedural corrections rather than committing to custom mocap.

### Risk: 3D payload harms the management app

Mitigation: strict lazy loading, scenario asset splitting, scripted compression, disposal tests and POC performance gate.

### Risk: playable mode damages simulation realism

Mitigation: match engine creates the moment; pure resolver combines player skill and user intent; deterministic calibration compares automatic vs interactive distributions.

### Risk: reload becomes an exploit

Mitigation: persist stable pending moment context and seed before interaction; commit normalized input/resolution once; use existing fixture/gameweek authority for final writeback.

### Risk: we accidentally create a second match engine

Mitigation: PlayCanvas has no permission to create official football events; it renders an authorized scenario and returns normalized user input only.

### Risk: current contributor rule says simulator-only/no manual controls

This proposal deliberately evolves that product boundary. Implementation must update the contributor documentation at the moment Play Key Moments becomes real behaviour, narrowing the rule to **no continuous/manual 11v11 control and no second match engine** rather than silently contradicting the current guide.

## 16. Definition of POC, MVP and Full Delivery

### POC is complete when

A deployed branch preview proves one deterministic, attribute-aware, free-asset penalty scene works smoothly on mobile and returns safely to Pitch, with measured payload/performance and documented provenance.

### MVP is complete when

A real career can choose Play Key Moments and complete a full authoritative fixture using penalties, one-on-ones, snapshots, direct free kicks and goalkeeper moments; save/reload is deterministic; existing Quick Sim/Watch remain correct; statistical calibration and mobile verification pass.

### Full delivery is complete when

Playable Key Moments has a reusable scene/animation architecture, broader attacking/defensive/set-piece scenario coverage, polished free-asset presentation/audio/replays, robust accessibility, bounded performance, deterministic persistence and calibration strong enough that the mode feels like part of Pitch rather than a collection of unrelated mini-games.

## 17. Research references

These are implementation references, not vendored dependencies:

- PlayCanvas Engine documentation — https://developer.playcanvas.com/user-manual/engine/
- PlayCanvas standalone/Vite approach — https://developer.playcanvas.com/user-manual/engine/standalone/
- PlayCanvas animation state graphs — https://developer.playcanvas.com/user-manual/animation/anim-state-graph-assets/
- PlayCanvas games showcase (Golden Boot / Free Kick Football) — https://dev.playcanvas.com/industries/games
- PlayCanvas showcase listing Golden Boot by Nordeus — https://blog.playcanvas.com/playcanvas-showcase-2021/
- Quaternius Universal Base Characters — https://quaternius.com/packs/universalbasecharacters.html
- Quaternius Universal Animation Library — https://quaternius.com/packs/universalanimationlibrary.html
- Quaternius Universal Animation Library 2 — https://quaternius.com/packs/universalanimationlibrary2.html
- KayKit Character Animations — https://kaylousberg.itch.io/kaykit-character-animations
- Kenney animated characters — https://kenney.nl/assets/animated-characters-protagonists
- Adobe Mixamo FAQ (reference only; not default POC/MVP asset source) — https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html

## 18. First implementation task after this plan

Do **not** start with five scenarios.

Start with a dedicated POC PR whose only product question is:

> Can a free-asset, no-Blender, PlayCanvas penalty moment load lazily inside Pitch, feel good on a phone, resolve from Pitch attributes and deterministic input, then hand control back to the existing simulator cleanly?

If yes, freeze the proven technical/asset conventions and proceed to MVP. If no, fix or replace the approach before expanding scope.
