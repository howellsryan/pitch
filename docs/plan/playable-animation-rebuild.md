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
