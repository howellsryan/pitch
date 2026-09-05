# Attribute-to-Tactics Causality 2.0 — implementation status

**Updated:** 5 September 2026

**Design source:** [`attribute-to-tactics-causality-2.md`](./attribute-to-tactics-causality-2.md)

This file is the execution ledger for the workstream. The design document remains the source for target behaviour, weights, trade-offs and later phases; use this status file to determine what is already implemented before starting the next phase.

## Current status

| Phase | Status | Shipped boundary |
|---|---|---|
| **T0 — Baseline and calibration harness** | ✅ Complete | Frozen aggregate-engine balance report, paired-seed tactic comparisons, golden `npm test` check and action/event vocabulary. |
| **T1 — Detailed attribute data and player-model migration** | ✅ Complete | Versioned PAC/SHO/PAS/DRI/DEF/PHY profile is durable across import, generated data, fresh careers, existing-career migration, youth/newgens, development/decline and scouting masking. |
| **T2 — Roles and tactical-fit projection in shadow mode** | ✅ Complete | Pure action-oriented role participation, lineup action strengths/counters, tactic-driven route usage and matchup vulnerabilities are computed in `tacticalProjection.js`. |
| **T3 — Authoritative action ledger foundation** | ✅ Complete | One seeded fixed-packet action ledger is authoritative for football outcomes; tactics choose routes, roles choose actors and detailed attributes resolve actions against opponents while Quick Sim/Watch remain exactly identical. |
| **T4 — Tactics schema v2 and mobile UI** | ✅ Complete | Versioned v2 instructions, dedicated v1→v2 migration, independent causal route controls, squad-specific fit/strength/risk/conflict feedback and one shared pre-match/live instruction path. |
| **T5 — AI and career-system integration** | ✅ Complete | Squad-aware AI identity/adaptation, shared career tactical fit across recruitment/interest/loans, uncertainty-safe scouting fit and action-aware advisory training all reuse the same tactics/action model without creating a second match or development system. |
| **T6 — Broadcast and analysis** | ⏳ Not started | Next phase. Do not infer implementation from T5; T6 begins only from its own plan gate. |

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

The existing `attack`, `midfield`, `defence` and `goalkeeping` fields remain compatibility/headline ratings. T3 consumes the six detailed attributes for action resolution while selection, valuation and other compatibility consumers retain the established headline boundary.

Migration rules implemented in T1:

1. A saved player with a stable ID matching current seed data inherits the seed profile shape, rescaled around the saved career's current headline level.
2. Unmatched legacy players receive a deterministic position/archetype profile derived from their saved ratings and stable identity.
3. Generated youth/newgens receive a deterministic coherent profile through canonical player normalization.
4. Existing headline ratings, potential, progress, state, ownership, loans, contracts, history, formation and lineup are preserved.
5. `PLAYER_MODEL_VERSION` gates the one-time scan; no IndexedDB `DB_VERSION` bump was required.

The FC27 refresh persists the six detailed columns, rejects incomplete non-goalkeeper source rows and records detailed-attribute coverage/distributions in its audit report. Legacy CSV rows remain readable so the domain contract does not require a destructive roster rewrite.

## T2 projection contract

`src/modules/tacticalProjection.js` provides the reusable action-oriented football model consumed by T3 onward:

- the T0 action vocabulary (`circulation`, `direct_pass`, `pass_into_space`, `carry`, `wide_delivery`, `aerial_duel`, `shot`, `high_press`, `interception_tackle`, `recovery_defence`, `attacking_set_piece`);
- action-specific detailed-attribute execution and counter weights;
- role-to-action participation weights where roles decide who is involved, not a second quality multiplier;
- tactic-driven action usage so instructions alter what a team tries rather than universally boosting quality;
- opponent-context edges such as pace/passing into a high line, wide delivery against narrow defending and carries being harder into a compact block;
- lineup strengths/vulnerabilities and contributor explanations.

## T3 authoritative boundary

T3 replaces aggregate score/stat synthesis for real matches with one versioned authoritative action ledger:

- every one of the 120 match phases consumes one fixed **14-value RNG packet** before branch-specific logic;
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

## T4 tactics-v2 boundary

T4 extends the single tactics model rather than creating separate pre-match/live schemas.

