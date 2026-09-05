# Playable moments: architecture and fully automated assets

Proposed amendments to PR #35. Read the [review](playable-key-moments-review.md)
and [delivery gates](playable-key-moments-delivery.md). No dependencies, assets or
runtime code are introduced by this document.

## 1. Renderer decision

Prefer a code-first Three.js scene for the first feasibility slice: a small number
of actors, a controlled camera, a ball and a goal do not yet justify a broad game
engine. Use native animation tracks/mixer, not a custom general animation engine.
This is an architectural recommendation, not a measured payload ranking.

| Option | Fit for Pitch | Decision |
| --- | --- | --- |
| Three.js, direct Svelte lifecycle integration | Scene/rendering/animation primitives; generated tracks and optional scripted retargeting. Small orchestration layer needed. | First candidate for bounded, procedural football scenes. No React or extra Svelte 3D wrapper required initially. |
| PlayCanvas standalone npm engine | Valid Vite integration and animation state machinery; its hosted Editor is optional. Rig compatibility must be proven. | Closest challenger; choose if the same visual spike shows a meaningful workflow advantage inside performance budgets. |
| Babylon.js modular packages | Integrated animation/retargeting is a relevant alternative when mixing humanoid sources. | Promote to a bounded comparison only if rig conversion is a demonstrated blocker. Do not ship it alongside another engine. |
| Existing SVG/Canvas 2D | Cheapest input/fallback experiment; avoids humanoid rendering dependency. | Useful harness and non-WebGL fallback, not proof of the 3D presentation target. |
| Godot web export | Additional application/export lifecycle and integration boundary for a few short moments. | No migration justified by the inspected scope. Reconsider only for a separately approved broader game. |
| Unity/Unreal/streamed engine | Second engine project or streaming infrastructure adds avoidable deployment/state complexity. | Excluded for this browser-first programme. |

For the first two candidates, use the same camera, geometry, character, clip set,
lighting and device. Record pinned versions, build settings, compressed transfer
bytes including loaders/decoders, parse/init time, first/repeat entry and frame
times. Choose once at the POC gate. Do not build a multi-engine abstraction: keep
only a narrow mount/present/dispose interface and pure scene data.

## 2. A feasible free-animation strategy

Free assets are mandatory. CC0 is the default sourcing preference, not a synonym
for zero price. No paid tier, trial credit, proprietary-game extraction or manual
Blender rescue is an acceptable dependency.

Start with **one rig and one stylized body**, reused for shooter and keeper with
kit parameters. Prefer a verified free character; a code-generated articulated
figure is the independent fallback. A silhouette/disc can help debug input but
cannot pass the human-movement quality gate by itself.

| Visual need | Default source/production method | Proof before acceptance |
| --- | --- | --- |
| Body/rig | Exact free Quaternius or KayKit candidate; otherwise repository-owned procedural body and joint hierarchy | Zero-price archive, licence, hierarchy/bind-pose inventory, readable kit and acceptable appearance |
| Idle/jog | Compatible free clips when verified, otherwise small procedural cycles | No sliding at intended speed; consistent root motion; same skeleton contract |
| Strike | Code-generated plant, backswing, contact and follow-through tracks | Contact at the ball; stable plant foot; left/right variants individually checked |
| Keeper dive | Code-generated anticipation, push-off, root arc, arm reach, landing and recovery | Both sides; low/high reach where offered; no impossible last-frame snap |
| Save contact | Domain supplies valid intercept/time; visual hand/ball target correction within limits | Catch/parry direction agrees with official finish; unreachable intercept rejected before commit |
| Pitch/goal/net/ball | Procedural geometry/materials | Stable scale, clear goal line, valid ball flight and minimal draw cost |
| Club identity | `src/game/matchKits.js:resolveMatchKits()` outputs | Existing clash handling and number contrast; goalkeeper contrast resolved separately |

This is a deliberately small authored-in-code motion vocabulary. Agents maintain
joint curves and contact parameters in source; the user never edits keyframes or
exports models. Existing library mixers perform playback/blending. Do not promise
cinematic mocap quality from a few curves, nor build a universal retargeter or
physics-driven humanoid controller. If acceptable movement cannot be produced in
the bounded spike, stop expansion and report the visual limitation honestly.

A compatible external clip is optional polish, not the only way to produce motion.
Animation retargeting maps existing motion; it does not invent missing strikes,
dives or catches. Match names, hierarchy, rest transforms, proportions, units,
axes and root motion. A filename saying "humanoid" is insufficient.

## 3. Candidate evidence, not an approved asset inventory

Sources checked 5 September 2026. No binary below is approved by this review.

