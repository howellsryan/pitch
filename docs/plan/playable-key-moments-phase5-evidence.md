# Playable Key Moments — Phase 5 completion evidence

**Programme:** Playable Key Moments  
**Phase:** 5 — Final pass, cutback, cross and rebound  
**Branch:** `feat/playable-key-moments-phase5`  
**Base:** `feat/playable-key-moments-phase4`  
**Implementation verification head:** `e34f33675aba433c265122da28df781e0d4c7f0f`  
**Build and validate workflow:** `34016670904`  
**Agent workflows run:** `34016670815`

## Delivery status

Phase 5 is complete for the continuation interactions that can be represented safely by the current one-pending-moment career/session model:

- final pass,
- through ball,
- cutback,
- cross,
- deterministic pre-outcome continuation geometry,
- bounded player input for target, weight and timing,
- engine-authorized passer, receiver and interceptor,
- one authoritative downstream automatic shot where the continuation creates a chance,
- dedicated lazy Three.js continuation presentation,
- accessible tap/keyboard fallback plus Simulate,
- deterministic Phase 5 calibration,
- exact automatic-football compatibility with the Phase 4 resolver path.

A playable rebound/second-ball interaction is **not shipped in Phase 5**. This is an intentional safety decision, documented below, rather than a cosmetic or presentation-only implementation.

## Authority and versioning

Phase 5 keeps the existing match engine as the only football authority.

- Match action resolver: **v4**
- Playable moment: **v2**
- Playable intent: **v2**
- Continuation action: **v1**
- Continuation intent: **v1**
- RNG packet: **v1**, unchanged **14-value** allocation
- One match phase remains one authoritative phase.

The continuation domain owns:

- passer,
- the route-selected receiver,
- interceptor,
- authorized target area,
- continuation family,
- baseline success context,
- downstream chance probability/xG context.

Presentation may submit only:

- `targetX`,
- `targetY`,
- `weight`,
- `timing`.

It cannot submit or replace a receiver, create an extra possession, choose the downstream shooter, decide a chance, or decide a finish.

## Continuation families

### Through ball

`pass_into_space` can expose a `through_ball` continuation. The route target remains the sole authorized receiver in v1.

### Final pass

`direct_pass` can expose a `final_pass` continuation using the same continuation authority/resolver contract.

### Cutback and cross

`wide_delivery` is deterministically projected into either a `cutback` or `cross` from pre-outcome context. They use distinct geometry and calibration while sharing the same authoritative continuation contract.

Phase 5 does **not** add headers or volleys to a cross. Those remain Phase 6 mechanics and must receive their own authoritative contact semantics and calibration.

## Prepare → resolve → commit behaviour

For continuation-eligible phases, `prepareAuthoritativePhase()` stops before pass execution/chance/finish authority and may expose a pending continuation.

The prepared continuation stores only the upstream information required to reproduce the automatic path. It does not persist the would-have-been automatic pass result, shot result or finish.

### Automatic / null-intent path

A key Phase 5 correction was restoring the exact Phase 4 automatic semantics.

When a continuation is not played, the resolver reconstructs the Phase 4 success, chance, xG, shooter, pressure defender and set-piece decisions from the same fixed packet and saved upstream tactical/role context. The automatic ledger therefore remains Phase 4-shaped and contains no Phase 5 continuation metadata.

This prevents the optional playable feature from silently retuning Quick Sim, ordinary Broadcast or Simulate behaviour.

When the user presses **Simulate** on an already-pending continuation, the career runtime creates a non-ledger `presentationOnly` continuation reveal from that authoritative automatic result. This lets the overlay truthfully display outcomes such as PASS COMPLETE, CHANCE CREATED, INTERCEPTED or CLEARED without altering stats, balance or persistence authority.

### Played path

When the user actually plays the continuation, the Phase 5 continuation resolver combines:

- canonical passer quality,
- canonical receiver quality,
- canonical defender quality,
- fixed phase packet,
- bounded normalized input.

A successful continuation may authorize one downstream automatic shot for the domain-selected receiver. A failed continuation does not manufacture a chance.

The renderer never decides the official result.

## Rebound / second-ball decision

The action vocabulary already contains `second_ball`, but the current persisted Play Key Moments lifecycle supports one durable pending interaction followed by an immediate atomic commit/receipt.

A genuine playable rebound after a saved or blocked first shot requires all of the following to be authoritative and reload-safe:

1. resolve and durably record the first shot,
2. keep the same match phase open,
3. create a second versioned pending interaction only after the saved/blocked outcome is known,
4. persist that second stage before enabling input,
5. prevent refresh rerolls and duplicate submits across both stages,
6. define two-shot ledger/stat semantics inside one phase,
7. make stage transitions and receipts idempotent and atomic.

Adding that safely requires a versioned multi-stage pending/session/receipt model plus explicit multi-shot ledger semantics. Forcing it into the current one-pending model would either leak the first-shot outcome before it exists, double-commit a phase, or reduce the rebound to presentation-only football.

