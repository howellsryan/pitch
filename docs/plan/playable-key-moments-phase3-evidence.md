# Playable Key Moments — Phase 3 staging evidence

> This file records implementation and verification evidence for Phase 3 only. It does not expand the scope in `docs/plan/playable-key-moments-roadmap.md`.

## Scope fence

Phase 3 broadens the existing Phase 2 terminal shot/goalkeeper interaction through authoritative staging variations. It does **not** add a new football action family, set pieces, final passes/cutbacks/crosses, rebounds, headers/volleys, shootouts, continuous locomotion, a second match engine, a second fixture lifecycle or a new persistence store.

## Verified runtime head

`704a53e3465f3b490f585b95577c44a18391e6d4`

## Delivered staging contract

`src/modules/matchActionResolver.js` now derives a versioned, deterministic pre-outcome staging projection before user input is accepted.

Representative variants:

- `central_snapshot`
- `left_channel_snapshot`
- `right_channel_snapshot`
- `edge_of_box_attempt`
- `close_range_attempt`
- `one_on_one_deep_keeper`
- `one_on_one_advancing_keeper`

The staging object owns:

- channel and channel band
- numeric distance and distance band
- pressure score and pressure level
- keeper starting-depth semantic and numeric keeper depth
- defender relationship
- staging variant/version

The playable geometry also explicitly declares the bounded legal actions (`aim`, `power`, `timing` for attack; `position`, `timing` for goalkeeper) and `continuousLocomotion:false`.

## Authority invariants

- The fixed match RNG packet remains exactly 14 fields; Phase 3 adds no draws and reallocates none.
- Staging is derived only from pre-finish chance context: xG, route, the pre-finish `target` packet value, and the already-selected pressure defender.
- Staging never inspects `packet.shot`, `packet.finish`, or the would-have-been automatic result.
- `resolveShotOutcome()` and the automatic/null-intent football path are unchanged.
- `resolveInteractiveShotOutcome()` is unchanged; Phase 3 varies the authorized situation, not the shot-resolution model.
- Scene coordinates are authored by the domain projection and consumed by the existing Three.js scene. The renderer does not infer a new football result or create a new chance.
- The existing renderer camera already frames from `world.distance`, so the different authorized distances produce different camera positions without a new renderer abstraction.
- No persistence schema/store/session-version change was required. Pending moments already persist complete geometry; Phase 3 only adds the staging variant to compact history for pacing.

## Pacing

The existing soft cap and minimum phase gap remain unchanged. Phase 3 adds one small diversity rule:

- repeating the same attack/goalkeeper mode retains the existing penalty;
- immediately repeating the same staging variant receives an additional small probability penalty;
- the deterministic selection roll is unchanged.

Old Phase 2 history entries without a staging variant remain valid and behave as `null`.

## TDD evidence

Phase 3 was delivered through observed RED → GREEN slices:

1. **Staging contract RED:** the original 901 tests remained green while five new Phase 3 tests failed because staging did not exist. Production staging was then added and the suite reached 906 green tests.
2. **Diversity pacing RED:** 906 tests remained green while exactly two new pacing/history tests failed. Variant history and repeated-variant pacing were added and the suite reached 908 green tests.
3. **Keeper-depth ownership RED:** the new contract failed because the staging projection calculated numeric keeper depth but the scene re-derived it. The numeric depth is now returned by staging and consumed directly by playable geometry.

## Representative calibration evidence

`src/modules/playableMomentsPhase3Calibration.test.js` covers seven representative staging situations. Across each representative situation it verifies:

- poor < average < strong < near-perfect attack execution quality;
- stronger shooter quality remains better for the same user input;
- higher defensive pressure increases placement error;
- stronger goalkeeper quality increases reachable save area.

The suite also verifies that all seven representative situations project to distinct world-geometry signatures through `sceneWorldFromMoment()`.

## Automated verification

Runtime head `704a53e3465f3b490f585b95577c44a18391e6d4`:

- legacy build + deterministic replacement contracts: **PASS**
- Vite production build: **PASS**
- lint: **PASS**
- Vitest: **119 files / 937 tests PASS**
- Phase 3 representative calibration: **29/29 PASS**
- UI emoji audit: **44 source files / 0 violations**
- standard match balance: **3,000 simulations PASS**
- deep T7 guardrail: **5,000 simulations PASS**, zero seed mismatches in every reported scenario
- club accent audit: **181 clubs / 0 failures**
- locked agent-skills check: **PASS**
- Cloudflare Workers build: **PASS**

Production-build evidence also shows the existing lazy Three.js renderer chunk remains separate at approximately 9.80 kB (3.49 kB gzip); Phase 3 adds no renderer dependency or asset payload.

## Preview

Branch alias:

`https://feat-playable-key-moments-phase3-pitch.rlh.workers.dev`

Verified runtime version:

`https://f002e458-pitch.rlh.workers.dev`

## Manual gate still required

The repository deliberately has no browser/E2E suite. CI and source review do not prove game feel. Before Phase 3 is treated as visually approved, inspect the deployed build on mobile and wide browser sizes and judge:

- central versus left/right channel readability;
- edge-of-box versus close-range camera/spacing;
- deep versus advancing keeper one-on-ones;
- low/high defender pressure staging;
- touch aim/keeper feel in the varied geometry;
- transitions back to the live match.

Any visual/mobile claim remains unverified until that rendered inspection is performed.

## Deferred beyond Phase 3

Phase 4 owns authoritative penalties and direct free kicks. Final passes/cutbacks/crosses/rebounds, headers/volleys, shootouts and presentation polish remain in their later roadmap phases and are intentionally absent from this PR.