- `P2_TACTICS_VERSION` remains the historical literal **1**.
- `TACTICS_PLAN_VERSION` is **2**.
- the historical P2 save backfill remains frozen and a dedicated retry-safe v1→v2 migration owns the upgrade;
- existing explicit v1 choices are preserved, including independent attacking/defensive widths after normalization;
- v2 controls separate Use of Space, Ball Carrying, Shot Selection, Delivery Timing, Attacking Width, On Win, Defensive Transition, Defensive Line, Line of Engagement, Pressing, Defensive Width, Defensive Approach and Set Pieces;
- `TACTICAL_PROJECTION_VERSION` is **2** and reads those dimensions independently;
- `MATCH_ACTION_RESOLVER_VERSION` is **2**, while the action-ledger version and fixed 14-value RNG packet remain **1**;
- Work Into Box / Shoot on Sight causally alter authoritative chance frequency/quality; Delivery Timing remains a separate service choice;
- route controls alter what the team attempts rather than silently changing player attributes;
- one shared live instruction command refreshes authoritative match state through the same path as formation/mentality changes;
- `tacticalPlanFeedback.js` derives squad-specific XI fit, strengths, risks and structural conflicts from the same action model without creating a second overall player rating;
- the grouped tactics panel is shared across persistent/pre-match and live surfaces so the command/schema cannot drift.

## T5 AI and career-system boundary

T5 is governed by [`attribute-to-tactics-causality-2-t5-plan.md`](./attribute-to-tactics-causality-2-t5-plan.md), with dedicated T5.2, T5.3 and T5.4 plan-gate documents recording the implementation boundaries.

### T5.1 — squad-aware AI identity

- `aiTacticalIdentity.js` is the single selector for squad-aware AI tactical identity;
- the existing stable hash identity remains the club prior rather than being replaced by fixture-by-fixture optimisation;
- formation coverage, role suitability and action-relevant detailed attributes determine whether the current squad can execute each archetype;
- feasibility uses bounded/diminishing contributions so one elite player cannot define an entire club identity;
- small fit differences preserve identity while a material squad mismatch may switch to a better-supported archetype;
- missing/legacy/insufficient squads retain a deterministic safe fallback;
- authoritative match inputs consume the same selected profile rather than a separate match-only selector.

### T5.2 — bounded adaptation and opponent insight

- opponent/home-away context adapts the selected identity within explicit bounds rather than re-selecting the club from scratch every fixture;
- low block/regroup adaptations cannot retain contradictory aggressive press/counter-press combinations;
- Team News consumes the same squad-aware opponent identity the upcoming match uses;
- manager-facing insight is deliberately coarse: likely style/shape/mentality, threat and opportunity without hidden feasibility margins, exact action weights or detailed opponent attributes;
- synthetic external opponents are generated deterministically from stable identity + strength and Team News reuses the same resolved squad for kickoff;
- synthetic `_stub_` players never count as real scouting evidence or create false confidence.

### T5.3 — recruitment, player interest, loans and squad planning

- `careerTacticalFit.js` is the pure shared career adapter over the same AI identity, role participation, tactic usage and detailed action-execution weights;
- position/group need remains a hard recruitment prerequisite and current ability, potential, budget, signing likelihood, age profile, contracts, reputation and transfer legality retain their existing authority;
- tactical fit is a bounded comparator that may reorder comparable candidates but cannot make a luxury fit beat a materially stronger/value-efficient need-fitting player by itself;
- players above a target ability band are no longer hard-excluded simply for being better than the band when they remain affordable/signable; band proximity still affects ranking quality;
- player interest evaluates against the buyer's real squad-aware identity rather than the old hash-only profile;
- expected minutes remains the largest loan-destination signal, with tactical fit used secondarily for closer pathways;
- no new persistence schema or match RNG rule is introduced by the career-fit layer.

### T5.4 — scouting and training

