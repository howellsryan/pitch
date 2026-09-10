# Playable Key Moments — Phase 5 plan gate

## Goal

Add authoritative continuation actions that can create a downstream chance: final pass/through ball first, then cutback, cross, and finally a genuine rebound/second-ball continuation where the existing action vocabulary can represent it.

The renderer remains presentation only. No pass, receiver, interception, rebound, corner, shot, scorer, possession or restart may be invented by Three.js.

## Scope fence

### In scope

1. final pass / through ball into space;
2. cutback;
3. cross;
4. rebound / second ball only through a post-shot authoritative continuation;
5. automatic/null-intent behavior before playable behavior for each family;
6. one authoritative phase and one fixed 14-field RNG packet;
7. versioned continuation intent, geometry, result and ledger semantics;
8. downstream automatic shot at minimum; chained playable shot only if it can reuse the existing pending-session lifecycle without a second fixture/match engine;
9. dedicated calibration for passer/user/receiver/defender quality and downstream goal impact.

### Out of scope

- continuous locomotion;
- arbitrary receiver switching in v1;
- presentation-created offside lines or runners;
- corners as a new playable family;
- headers/volleys (Phase 6);
- shootouts (Phase 7);
- a second database, fixture queue, phase counter or match engine;
- widening T7 balance gates merely to get green.

## Architecture decision

Phase 5 extends the existing prepared-phase continuation rather than introducing a second match phase.

```text
allocate existing 14-field phase packet once
  -> choose route / actor / receiver / defender
  -> derive eligible continuation family from pre-outcome context
       |
       +-- automatic / not selected
       |      -> resolve continuation from same packet
       |      -> if authoritative chance created, resolve downstream shot
       |
       +-- selected
              -> persist existing pending phase continuation
              -> normalized continuation intent
              -> resolve continuation from same packet
              -> if authoritative chance created, resolve downstream shot
  -> write one coherent phase record
  -> remaining phase effects once
  -> next phase
```

The first implementation slice must not require a new persisted pending/session lifecycle: `simulateMatchSegment()` already suspends a prepared phase before `commitAuthoritativePhase()`, and resuming that phase already applies discipline/injury/substitution work exactly once.

## Final-pass v1 contract

The existing route actor and route target are authoritative. V1 does not let presentation choose an arbitrary teammate; the route target is the only authorized receiver and is treated as onside/eligible by this domain version because the current match engine has no independent authoritative pitch-position/offside-line state to expose safely.

A final-pass continuation owns:

- version and family (`final_pass` / `through_ball`);
- source route;
- passer;
- fixed authorized receiver;
- interceptor/pressure defender;
- deterministic pre-outcome target zone and scene geometry;
- baseline pass success chance;
- downstream chance probability and projected xG;
- success/failure consequences.

Normalized playable intent owns only execution semantics such as target point, weight and timing. It never supplies an official result or arbitrary player ID.

Automatic/null-intent resolution uses the existing fixed packet. Interactive resolution combines the same packet/context with canonical passing, receiver and defensive attributes plus bounded user execution.

A successful continuation may create one downstream authoritative shot. A failed continuation produces the authoritative interception/turnover and no shot.

## Cutback and cross

After final-pass parity is proven, `wide_delivery` may project to `cutback` or `cross` from pre-outcome context. They reuse the same continuation contract but have different authorized geometry, execution/counter weighting, downstream xG/calibration and failure consequences.

No header/volley contact type is introduced in Phase 5; any downstream shot remains the existing ground/general shot resolver until Phase 6 owns aerial contact semantics.

## Rebound / second ball

The action vocabulary already contains `second_ball`, but a rebound cannot be offered before a shot is resolved without leaking whether the shot was saved/blocked.

Therefore rebound is deliberately a later Phase 5 sub-slice with a post-shot authoritative continuation seam:

- first shot resolves authoritatively;
- only an eligible saved/blocked result may derive a versioned `second_ball` continuation;
- the phase remains open but not double-counted;
- the pending state must preserve the first shot result durably before accepting second-ball input;
- a second shot, if created, must be represented explicitly in ledger/stats rather than overwriting the first shot.

If that cannot be done through the existing session/receipt contract without result reroll or duplicate phase effects, Phase 5 must extend the versioned continuation/session state rather than fake the rebound in presentation.

## Versioning

Authoritative continuation behavior changes the football model, so the action-resolver simulation version must advance. The fixed RNG packet remains version 1 and exactly 14 fields.

If the playable intent/moment schema is widened to contain continuation input, its version must advance so already-started sessions cannot be silently reinterpreted.

## Required tests

### Domain

- eligibility does not inspect `packet.shot`, `packet.finish` or a would-have-been automatic result;
- actor/receiver/defender IDs are domain-owned;
- arbitrary receiver IDs in input are impossible/ignored/rejected;
- automatic resolution deterministic from existing packet;
- stronger passer/receiver context improves success;
- stronger interceptor reduces success;
- poor/average/strong/near-perfect user execution is ordered;
- failure creates no downstream shot;
- success can create exactly one authorized downstream shot.

### Match integration

- whole vs segmented automatic parity;
- suspend -> null-intent resume matches automatic for a real continuation phase;
- interactive success/failure commits one phase once;
- no duplicate fatigue/discipline/injury/substitution/ledger writes;
- stats and assists remain coherent;
- fixed RNG cursor/packet unchanged.

### Presentation

- scene consumes domain geometry and actor IDs;
- input returns normalized continuation intent only;
- renderer cannot manufacture a receiver/chance/result;
- Simulate resolves the same saved pending continuation;
- 44 px touch controls and reduced-motion/fallback behavior remain.

### Calibration / regression

- Phase 5-specific paired calibration for user skill, passer quality, receiver context, defender context and downstream goal impact;
- standard 3,000-simulation gate unchanged;
- deep 5,000-simulation T7 guardrail unchanged;
- build, lint, accent, skill-lock and Cloudflare checks green.

## Exit criteria

Phase 5 is complete only when:

- final pass/through ball, cutback and cross are playable authoritative continuation families;
- a genuine rebound/second-ball path is either implemented through explicit post-shot authority or documented as blocked by a concrete session/ledger invariant rather than simulated cosmetically;
- at least one continuation family demonstrably produces a downstream authoritative shot;
- failures are represented as carefully as successes;
- one phase / one packet / exactly-once lifecycle remains intact;
- stats/ledger/assist semantics are coherent;
- all repository and Phase 5 calibration gates are green;
- deployed preview is available for manual mobile/wide visual inspection.
