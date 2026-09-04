# Attribute-to-Tactics Causality 2.0 — implementation status

**Updated:** 4 September 2026

**Design source:** [`attribute-to-tactics-causality-2.md`](./attribute-to-tactics-causality-2.md)

This file is the short execution ledger for the workstream. The design document remains the source for target behaviour, weights, trade-offs and later phases; use this status file to determine what is already implemented before starting the next phase.

## Current status

| Phase | Status | Shipped boundary |
|---|---|---|
| **T0 — Baseline and calibration harness** | ✅ Complete | Frozen aggregate-engine balance report, paired-seed tactic comparisons, golden `npm test` check and action/event vocabulary. |
| **T1 — Detailed attribute data and player-model migration** | ✅ Complete | Versioned PAC/SHO/PAS/DRI/DEF/PHY profile is durable across import, generated data, fresh careers, existing-career migration, youth/newgens, development/decline and scouting masking. Match outcomes remain unchanged. |
| **T2 — Roles and tactical-fit projection in shadow mode** | ✅ Complete | Pure action-oriented role participation, lineup action strengths/counters, tactic-driven route usage and matchup vulnerabilities are computed in `tacticalProjection.js` without becoming authoritative match state. |
| **T3 — Authoritative action ledger foundation** | ⏭️ Next | Introduce the seeded authoritative action/phase ledger and begin routing match resolution through it while preserving Quick Sim/Broadcast parity. |

## T1 contract

`src/modules/playerModel.js` now owns player-model version **5** and `attributeProfile.version = 1`:

```js
attributeProfile: {
  version: 1,
  pace,
  shooting,
  passing,
  dribbling,
  defending,
  physical,
}
```

The existing `attack`, `midfield`, `defence` and `goalkeeping` fields remain compatibility/headline ratings. Current selection, valuation and match resolution continue to use the established compatibility boundary until a later activation phase deliberately migrates them.

Migration rules implemented in T1:

1. A saved player with a stable ID matching current seed data inherits the seed profile shape, rescaled around the saved career's current headline level.
2. Unmatched legacy players receive a deterministic position/archetype profile derived from their saved ratings and stable identity.
3. Generated youth/newgens receive a deterministic coherent profile through canonical player normalization.
4. Existing headline ratings, potential, progress, state, ownership, loans, contracts, history, formation and lineup are preserved.
5. `PLAYER_MODEL_VERSION` gates the one-time scan; no IndexedDB `DB_VERSION` bump was required.

The FC27 refresh now persists the six detailed columns, rejects incomplete non-goalkeeper source rows and records detailed-attribute coverage/distributions in its audit report. Legacy CSV rows remain readable so landing the domain contract does not require a destructive roster rewrite.

## T2 shadow boundary

`src/modules/tacticalProjection.js` is deliberately **not imported by `matchEngine.js`** and is not part of the authoritative legacy runtime path.

It currently provides:

- the T0 action vocabulary (`circulation`, `direct_pass`, `pass_into_space`, `carry`, `wide_delivery`, `aerial_duel`, `shot`, `high_press`, `interception_tackle`, `recovery_defence`, `attacking_set_piece`);
- action-specific detailed-attribute execution and counter weights;
- role-to-action participation weights where roles decide who is involved, not a second quality multiplier;
- tactic-driven action usage so instructions alter what a team tries rather than universally boosting quality;
- opponent-context edges such as pace/passing into a high line, wide delivery against narrow defending and carries being harder into a compact block;
- lineup strengths/vulnerabilities and contributor explanations;
- a diagnostic wrapper that keeps the authoritative match result by reference and stores shadow output separately.

T2 regression coverage proves, among other cases:

- pace improves runs into space without directly improving shooting;
- shooting improves shot execution;
- dribbling improves carries;
- pace/defending improve high-line recovery;
- direct/counter football increases vertical route usage while patient football increases circulation;
- high lines, compact blocks and narrow defending expose football-shaped matchup differences;
- generating the shadow projection does not mutate inputs or alter a seeded authoritative result.

## Frozen authority rules before T3

Until T3 deliberately changes them:

- `src/modules/matchEngine.js` remains the sole football-outcome engine;
- `src/modules/tactics.js`'s current aggregate `roleSuitability()`, role modifiers and tactical modifiers remain authoritative;
- Quick Sim and Broadcast must continue to resolve the same seeded result;
- T2 shadow ratings must not influence score, xG, shots, possession, cards, injuries, fitness, substitutions or Broadcast events;
- the T0 golden balance report must remain unchanged.

## Verification

T1 completed on PR #28 SHA `ca2d22ca61f14c7ea09c67284dd081429e72dca1` with the complete GitHub Actions build/validate job green.

T2 completed on PR #28 SHA `489f2345446a8f4d5cae8da030a1fa3fc3050a76` after one fixture-isolation correction, with the complete GitHub Actions build/validate job green:

- legacy build / deterministic validator ✅
- Vite production build ✅
- ESLint ✅
- full Vitest suite + UI emoji audit + T0 golden balance check ✅
- club accent audit ✅

No browser/UI surface changed in T1 or T2, so no rendered screenshot verification was applicable.

## Next phase — T3

T3 should start from the existing T0 vocabulary and T2 projection contracts rather than inventing another football model. Its key job is to turn the shadow concepts into one seeded authoritative phase/action ledger while maintaining exact Quick Sim/Broadcast parity and a controlled comparison against the frozen T0 statistical envelope.
