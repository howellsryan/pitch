# Attribute-to-Tactics Causality 2.0 — implementation status

**Updated:** 5 September 2026

**Design source:** [`attribute-to-tactics-causality-2.md`](./attribute-to-tactics-causality-2.md)

This file is the short execution ledger for the workstream. The design document remains the source for target behaviour, weights, trade-offs and later phases; use this status file to determine what is already implemented before starting the next phase.

## Current status

| Phase | Status | Shipped boundary |
|---|---|---|
| **T0 — Baseline and calibration harness** | ✅ Complete | Frozen aggregate-engine balance report, paired-seed tactic comparisons, golden `npm test` check and action/event vocabulary. |
| **T1 — Detailed attribute data and player-model migration** | ✅ Complete | Versioned PAC/SHO/PAS/DRI/DEF/PHY profile is durable across import, generated data, fresh careers, existing-career migration, youth/newgens, development/decline and scouting masking. |
| **T2 — Roles and tactical-fit projection in shadow mode** | ✅ Complete | Pure action-oriented role participation, lineup action strengths/counters, tactic-driven route usage and matchup vulnerabilities are computed in `tacticalProjection.js`. |
| **T3 — Authoritative action ledger foundation** | ✅ Complete | One seeded fixed-packet action ledger is authoritative for football outcomes; tactics choose routes, roles choose actors and detailed attributes resolve actions against opponents while Quick Sim/Watch remain exactly identical. |
| **T4 — Tactics schema v2 and mobile UI** | ✅ Complete | Versioned v2 instructions, dedicated v1→v2 migration, independent causal route controls, squad-specific fit/strength/risk/conflict feedback and one shared pre-match/live instruction path. |
| **T5 — AI and career-system integration** | 🚧 In progress | Plan-gate committed. First slice is proving a squad-aware AI tactical identity selector before it is allowed to affect authoritative match inputs; recruitment/scouting/training remain untouched until that common identity is green. |

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

`src/modules/tacticalProjection.js` provides the reusable action-oriented football model consumed by T3/T4:

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

## T4 tactics-v2 boundary

T4 extends the single tactics model rather than creating separate pre-match/live schemas.

- `P2_TACTICS_VERSION` remains the historical literal **1**.
- `TACTICS_PLAN_VERSION` is **2**.
- the historical P2 save backfill remains frozen and a dedicated retry-safe `ensureTacticsV2()` owns the v1→v2 migration;
- existing explicit v1 choices are preserved, including asymmetric attacking/defensive widths after normalization;
- priority-one controls now separate Use of Space, Ball Carrying, Shot Selection, Delivery Timing, Attacking Width, On Win, Defensive Transition, Defensive Line, Line of Engagement, Pressing, Defensive Width, Defensive Approach and Set Pieces;
- `TACTICAL_PROJECTION_VERSION` is **2** and reads those dimensions independently;
- `MATCH_ACTION_RESOLVER_VERSION` is **2**, while the action-ledger version and fixed 14-value RNG packet remain **1**;
- Work Into Box / Shoot on Sight causally alter authoritative chance frequency/quality; Delivery Timing remains a separate service choice;
- route controls alter what the team attempts rather than silently changing player attributes;
- `applyTeamInstructionChange()` is the shared live command and refreshes authoritative match state through the same path as formation/mentality changes;
- `tacticalPlanFeedback.js` derives squad-specific XI fit, strengths, risks and structural conflicts from the same action model without creating a second overall player rating;
- `TeamInstructionsPanel.svelte` groups the v2 controls by In Possession / Transition / Out of Possession / Shape / Set Pieces and displays that shared feedback;
- Team News and the live Match tactics sheet use the same panel; live changes affect the current match immediately and persist the canonical v2 plan for future matches;
- SquadScreen already renders `TEAM_INSTRUCTION_DEFS` dynamically, so the complete v2 control set remains available on the persistent squad/tactics surface.

## Frozen baseline and T3/T4 calibration

The T0 benchmark remains historical evidence and is **not overwritten** by later phases. `npm run balance:match:check` compares the current action-ledger distribution with the frozen T0 snapshot and fails if the engine leaves the reviewed football-like envelope.

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

T4 retained the existing balance gate. Its independent route controls, live command path and mobile panel therefore landed without widening the reviewed statistical envelope or changing RNG packet width.

## Verification

T1 completed on PR #28 SHA `ca2d22ca61f14c7ea09c67284dd081429e72dca1` with the complete GitHub Actions build/validate job green.

T2 completed on PR #28 SHA `489f2345446a8f4d5cae8da030a1fa3fc3050a76` after one fixture-isolation correction, with the complete GitHub Actions build/validate job green.

T3 completed on PR #28 SHA `177eeddbb7cf2908059ac8a112d8c131691dea7b` with workflow run **#550** fully green.

T4 completed its automated gate on PR #28 SHA `54716b9af13e6b40a018c09333cc92a6d2ae4dd7` with workflow run **#557** fully green:

- legacy build / deterministic validator ✅
- Vite production build ✅
- ESLint ✅
- complete Vitest suite ✅
- T4 schema/migration contracts ✅
- independent tactic-causality contracts ✅
- shared live-command isolation/normalization contracts ✅
- XI-fit/strength/risk/conflict feedback contracts ✅
- exact Quick Sim/Watch parity retained ✅
- unchanged 600-match sample and unchanged **5s** regression ceiling ✅
- UI emoji audit ✅
- T0/current balance comparison ✅
- club accent audit ✅
- Actions artifact upload ✅

The first UI milestone had exposed a test-runner timeout in the old P2 statistical fixture because it still constructed pre-T1 players with no detailed profile. The fix made that fixture use the canonical player-model-v5 `attributeProfile`; the 600-match sample, assertions and 5s ceiling were not reduced or weakened. On the final T4 gate the regression completed safely below the ceiling.

### T4 rendered-inspection limitation

The repository asks for hands-on responsive inspection at 320, 390, 768 and 1280 widths for UI changes. The available Cloudflare PR integration exposed only its private dashboard/log link during this session and did not provide a public branch-preview URL accessible through the available tooling. Therefore the automated production/Vite/UI gates are complete, but manual browser inspection of those four widths was **not claimed**. A later agent with an accessible preview should perform that visual-only check without reopening T4 simulation behaviour.

## T5 in progress

T5 is governed by [`attribute-to-tactics-causality-2-t5-plan.md`](./attribute-to-tactics-causality-2-t5-plan.md).

The first slice is intentionally isolated as a pure squad-aware AI tactical identity selector:

- existing hash identity remains the club prior;
- formation coverage, role suitability and action-relevant detailed attributes determine squad feasibility;
- one elite player cannot define the identity;
- a small fit advantage retains the club identity;
- only a material specialist mismatch may switch archetype;
- legacy/insufficient squads fall back safely to the current stable AI profile;
- no save/database/RNG version changes are part of T5.1;
- authoritative `matchEngine.js`, Team News, recruitment, loans, scouting and training remain unchanged until the pure selector gate is green.

After T5.1 is proven, the next allowed step is the minimum authoritative match-input adapter plus exact Quick Sim/Watch parity coverage. Career-system consumers should then migrate to that same squad-aware identity rather than invent independent tactical-fit formulas.
