# Attribute-to-Tactics Causality 2.0 — implementation status

**Updated:** 4 September 2026

**Design source:** [`attribute-to-tactics-causality-2.md`](./attribute-to-tactics-causality-2.md)

This file is the short execution ledger for the workstream. The design document remains the source for target behaviour, weights, trade-offs and later phases; use this status file to determine what is already implemented before starting the next phase.

## Current status

| Phase | Status | Shipped boundary |
|---|---|---|
| **T0 — Baseline and calibration harness** | ✅ Complete | Frozen aggregate-engine balance report, paired-seed tactic comparisons, golden `npm test` check and action/event vocabulary. |
| **T1 — Detailed attribute data and player-model migration** | ✅ Complete | Versioned PAC/SHO/PAS/DRI/DEF/PHY profile is durable across import, generated data, fresh careers, existing-career migration, youth/newgens, development/decline and scouting masking. |
| **T2 — Roles and tactical-fit projection in shadow mode** | ✅ Complete | Pure action-oriented role participation, lineup action strengths/counters, tactic-driven route usage and matchup vulnerabilities are computed in `tacticalProjection.js`. |
| **T3 — Authoritative action ledger foundation** | ✅ Complete | One seeded fixed-packet action ledger is authoritative for football outcomes; tactics choose routes, roles choose actors and detailed attributes resolve actions against opponents while Quick Sim/Watch remain exactly identical. |
| **T4 — Tactics schema v2 and mobile UI** | ⏭️ Next | Add the priority-one instruction controls, versioned v1→v2 save migration, tactical fit/trade-off feedback and one shared pre-match/in-match command path. |

## T1 contract

`src/modules/playerModel.js` owns player-model version **5** and `attributeProfile.version = 1`:

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

The existing `attack`, `midfield`, `defence` and `goalkeeping` fields remain compatibility/headline ratings. T3 now consumes the six detailed attributes for action resolution while selection, valuation and other compatibility consumers retain the established headline boundary.

Migration rules implemented in T1:

1. A saved player with a stable ID matching current seed data inherits the seed profile shape, rescaled around the saved career's current headline level.
2. Unmatched legacy players receive a deterministic position/archetype profile derived from their saved ratings and stable identity.
3. Generated youth/newgens receive a deterministic coherent profile through canonical player normalization.
4. Existing headline ratings, potential, progress, state, ownership, loans, contracts, history, formation and lineup are preserved.
5. `PLAYER_MODEL_VERSION` gates the one-time scan; no IndexedDB `DB_VERSION` bump was required.

The FC27 refresh persists the six detailed columns, rejects incomplete non-goalkeeper source rows and records detailed-attribute coverage/distributions in its audit report. Legacy CSV rows remain readable so the domain contract does not require a destructive roster rewrite.

## T2 projection contract

`src/modules/tacticalProjection.js` provides the reusable action-oriented football model consumed by T3:

- the T0 action vocabulary (`circulation`, `direct_pass`, `pass_into_space`, `carry`, `wide_delivery`, `aerial_duel`, `shot`, `high_press`, `interception_tackle`, `recovery_defence`, `attacking_set_piece`);
- action-specific detailed-attribute execution and counter weights;
- role-to-action participation weights where roles decide who is involved, not a second quality multiplier;
- tactic-driven action usage so instructions alter what a team tries rather than universally boosting quality;
- opponent-context edges such as pace/passing into a high line, wide delivery against narrow defending and carries being harder into a compact block;
- lineup strengths/vulnerabilities and contributor explanations.

## T3 authoritative boundary

T3 replaces the aggregate score/stat synthesis for real matches with one versioned authoritative action ledger:

- every one of the 120 match phases consumes one fixed **14-value RNG packet** before any branch-specific logic;
- tactics/mentality/risk state choose route frequency rather than directly raising player ability;
- roles determine actor participation/frequency;
- Pace, Shooting, Passing, Dribbling, Defending and Physical resolve the selected action against the relevant opponent;
- balls into space split passer quality from runner Pace/Physical;
- defensive recovery/interception uses the opposing defender's detailed attributes;
- Shooting affects shot execution and conversion after chance creation rather than route selection;
- score, scorers, assists, shots, shots on target, xG, possession and corners derive from ledger records;
- legacy `goal`, `yellow`, `injury` and `sub` events remain the public Broadcast/world-projection compatibility stream;
- the full 120-record ledger remains transient live-match authority and is intentionally not copied into persisted historical competition records;
- cards, injuries, fitness, substitutions, live formation changes and mentality changes remain integrated with the same serialisable match state;
- Quick Sim and segmented Watch produce the exact same authoritative result at 1-, 7-, 10-, 30- and 120-phase segmentation.