- `scoutingTacticalAssessment.js` is the manager-knowledge adapter between scouting evidence and the shared career tactical evaluator;
- a current-season exact report may evaluate the canonical player and returns only coarse role/fit/focus language to the manager;
- partial/public reports evaluate a neutral masked proxy derived only from the observed ability range: unrevealed PAC/SHO/PAS/DRI/DEF/PHY cannot leak through a tactical-fit label;
- stale partial reports preserve their stored tactical observation instead of silently refreshing from changed hidden attributes;
- the user's current saved tactical plan is passed into weekly scouting so the report describes fit for the plan the manager actually uses, not a hash-only fallback;
- `trainingTacticalRecommendation.js` reuses role participation, action usage and action execution requirements to suggest one of the existing development-plan families;
- Recovery, Sharpness and Position Conversion retain priority before tactical advice;
- tactical training is advisory only: it neither silently changes the selected plan nor writes ratings/progress;
- core `training.js` and player-development settlement remain unchanged, avoiding a tactics→player-model→development→training dependency cycle;
- `DevelopmentPlanPanel.svelte` surfaces the recommended plan plus a short action/role reason while actual changes still go through the existing manager command.

Manager DNA remains an observation of the manager's choices/results. T5 does not infer hidden player ability from DNA or declare one objectively optimal tactic.

## Frozen baseline and calibration

The T0 benchmark remains historical evidence and is **not overwritten** by later phases. `npm run balance:match:check` compares the current action-ledger distribution with the frozen snapshot and fails if the engine leaves the reviewed football-like envelope.

Frozen/current neutral distribution used by the final T5 gate:

| Metric | T0 | Current | Δ |
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

T5 does not widen the action-ledger balance envelope or the fixed per-phase RNG packet.

## Verification history

- **T1:** PR #28 SHA `ca2d22ca61f14c7ea09c67284dd081429e72dca1`, complete build/validate job green.
- **T2:** PR #28 SHA `489f2345446a8f4d5cae8da030a1fa3fc3050a76`, complete build/validate job green after fixture-isolation correction.
- **T3:** PR #28 SHA `177eeddbb7cf2908059ac8a112d8c131691dea7b`, workflow **#550** fully green.
- **T4:** PR #28 SHA `54716b9af13e6b40a018c09333cc92a6d2ae4dd7`, workflow **#557** fully green.
- **T5.3 need-first recruitment correction:** SHA `a26c627f93fa3e19151a0da03357ef61e9786848`, workflow **#570** fully green.
- **T5 final code gate:** SHA `86019a75514fd2ae07896f86c355446e3671c943`, workflow **#573** fully green.

### Final T5 automated gate — workflow #573

- legacy build / deterministic replacement contracts ✅
- Vite production build ✅
- ESLint ✅
- **96 Vitest files / 761 tests** ✅
- T5.4 scouting uncertainty/anti-omniscience suite **6/6** ✅
- T5.4 training recommendation suite **5/5** ✅
- T5 authoritative Quick Sim/Watch parity coverage retained ✅
- unchanged 600-match statistical fixture completed in **3.576s**, below the unchanged **5s** ceiling ✅
- UI emoji audit ✅
- **3,000-simulation** balance gate (600 neutral + 300 paired seeds per matchup) ✅
- club accent audit: **181 clubs / 0 failures** ✅
- Actions artifact upload ✅
- Cloudflare Git deployment for exact code SHA `86019a75` ✅

The failed predecessor workflow **#572** was not a production defect: one new scouting test over-specified `inside_forward` for a Compact Counter RW even though Early Delivery legitimately kept `wide_creator` as the canonical role. The test was corrected to assert the real invariant — changing the supplied plan changes the action emphasis — without changing production logic or weakening the hidden-attribute masking tests.

### T5.4 responsive inspection

The Cloudflare deployment for the final T5 code SHA succeeded and published the branch preview. Direct Chromium navigation to the `workers.dev` preview is blocked by this execution environment, so a deployed-browser walkthrough is **not** claimed.

For the changed UI surface, the exact final `DevelopmentPlanPanel.svelte` markup/styles from SHA `86019a75` were rendered and inspected at **320, 390, 768 and 1280 px** widths:

- no horizontal overflow at any required width;
- mobile header/recommendation content stacks correctly below 480px;
- the two-column development-plan grid remains readable at 320/390;
- representative long recommendation reasons wrap without clipping;
- active-plan styling remains clear;
- contract-release actions remain separated and usable;
- tablet/desktop widths keep the recommendation treatment inline and stable.

This closes **T5**. **T6 has not started.**