Accordingly, Phase 5 deliberately ships **no playable or cosmetic rebound**. A future staged-continuation slice may use the existing `second_ball` vocabulary once the persistence and ledger contracts are extended first.

This follows the Phase 5 plan-gate rule: implement a genuine rebound only if the current lifecycle supports it safely; otherwise document the concrete invariant rather than fake the feature.

## Presentation and input

Phase 5 adds `src/game/playableMomentsContinuationRenderer.js`, loaded only when a continuation interaction is presented.

The scene contains only the engine-authorized:

- passer,
- receiver,
- interceptor,
- ball,
- target area.

Pointer/touch mapping returns normalized target coordinates. The overlay derives weight and timing from the bounded gesture. Accessible controls expose the same target/weight/timing contract.

The continuation result screen reports only what the continuation scene actually presents — for example CHANCE CREATED, PASS COMPLETE, INTERCEPTED or CLEARED. It does not display a downstream GOAL/SAVED result over a scene that never animated that shot. The committed downstream action remains available to the normal match/Broadcast presentation when play continues.

Renderer failure uses **Simulate on the same saved pending moment**; it does not manufacture a fallback football result.

Reduced-motion support and the repository 44px touch-target floor remain intact.

## Build boundary

The successful production Vite build emitted the continuation renderer as a separate lazy chunk:

- `playableMomentsContinuationRenderer-*.js`: **4.51 kB minified / 2.05 kB gzip**
- existing shot renderer: **10.65 kB / 3.85 kB gzip**

The continuation renderer is therefore not part of the initial playable app chunk request path.

The main application chunk remains large (`~1,383.93 kB` minified / `~422.93 kB` gzip) and still triggers the pre-existing Vite >500 kB warning. Phase 5 does not claim to solve that broader bundle-size issue.

## Phase 5 calibration

`src/modules/playableMomentsPhase5Calibration.test.js` adds a deterministic seven-test matrix across reproducible packet grids.

It verifies:

- poor < average < strong < near-perfect user execution ordering for all four continuation families,
- stronger passer/receiver quality remains materially better for identical input,
- stronger interception context suppresses the same attacker/input,
- cutbacks are higher-value than crosses,
- crosses do not invent Phase 6 header/volley semantics.

All seven tests pass on the verified implementation head.

## Automatic compatibility and regression evidence

### Unit/integration suite

`npm run test` on `e34f33675aba433c265122da28df781e0d4c7f0f`:

- **126 test files passed**
- **981 tests passed**
- UI emoji audit passed

### 3,000-simulation standard balance gate

**PASS** with the unchanged gate.

Representative neutral distribution:

- goals / match: **2.067**
- shots / match: **13.543**
- xG / match: **2.098**

These values match the Phase 4 automatic baseline.

### 5,000-simulation T7 deep guardrail

**PASS** with no threshold changes.

- **25 scenarios × 100 paired seeds = 5,000 simulations**
- **0 seed mismatches**

Important restored tactical relationships include:

- Pass into space vs high line: Δ points **+0.190**, Δ shots **+0.810**
- Pass into space vs low line: Δ points **+0.150**, Δ shots **+0.320**
- Run at defence vs compact block: Δ points **+0.020**, Δ shots **+0.030**
- Wide attack vs narrow defence: Δ points **+0.020**, Δ shots **+0.770**
- Wide attack vs wide defence: Δ points **-0.150**, Δ shots **+0.680**
- Work into box vs balanced: Δ points **+0.200**, Δ shots **-1.100**
- Shoot on sight vs balanced: Δ points **0.000**, Δ shots **+0.770**
- Counter-press vs patient build-up: Δ points **+0.220**, Δ shots **+0.980**

The deep guardrail initially detected Phase 5 automatic-football drift. The implementation was corrected to preserve the Phase 4 null-intent resolver semantics; the guardrail was **not** weakened.

### Other repository gates

The same successful workflow also passed:

- `npm run build:legacy`
- `npm run build:app`
- `npm run lint`
- `npm run check:accents` — **181 clubs, 0 failures**
- locked Agent workflows.

## Verification limitations

No browser E2E suite was added or run, consistent with repository policy.

The automated evidence above proves source contracts, production builds, deterministic authority, persistence integration and balance. This phase has **not** been claimed as manually verified on a physical mobile device or through a human visual-quality pass of the deployed Cloudflare preview in this implementation session. Those checks should be treated as manual review evidence, not inferred from CI.

## Phase 5 exit assessment

Phase 5 is ready for review when this evidence-only documentation commit itself passes the repository gates.

Delivered:

- final pass / through ball,
- cutback / cross,
- authoritative bounded interaction,
- one downstream automatic shot,
- dedicated lazy 3D continuation presentation,
- accessible fallback and Simulate path,
- automatic Phase 4 compatibility,
- deterministic calibration,
- full standard and deep balance regression evidence.

Explicitly deferred rather than faked:

- playable rebound / second ball, pending a versioned multi-stage pending/session/receipt and multi-shot ledger contract.

Phase 6 can therefore start from a stable continuation foundation and focus on new contact semantics (headers, volleys and broader goalkeeper saves) rather than reopening Phase 5 authority boundaries.