T3 also activates the legacy module order `matchActionVocabulary` → `tacticalProjection` → `matchActionResolver` → `matchEngine` and removes the resulting private helper collision rather than allow-listing it.

## Frozen baseline and T3 calibration

The T0 benchmark remains historical evidence and is **not overwritten** by T3. `npm run balance:match:check` now compares the current action-ledger distribution with the frozen T0 snapshot and fails if the new engine leaves the reviewed football-like envelope.

Final T3 neutral distribution from 600 deterministic matches:

| Metric | T0 | T3 | Δ |
|---|---:|---:|---:|
| Goals / match | 2.718 | 1.973 | -0.745 |
| Home goal edge | +0.058 | +0.243 | +0.185 |
| Home points / match | 1.392 | 1.523 | +0.131 |
| Home possession | 49.888% | 49.835% | -0.053pp |
| Shots / match | 11.815 | 12.963 | +1.148 |
| Shots on target / match | 5.067 | 4.923 | -0.144 |
| xG / match | 1.477 | 1.952 | +0.475 |
| Yellow cards / match | 0.435 | 0.457 | +0.022 |
| Forward scorer share | 78.720% | 77.700% | -1.020pp |

Final T3 paired-seed tactic movement also remains inside guardrails:

- direct counter vs high line: **+0.220 GF**, **+0.207 xG**, **-3.190pp possession**;
- aggressive press vs patient build-up: **+0.300 GF**, **-0.097 GA**, **+10.060pp possession**;
- wide delivery vs narrow block: **+1.036 shots**, **+0.049 xG**;
- work ball vs balanced block: **-1.367 shots**, **-0.037 xG**, **+3.493pp possession**.

## Verification

T1 completed on PR #28 SHA `ca2d22ca61f14c7ea09c67284dd081429e72dca1` with the complete GitHub Actions build/validate job green.

T2 completed on PR #28 SHA `489f2345446a8f4d5cae8da030a1fa3fc3050a76` after one fixture-isolation correction, with the complete GitHub Actions build/validate job green.

T3 completed on PR #28 SHA `177eeddbb7cf2908059ac8a112d8c131691dea7b` with workflow run **#550** fully green:

- legacy build / deterministic validator ✅
- no unexpected concatenated-bundle duplicate functions ✅
- Vite production build ✅
- ESLint ✅
- **85 Vitest files / 683 tests** ✅
- T3 fixed-packet, detailed-attribute causality and ledger-authority contracts ✅
- exact Quick Sim/Watch parity at 1/7/10/30/120 phase segmentation ✅
- unchanged 600-match statistical regression ceiling: **3.056s < 5s** ✅
- UI emoji audit ✅
- 3,000-simulation T0→T3 balance comparison ✅
- club accent audit ✅
- Actions artifact upload ✅

No new rendered UI surface was introduced by T3, so rendered breakpoint verification was not applicable.

## Next phase — T4

T4 now owns the first player-facing expansion of the system. It should extend the single normalized tactics schema rather than creating parallel pre-match/live models.

Priority-one controls from the design contract:

- **Use of Space:** To Feet / Mixed / Pass Into Space
- **Ball Carrying:** Dribble Less / Balanced / Run at Defence
- **Shot Selection:** Work Into Box / Balanced / Shoot on Sight
- **Defensive Transition:** Regroup / Balanced / Counter-press
- **Line of Engagement:** Low / Mid / High
- **Attacking Width:** Narrow / Balanced / Wide
- **Defensive Width:** Narrow / Balanced / Wide

T4 must increment the tactics-plan version and use a dedicated idempotent v1→v2 save migration. Existing explicit choices must be preserved; the historical P2 backfill must not be rewritten in place. Pre-match and in-match controls must resolve through one command path and the UI must surface squad-specific strengths, risks, lineup fit and conflict warnings without removing current functionality.
