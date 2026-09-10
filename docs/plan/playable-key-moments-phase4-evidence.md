# Playable Key Moments — Phase 4 set-piece evidence

> This file records implementation and verification evidence for Phase 4 only. It does not expand the scope in `docs/plan/playable-key-moments-roadmap.md`.

## Scope fence

Phase 4 adds authoritative penalties and direct free kicks to the existing match engine and Play Key Moments continuation. It does **not** add indirect free kicks, corners as playable actions, final passes, cutbacks, crosses, rebounds, headers/volleys, shootouts, continuous locomotion, a second match engine, a second fixture lifecycle or a new persistence store.

## Verified runtime head

`0a66fc3e89021209499b8f955e85d0897ccae0be`

## Delivered authoritative set-piece contract

Phase 4 introduces a small pure set-piece domain around the existing action resolver rather than a parallel match engine.

A qualifying existing `foul_won` phase may now own a nested, versioned set-piece contract before terminal finish resolution.

### Penalties

The authoritative contract owns:

- award reason and attacking/defending teams
- taker and goalkeeper
- fixed 11 m goal-facing geometry
- dedicated penalty xG
- dedicated automatic and interactive resolution
- explicit restart semantics
- no defensive wall

### Direct free kicks

The authoritative contract owns:

- award reason and attacking/defending teams
- taker and goalkeeper
- deterministic shooting-range distance and channel
- direct-attempt eligibility
- dedicated free-kick xG
- authoritative 2–5 player wall
- wall participants, spacing and coordinates
- dedicated automatic and interactive resolution
- blocked/saved/missed/goal restart semantics

The Three.js renderer consumes the wall and scene geometry supplied by the domain. It does not choose the wall, invent participants or determine the result.

## Authority invariants

- Set-piece eligibility is derived before finish and never inspects `packet.shot` or `packet.finish`.
- The fixed match RNG packet remains exactly 14 fields and version 1; Phase 4 adds no random draws.
- The action resolver version advances from 2 to 3 because authoritative football outcomes change. Started matches cannot silently resume under the new semantics.
- A set piece remains one authoritative phase. The ledger stores one `foul_won` record with one shot, one xG value, one terminal finish and one restart rather than creating a phantom second phase.
- Penalties and direct free kicks use dedicated calibrated resolution paths rather than reusing the open-play block/xG model.
- Automatic/null-intent resolution and interactive resolution use the same prepared set-piece contract and fixed packet.
- `buildPlayableMoment()` projects the domain-owned contract into the existing persisted continuation. No new database, queue, fixture lifecycle or save store was introduced.
- The existing idempotent pending/commit/reveal lifecycle remains the persistence authority.
- A penalty explicitly has no fallback defender in presentation.
- A blocked direct free kick identifies an authoritative wall `blockerId`; renderer wall animation and ball contact use that same member.
- No curl attribute or hidden free-kick control was invented.

## Playable presentation

The existing Play Key Moments overlay now identifies the actual set-piece situation:

- Take Penalty / Face Penalty
- Take Free Kick / Defend Free Kick

The same bounded accessible input surface remains in place for touch/mouse/keyboard and Simulate fallback.

For direct free kicks, the renderer displays the authoritative wall at the domain-provided coordinates. For penalties, the normal open-play defender proxy is hidden.

## TDD and integration evidence

Phase 4 was delivered through observed RED → GREEN slices:

1. **Set-piece domain RED:** six new contracts failed because authoritative penalty/free-kick functions did not exist while the existing 937 tests remained green.
2. **Resolver integration GREEN:** the set-piece domain was wired through the existing resolver with action-resolver version 3 and fixed RNG packet version 1.
3. **Match-engine parity:** seeded tests deliberately find real set-piece phases and verify whole-match versus one-phase segmentation produces identical ledger, goals and RNG state.
4. **Continuation parity:** a real set-piece phase can suspend before finish and null-intent resume produces the same authoritative record and RNG state as automatic simulation.
5. **Both-family coverage:** the strengthened integration search must encounter and exercise both an actual penalty and an actual direct free kick.
6. **Presentation ownership:** source contracts verify penalties hide the fallback defender, free-kick walls come from authoritative geometry, and blocked contact follows the authoritative blocker.

## Calibration evidence

`src/modules/playableMomentsPhase4Calibration.test.js` covers eight set-piece-specific relationships, including:

- automatic penalty and direct-free-kick outcome envelopes
- stronger taker quality improving attacking outcomes
- stronger goalkeeper quality improving defensive outcomes
- interactive execution/timing ordering
- goalkeeper reach ordering
- wall vulnerability and block behavior

These checks remain separate from the existing open-play balance gates.

## Automated verification

Runtime head `0a66fc3e89021209499b8f955e85d0897ccae0be`:

- legacy build + deterministic replacement contracts: **PASS**
- Vite production build: **PASS**
- lint: **PASS**
- Vitest: **122 files / 957 tests PASS**
- Phase 4 calibration: **8/8 PASS**
- Phase 4 set-piece integration: **3/3 PASS**, including both penalty and direct-free-kick seeded coverage
- UI emoji audit: **44 source files / 0 violations**
- standard match balance: **3,000 simulations PASS**
- deep T7 guardrail: **5,000 simulations PASS**, zero seed mismatches in every reported scenario
- club accent audit: **181 clubs / 0 failures**
- locked agent-skills check: **PASS**
- Cloudflare Workers build: **PASS**

The standard neutral distribution after real set pieces is 2.067 goals/match, 13.543 shots/match, 5.123 shots on target/match and 2.098 xG/match; all remain inside the unchanged reviewed guardrail.

Production build keeps the playable renderer lazy. The Phase 4 Three.js renderer chunk is approximately 10.65 kB (3.85 kB gzip); no paid asset or editor dependency was added.

The legacy build's only duplicate-function warning remains the pre-existing `slotEligible` duplicate. Phase 4 introduced no new duplicate helper names.

## Preview

Branch alias:

`https://feat-playable-key-moments-phase4-pitch.rlh.workers.dev`

Verified runtime version:

`https://3320cc20-pitch.rlh.workers.dev`

## Manual gate still required

The repository deliberately has no browser/E2E suite. CI and source review do not prove game feel. Before Phase 4 is treated as visually approved, inspect the deployed build on mobile and wide browser sizes and judge:

- penalty camera/framing and absence of a phantom defender
- free-kick wall spacing and channel readability
- blocked wall contact alignment
- goalkeeper interaction for both set-piece families
- touch aim feel at penalty and 18–28 m free-kick distances
- accessible tap/keyboard controls
- Simulate fallback and transition back to the live match

Any rendered/mobile claim remains unverified until that inspection is performed.

## Deferred beyond Phase 4

Phase 5 owns playable continuation actions that can create a downstream chance: final pass/through ball, cutback, cross and rebound. Headers/volleys, shootouts and broader presentation polish remain in their later roadmap phases and are intentionally absent from this PR.
