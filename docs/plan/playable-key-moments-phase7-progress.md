# Playable Key Moments — Phase 7 Progress

## Status

Phase 7 implementation is complete on `feat/playable-key-moments-phase7`. The Phase 7 plan gate remains authoritative for scope. The PR stays Draft until the latest pushed SHA passes the repository verification workflows.

No Phase 8 work is included.

## 7A — authoritative shootout domain

Implemented:

- versioned shootout state and kick receipts;
- explicitly supplied final eligible participant snapshots;
- deterministic outfield taker ranking and goalkeeper identity;
- deterministic per-kick packet derived separately from regulation-match RNG;
- alternating normal kicks with five-per-team mathematical early conclusion;
- paired sudden-death rules and deterministic taker cycling;
- idempotent duplicate-kick commit protection;
- corruption checks for kick order, participant order and derived winner state;
- automatic resolution delegated to the existing Phase 4 `resolvePenaltyOutcome`;
- shared penalty geometry for playable shootout kicks;
- compact completed shootout summaries that omit player snapshots and presentation payloads;
- legacy bundle registration.

## 7B — automatic competition integration

Implemented:

- newly-created knockout events opt into the versioned shootout path while legacy/unversioned pending events stay on their legacy resolver boundary;
- single-leg domestic knockout ties resolve through the authoritative per-kick shootout domain;
- tied two-leg UEFA knockout paths use aggregate score first and only start a shootout when the aggregate remains level;
- watched and quick-sim competition paths consume the same shootout authority;
- the real final XI after substitutions and current fitness is projected into the shootout participant snapshot;
- completed shootout summaries are persisted with the existing cup result shape;
- progression reads the committed winner and advances exactly once;
- fixture/team identity guards reject a committed shootout that does not belong to the exact knockout event.

## 7C — managed playable shootouts

Implemented:

- the existing pending cup event owns the durable shootout session; no second event queue or match lifecycle exists;
- the exact next kick and deterministic packet are persisted before presentation;
- managed-team kicks use attacking penalty input and opponent kicks use goalkeeper input through the existing playable-moment overlay;
- resolving a kick creates a durable committed receipt before the next kick can be exposed;
- acknowledgement is presentation-only and prepares the deterministic next kick;
- refresh/restoration cannot reroll an already-persisted kick packet;
- simulate/fallback resolves the same saved kick instead of drawing another packet;
- a corrupted restored packet is rejected rather than silently regenerated;
- a kick-by-kick session converges on the same winner as the automatic shootout domain.

## Attached live-match revisions delivered with Phase 7

The requested live-match/playable-moment corrections were folded into this branch without weakening the one-engine authority boundary:

1. **Continuous 90-second regulation presentation** — one start action, 120 authoritative phases at 750 ms per phase, no live speed selector or multiplier.
2. **Playable-moment event policy** — generic caution/interception/dispossession-style incidents are no longer surfaced as playable interruptions; playable selection is restricted to shooting opportunities and explicit supported set-piece/shot interactions.
3. **Broadcast/engine synchronisation** — the next authoritative phase waits until the previous broadcast ledger scene is ready, keeping scoreboard minute, commentary and pitch presentation on the same phase boundary.
4. **Mobile live tactics rebuild** — full-height scrollable tactics sheet with separate Shape/Subs/Instructions sections, non-clipping formation/mentality controls, readable pitch labels and an expandable bench area.
5. **Slot-safe direct substitutions** — tactical slot ownership is preserved independently of player identity, including direct, out-of-position and repeated replacements; regression coverage protects the slot mapping.
6. **Football stoppage-time clock** — period-aware `45+N` / `90+N` presentation with correct half-time/full-time boundaries instead of raw 46/47-style first-half continuation.
7. **Attacking 3D response** — the existing Three.js renderer keeps the opponent goalkeeper present, animates the attacker's approach/strike, launches the ball from the authoritative setup point and drives goalkeeper movement from the committed shot presentation rather than renderer-owned outcome logic.
8. **Goalkeeper pre-shot read** — goalkeeper moments are decorated with a deterministic pre-shot read cue derived from the already-authoritative kick/shot packet, giving reaction time without exposing or changing the outcome.
9. **Tactics rendering cleanup** — player labels use football positions/tactical slots, bench rows use player positions, and the cramped legacy marker treatment is no longer part of the rebuilt sheet.

A Phase 7 shot-motion regression test additionally locks the attacking strike/ball-release sequence and verifies that the goalkeeper stays set before contact and reacts only after release toward the authoritative keeper plan.

## Verification evidence

Before the final evidence/test commit, head `47b2e76c538d243205b0d6bc59003f111b018115` passed both PR workflow suites:

- `Agent workflows` — success;
- `Build and validate` — success.

The final pushed SHA must pass those same repository gates before the PR is promoted from Draft. Browser/E2E automation is intentionally not introduced by Phase 7, in accordance with repository rules; rendered mobile/3D presentation should still receive normal preview smoke-checking before merge.

## Phase 7 acceptance

Phase 7 is implementation-complete when the final SHA is green and the preview smoke-check confirms the presentation-only items above. The competition/shootout authority, persistence, refresh safety and live-match behavioural corrections are protected by unit/source-contract coverage on this branch.