| Source | What the primary source establishes | Remaining gate |
| --- | --- | --- |
| [Quaternius Base Characters](https://quaternius.com/packs/universalbasecharacters.html) | CC0 label, glTF formats, compatibility claim with its animation library; free and source tiers are distinguished. | Exact free archive, kit customization, rig identity and usable appearance. |
| [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) and [Library 2](https://quaternius.com/packs/universalanimationlibrary2.html) | Broad general animation collections, CC0 statement and tier distinctions. | Enumerate exact free clips. Descriptions do not prove a full football/goalkeeper set. |
| [KayKit Character Animations](https://kaylousberg.itch.io/kaykit-character-animations) | Current page lists 161 animations, CC0 and Medium/Large rigs; other humanoids require retargeting. | Inspect exact clips/character licence and bind poses. Do not reuse the review's stale 133 count as evidence. |
| [Kenney Animated Characters](https://kenney.nl/assets/animated-characters-protagonists) | CC0 animated character pack exists. | Football kit and movement suitability remain unproven. |
| [CMU motion database](https://mocap.cs.cmu.edu/) / [soccer subject 10](https://mocap.cs.cmu.edu/search.php?subjectnumber=10) | Indexed official results identify soccer-kick recordings and free-use language. Direct retrieval timed out in this review. | Not approved: retrieve complete current terms and original files, prove redistribution and automated conversion. No complete keeper coverage established. |
| [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | Free with Adobe ID and royalty-free use in games. | FAQ is not proof of an unattended acquisition API or permission to publish raw clips as reusable repository assets. Exclude from default automated pipeline until exact distribution/acquisition terms are verified. Browser delivery alone does not imply a game-use prohibition. |

Keep public repository redistribution rights separate from rights to embed an asset
in a finished game. A non-CC0 free candidate needs an explicit licence record and
any required attribution; it must never quietly become a paid fallback.

## 4. Reproducible build, with no editor step

Proposed paths and commands below are implementation targets, not scripts that
already exist.

1. `assets/playable-sources/manifest.json` locks approved sources, archive/version,
   creator, licence file, zero-price tier, acquisition URL and SHA-256. Vendor
   small redistributable sources so normal CI does not depend on a store login,
   expiring URL or live marketplace. Larger inputs need an immutable retrievable
   location; reject sources without an unattended approved acquisition path.
2. `tools/playable-assets.mjs` reads the lock, verifies hashes/licences, rejects
   unexpected files, and inventories nodes, materials, bones and clips. Source
   upgrades are explicit; never silently fetch "latest".
3. Generate missing football motion from versioned pose/contact recipes. If
   retargeting is necessary, use an existing pinned library with an explicit rig
   map, normalize rest pose/units/root motion, and bake output at build time.
   Start without Blender at all; headless Blender is optional only if a later
   proven free source requires it and the complete command is reproducible.
4. Validate GLB with Khronos validation and domain checks: finite transforms,
   clip duration, expected track bindings, planted foot drift, contact distance,
   root displacement and mirrored joint handedness. These mathematical checks
   supplement hands-on visual acceptance; they cannot certify natural movement.
5. Optimize with pinned glTF Transform tooling. Preserve named joints, attachment
   nodes and contact markers needed by the runtime. Revalidate after optimization;
   do not enable Draco/KTX2/other decoders until measured savings justify their
   transfer, decode and integration costs.
6. Emit a sorted report and outputs under `src/assets/playable/generated/`.
   Import asset URLs explicitly from the lazy scene module, for example through
   Vite `?url` imports; ensure GLB is emitted as an external asset and is not
   eagerly preloaded. `public/assets` is not served by the current configuration.
7. A future `assets:playable:check` rebuilds from clean pinned inputs, checks
   reproducible output hashes and fails on missing licences/clips/rig mappings.
   Keep required notices with distributed output. The report includes source and
   output bytes, tool versions, commands, rig signature and per-clip provenance.

Generate scene/pose recipes directly from repository source where practical;
these need no third-party acquisition. Fully automated here means all acquisition
for approved inputs, transformation, validation and packaging can run unattended.
It does not mean choosing licences or accepting visual quality without review.

## 5. Authoritative integration

Place domain rules in pure JS modules, using JSDoc/plain objects as appropriate.
`src/game/` handles gesture and presentation adapters; the engine must not import
a renderer, Svelte, browser globals, DB access or a second random generator.

Refactor around a **prepared phase continuation**:

- Allocate the existing fixed packet once. At this SHA it has 14 fields.
- Determine route, possession, actors, fatigue snapshot, chance and pressure with
  the same football rules/order as today. Prepare the shot before resolving it.
- If ineligible or automatic, resolve and commit immediately. If interactive,
  return pending work before publishing the final ledger/score and before any
  later phase runs. Eligibility must not inspect `packet.shot`, `packet.finish`
  or the auto-resolved outcome to select only would-be misses/goals.
- Accept one validated intent or explicit automatic skip, then resolve and commit
  the phase including its remaining effects once. Do not re-run fatigue, packet
  allocation, discipline, injury or AI substitution on resume.
- Continue existing segment/finalization/gameweek paths. Results, standings,
  rewards, player statistics and tactical analysis derive from the committed
  authoritative ledger/result; renderer completion is never the save trigger.

`resolveShotOutcome()` is the local seam to reuse. Preserve the exact null-intent
automatic branch and paired-seed behaviour; do not round/normalize existing input
differently as a side effect of the new API. Interactive results can differ, and
later score-dependent tactics may then differ legitimately. RNG cursor parity is
not a requirement that those different matches have identical later events.

Do not invent a universal probability bonus for a "good swipe". For interactive
shots, validated goal-plane aim/power and seeded execution error produce a bounded
trajectory; keeper/pressure determine permitted interventions. The pure resolver
returns the finish and a compact presentation plan that agree. Aim outside the
goal cannot turn into a goal merely because `packet.finish` is favourable.
Blocked/saved/missed/goal must each have a coherent contact or exit explanation.
No general rigid-body simulation is needed for these short, constrained actions.

Reuse effective player selectors once, avoiding double-counting fatigue, quality
or xG. Do not invent weak-foot/curve attributes where the canonical player contract
does not provide them. Keeper control uses the same resolution contract with a
defensive intent, not a second save engine.

## 6. Geometry, time and lifecycle contracts

Pre-shot scene data is generated from phase semantics plus a deterministic seed
derived from the existing packet with a named salt. Fix coordinate units, attack
direction, goal frame, actor/keeper IDs, pressure, start positions, contact time
and legal action types. Default to a canonical goal-facing orientation; rotate
presentation at half-time without changing normalized input meaning.

Broadcast may consume that plan for visual continuity. Its elapsed-time snapshot
and existing finish-conditioned targets must not set xG, initial player legality,
keeper reach or another authoritative outcome. Extract only genuinely shareable
pure helpers; do not run 22-player Broadcast for the headless resolver.

Normalize pointer input relative to the measured viewport/goal projection with
bounded samples and a versioned range. Handle pointer cancel, multitouch, resize,
orientation, lost focus and reduced motion. Pointer timestamps can inform the
recorded gesture; RAF delta and render speed cannot change football resolution.
Pause decision timers when hidden. Supply keyboard/tap aim plus an action button
and a clear Simulate option from the first usable slice.

Persist one current continuation per slot/fixture with a stable moment ID, expected
revision, complete simulation version tuple, scene/intent versions, exact state
needed to resume, packet or its reconstructable state, and committed intent/result
receipt. Serialize Maps and plain player snapshots explicitly through the existing
save/export/cloud envelope; do not persist Svelte proxies or GPU objects.

Before enabling input, durably save pending context. On submission, atomically
store the winning intent, result, advanced state and receipt before revealing the
outcome; a failed save leaves it uncommitted and recoverable. CAS/transaction
revision checks reject stale tabs and different second intents. A duplicate same
submission returns the stored result. Pre-submit skip resolves automatically from
the same packet; post-submit skip only skips presentation. Compact finished moment
detail instead of accumulating full career replays.

Handle app upgrades explicitly: unsupported started-version tuples must not be
silently relabelled. Keep a compatible resume path or block with a recoverable
explanation while retaining the save. This provides ordinary crash/reload safety,
not tamper-proof security against someone editing their own offline save.

## 7. Reuse references

- [PlayCanvas standalone/Vite](https://developer.playcanvas.com/user-manual/engine/standalone/)
  documents an editor-free integration. Its [animation documentation](https://developer.playcanvas.com/user-manual/animation/)
  supports the graph-based alternative. The [official retargeting support response](https://forum.playcanvas.com/t/animation-retargeting/28328)
  is dated evidence, not a guarantee about all future versions.
- Three.js [AnimationClip](https://threejs.org/docs/pages/AnimationClip.html),
  [AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html) and
  [SkeletonUtils.retargetClip](https://threejs.org/docs/pages/module-SkeletonUtils.html)
  establish existing programmatic playback/retargeting building blocks. They do
  not promise arbitrary rigs will work without authored mappings.
- Babylon's [retargeting announcement and API example](https://forum.babylonjs.com/t/introducing-animation-retargeting/62547)
  documents `AnimatorAvatar.retargetAnimationGroup`, mappings and transform/root
  correction. Pin and test it if chosen; a retargeting tool still needs source motion.
- [glTF Transform CLI](https://gltf-transform.dev/cli) and
  [Khronos validator Node API](https://github.com/KhronosGroup/glTF-Validator/blob/main/node/README.md)
  are reusable build tooling. Optimization defaults require scene-specific review.
- [Golden Boot in the PlayCanvas showcase](https://playcanvas.com/industries/games)
  and [Nordeus attribution](https://blog.playcanvas.com/playcanvas-showcase-2021)
  establish a relevant shipped swipe-football precedent. They do not expose a
  reusable free asset pipeline, source licence, animation budget or indie production
  method. Treat it as interaction inspiration, not proof of this project's costs.
