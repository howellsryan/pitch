# Playable animation rebuild

## Plan — 6 September 2026

GOAL: replace the disconnected primitive animation with coordinated, anatomically proportioned footballers and grounded, contact-driven movement.

UNKNOWNS: mobile framing, mesh deformation and reach are checked with rendered poses and mathematical contact tests. The hosted browser currently fails to create WebGL even on the unchanged PR preview; offline geometry renders will supplement, but cannot substitute for, the final live-device check.

SUCCESS CRITERIA: planted support feet through contact; striking boot meets the stationary ball before release; keeper gloves meet saved shots; no root rewind after landing; bounded continuous joints; deterministic replay; both builds, unit tests, lint and accent audit pass. Inspect narrow/wide renders and verify final CI/Cloudflare commit.

STEPS:
1. Record baseline defects and failing contact/motion contracts.
2. Build a shared generated skinned footballer with smooth anatomical profiles and a renderer-independent two-bone IK pose solver.
3. Drive approach, plant, strike, follow-through, keeper push/reach/landing from one timeline. Keep ball contact and flight in that timeline.
4. Improve grass, markings, net, shadows, ball and responsive camera composition; reuse the character for legacy continuation scenes.
5. Review the actual diff, render representative frames, run repository gates, push the verified change to PR #35 and check CI/preview.

EDGE CASES: left/right/centre, high/low saves, catch/parry/smother/spread, miss/block, aerial legacy contacts, replay seeking, reduced motion, resize, disposal and renderer failure.

OUT OF SCOPE: match resolver/calibration, career persistence, event selection, continuous football control, paid assets and manual art tools.

## Ownership

- `playableFootballMotion.js`: pure joint targets and constrained limbs, no Three.js/DOM/RNG/persistence.
- `playableFootballer.js`: generated skinned geometry and mapping solved joints onto bones; shared by both existing adapters.
- `playableMomentsPocScene.js`: existing authoritative-result-to-presentation boundary and ball/contact timeline.
- Existing Three.js adapters: scene/camera/lighting/resource lifetime only.

Techniques: [Three.js skeletal skinning](https://threejs.org/docs/pages/SkinnedMesh.html), [analytic two-joint IK](https://theorangeduck.com/page/simple-two-joint). Implementation and geometry are original code; no downloaded character or animation assets. Procedural geometry is not claimed to be photorealistic or motion capture.

## Implemented changes and review

- One generated skinned body with anatomical cross-sections, blended knee/elbow weights, smaller hands/head, fitted shirt/shorts/socks, generated kit numbers and boots. The same factory serves striker, keeper, defender, wall and legacy continuation actors.
- Joint targets coordinate approach, plant, backswing, contact, follow-through and settling. Legs retain fixed lengths. Keeper dives rotate through the pelvis/chest, reach with hands and stay on the landing side instead of returning to their starting point.
- IK uses gradual extension near straight limbs and ground-constrained bend planes. Dense replay sampling caught abrupt elbow/knee extension and floor penetration during development; the final continuity contract protects those cases.
- Ball flight starts at speed at the strike marker. Saves meet the hands, wide catches descend with the keeper, and parries remain separate deflections. Existing legacy scalar pose fields remain compatibility output, not the renderer's motion source.
- Regulation goal/area markings, a three-dimensional net, alternating turf strips, restrained instanced seating, warmer lighting, soft shadows, panelled football and a camera that fits the goal on portrait viewports. Existing quality settings now control shadow, antialiasing and pixel-ratio costs in the shot adapter.
- No match resolver, RNG packet, persistence, event-selection or career closeout changes; no new production dependency or external asset source.

Review covered the actual diff, preserved legacy continuation loading, resource disposal, fixed limb lengths, replay seeking and the source-of-truth boundary. The first broad test attempt encountered the unchanged match-engine statistical test's 5-second timeout while other checks were running; its isolated run passed (4.24 seconds). Final full-suite verification uses one Vitest worker without changing any timeout or balance guardrail.

## Visual verification limits

Offline raster previews use the actual Three.js skinning, generated meshes, scene assembly and camera transforms. Inspected strike and dive/landing poses plus 960×600 and 390×480 scene framing. These previews validate geometry/contact/composition but do not validate WebGL shaders, frame rate or phone interaction.

The hosted browser failed to create WebGL on the unchanged commit preview (`3950f9c`), and blocked access to the local Vite server. A successful WebGL/device smoke test is therefore still a release gate. Do not treat green unit/CI checks as proof of lifelike animation or claim a completed live-device visual check.

## Local verification

- Both legacy and Vite production builds passed.
- 150 Vitest files / 1,134 tests passed (`--maxWorkers=1`, unchanged test timeouts).
- Eight new animation contracts cover contact, approach motion, initial ball velocity, mirrored saves, deterministic replay, ground clearance/held catches and 1,000-step joint continuity.
- UI emoji audit and standard 3,000-match balance envelope passed. Final lint, accent and pinned workflow checks are recorded in the PR handoff.
- The existing large-main-chunk Vite warning remains; new renderer/character code is lazy. No browser/E2E suite was added.
- CI and Cloudflare status must be checked on the pushed commit separately; live WebGL/device approval remains outstanding as described above.


## Penalty presentation workshop — 7 September 2026

Scope: PR #35 Pitch only. Watch Match stays text-first; polish the existing penalty scene before extending the visual treatment to more scenarios.

- Shared live/POC commentary reader uses existing typography and theme tokens, readable action/detail hierarchy and the existing authoritative goal-notice gate. Removed the retired hidden player/ball DOM; score, possession and match controls stay in MatchScreen.
- Shot presentation reuses match kit clash resolution, contrast-aware numbers and team-side mapping. Explicit shirt numbers are supported, with stable presentation defaults where squad numbers do not exist. Appearance metadata never changes persisted moments.
- Original generated collars, cuffs and chest panels; boots follow solved toes and gloves follow forearms. Monotone motion interpolation carries velocity through intermediate poses while retaining flat planted-foot intervals.
- Instanced seats/crowd, end canopy, side terraces, original signage and penalty arc give the goal a fuller stadium setting. No asset downloads, dependencies or manual modelling workflow added.
- Existing POC now starts with penalties and supports same-result replay, pause, quarter/half speed, timeline scrubbing, a 390px inspection container, white-kit comparison and shared broadcast examples. Reduced-motion users can inspect frames manually without autoplay.

Review: checked the working diff for authority boundaries, team-side/white-kit handling, seek/replay determinism, attachment orientation and disposal. Fixed a front-facing chest panel orientation issue during review. No match outcome, save format or career progression changes.

Verification: 150 Vitest files / 1,149 tests (single worker, unchanged timeouts), UI emoji audit, standard and deep balance checks, accent checks, lint and production build. Offline renders inspected actual Three.js skinning and camera composition at approach, strike and save, including 960×600 and 390×390 frames. A parallel full-suite rerun hit the existing statistical regression test’s five-second timeout; the final run uses one worker without relaxing the gate. Expanded stage geometry is about 75k visible triangles in that inspection (previously 12k); it uses instancing but requires device performance measurement.

Remaining visual gate: hosted browser cannot create WebGL and blocks the local Vite origin. Software renders do not verify GPU lighting, textures, shadows, frame rate or a physical phone. The 390px POC container is a layout inspection aid, not device certification. This is a reviewable first presentation pass, not a claim of lifelike motion or release approval. Validate the deployed penalty on a WebGL-capable phone and desktop before accepting the final visual quality.
