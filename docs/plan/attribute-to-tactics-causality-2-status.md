# Attribute-to-Tactics Causality 2.0 — implementation status

**Updated:** 5 September 2026

**Design source:** [`attribute-to-tactics-causality-2.md`](./attribute-to-tactics-causality-2.md)

This is the execution ledger for the Attribute-to-Tactics Causality 2.0 workstream. The design document remains the source for intended behaviour; this file records what is actually implemented, its architectural boundary and the verified gate before the next phase starts.

## Current status

| Phase | Status | Shipped boundary |
|---|---|---|
| **T0 — Baseline and calibration harness** | ✅ Complete | Frozen aggregate-engine baseline, paired-seed comparison tooling, action/event vocabulary and balance gate. |
| **T1 — Detailed attribute data and player-model migration** | ✅ Complete | Durable PAC/SHO/PAS/DRI/DEF/PHY profiles across import, careers, youth/newgens, development/decline and scouting masking. |
| **T2 — Roles and tactical-fit projection in shadow mode** | ✅ Complete | Shared action-oriented role participation, execution/counter weights, route usage and lineup strengths/vulnerabilities. |
| **T3 — Authoritative action ledger foundation** | ✅ Complete | Fixed-packet seeded action ledger owns football outcomes; detailed attributes causally resolve tactics/routes while Quick Sim/Watch remain identical. |
| **T4 — Tactics schema v2 and mobile UI** | ✅ Complete | Versioned v2 instructions, retry-safe migration, independent route controls, squad fit/risk feedback and one persistent/pre-match/live command path. |
| **T5 — AI and career-system integration** | ✅ Complete | Squad-aware AI identity/adaptation and shared tactical fit across recruitment, loans, scouting and advisory training without parallel ratings. |
| **T6 — Broadcast and analysis** | ✅ Complete | Ledger-driven Broadcast remains presentation-only; semantic commentary and compact Tactical Read explain the same authoritative match. |
| **T7 — Balance, rollout and documentation** | ⏳ Not started | Next phase: broaden calibration, prove rollout/performance/storage boundaries and close final architecture/help documentation. |

---

## T0 contract — frozen baseline and calibration

T0 intentionally preserves the pre-causality aggregate-engine evidence in `docs/benchmarks/match-engine-v1-baseline.md` rather than rewriting history after the action engine changed.

Frozen T0 neutral distribution:

| Metric | T0 |
|---|---:|
| Goals / match | 2.718 |
| Home goal edge | +0.058 |
| Home points / match | 1.392 |
| Home possession | 49.888% |
| Shots / match | 11.815 |
| Shots on target / match | 5.067 |
| xG / match | 1.477 |
| Yellow cards / match | 0.435 |
| Forward scorer share | 78.720% |

T0 also froze the action vocabulary and added deterministic paired-seed batch tooling. `npm run balance:match:check` now compares the current engine with that historical baseline and fails when the reviewed football-like envelope is breached.

---

## T1 contract — detailed player attributes

`src/modules/playerModel.js` owns player-model version **5** and durable `attributeProfile.version = 1`:

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

The existing `attack`, `midfield`, `defence` and `goalkeeping` fields remain headline/compatibility ratings rather than being deleted.

Implemented migration/data rules:

1. stable-ID saved players inherit the current seed profile shape rescaled around their career-developed headline level;
2. unmatched legacy players receive a deterministic position/archetype profile;
3. generated youth/newgens receive deterministic coherent profiles at creation;
4. player identity, headline ability, potential, progress, form, fitness, morale, injury state, club, contract and history survive migration;
5. the player-model version gate prevents an unnecessary full-world scan on every load;
6. the FC27 refresh path persists the six detailed columns and audits detailed-attribute coverage;
7. scouting masking understands the detailed profile and does not expose hidden exact values through manager-facing surfaces;
8. development/decline update the detailed profile through the canonical player-model boundary rather than creating a second overall.

---

## T2 contract — shared tactical projection

`src/modules/tacticalProjection.js` is the reusable action-oriented model used by later phases.

It owns/reuses:

- the T0 action vocabulary;
- action-specific attacking execution and defensive counter weights;
- role-to-action participation weights;
- tactic-driven route usage;
- opponent-context edges;
- lineup strengths, vulnerabilities and contributor explanations.

Roles primarily change **participation, positioning and action frequency**. Detailed attributes then decide execution. Role suitability is therefore not multiplied back into action quality as a duplicate broad quality bonus.

Key contextual examples include:

- Passing + runner Pace into a high line;
- wide delivery against narrow defensive width;
- carries being harder into compact blocks;
- pressing against circulation;
- recovery requirements created by a high defensive line.

---

## T3 contract — authoritative action ledger

T3 replaces aggregate score/stat synthesis for real matches with one seeded action-ledger authority.

### Fixed RNG contract

Every one of the **120 phases** allocates one fixed **14-value RNG packet** before branch-specific logic:

- possession
- route
- actor
- target
- defender
- execution
- outcome
- chance
- shooter
- shot
- finish
- assist
- discipline
- injury

The action-ledger version and RNG-packet version remain **1**.

### Football authority

- tactics, mentality and score-state risk choose route frequency/commitment;
- roles choose actors/runners/targets;
- Pace, Shooting, Passing, Dribbling, Defending and Physical resolve actions against opponent counters;
- pass-into-space separates passer quality from runner Pace/Physical;
- defensive recovery/interception uses opposing detailed defensive attributes;
- Shooting affects shot execution/conversion once a chance exists rather than creating possession by itself;
- score, scorers, assists, shots, shots on target, xG, possession and corners derive from ledger records;
- cards, injuries, fitness, substitutions and live tactic changes remain inside the same serialisable live state;
- public compatibility events remain `goal`, `yellow`, `injury`, `sub`;
- the 120-record ledger is transient and is not copied into historical competition records.

Quick Sim and segmented Watch produce the same authoritative result across **1 / 7 / 10 / 30 / 120-phase** segmentation.

---

## T4 contract — tactics schema v2

T4 extends one normalized tactics model rather than creating separate persistent/pre-match/live schemas.

- historical `P2_TACTICS_VERSION` remains literal **1**;
- `TACTICS_PLAN_VERSION` is **2**;
- historical P2 save backfill remains frozen;
- a dedicated retry-safe v1→v2 migration owns the upgrade;
- explicit legacy choices are preserved;
- old width maps to attacking + defensive width;
- old transition maps to `onWin`;
- old Work Ball / Early Delivery semantics map into separate Shot Selection / Delivery Timing choices.

Canonical v2 dimensions include:

- Build Up
- Tempo
- Use of Space
- Ball Carrying
- Shot Selection
- Delivery Timing
- Attacking Width
- On Win
- Defensive Transition
- Defensive Line
- Line of Engagement
- Pressing
- Defensive Width
- Defensive Approach
- Set Pieces

`TACTICAL_PROJECTION_VERSION` is **2** and `MATCH_ACTION_RESOLVER_VERSION` is **2** while the T3 fixed RNG/ledger versions remain unchanged.

Work Into Box / Shoot on Sight alter authoritative chance volume/quality; route controls alter what the team attempts rather than silently changing player attributes.

`TeamInstructionsPanel.svelte` is shared between pre-match/persistent and live surfaces. `formationChange.js` supplies the shared live command boundary.

`tacticalPlanFeedback.js` derives XI fit, strengths, risks and structural conflicts without introducing one opaque tactic overall.

---

## T5 contract — AI and career integration

T5 is governed by `attribute-to-tactics-causality-2-t5-plan.md` plus the T5.2/T5.3/T5.4 plan gates.

### T5.1 — squad-aware AI identity

- `aiTacticalIdentity.js` is the single selector for squad-aware AI identity;
- stable club identity remains the prior;
- formation coverage, role suitability and action-relevant detailed attributes determine feasibility;
- diminishing/team-limited contributions prevent one elite player defining the whole identity;
- small fit differences preserve identity; material squad mismatches may select a better-supported archetype;
- missing/legacy/insufficient squads retain deterministic safe fallbacks;
- authoritative match inputs consume this same selected profile.

### T5.2 — bounded adaptation and opponent insight

- fixture/home-away context adapts identity within explicit bounds rather than re-selecting perfectly every fixture;
- contradictory combinations such as deep regroup with aggressive press/counter-press are prevented;
- Team News consumes the same squad-aware opponent identity used by kickoff;
- manager insight stays coarse: likely style/shape/mentality, threat and opportunity rather than exact hidden weights;
- synthetic external opponents are deterministic and do not count as real scouting evidence.

### T5.3 — recruitment, interest, loans and squad planning

- `careerTacticalFit.js` reuses the same identity, role participation, route usage and action-execution model;
- position need remains a hard prerequisite;
- ability, potential, budget, signing likelihood, age profile, contract, reputation and legality remain authoritative;
- tactical fit only separates otherwise comparable choices;
- affordable/signable players are not hard-excluded simply for being stronger than a target ability band;
- player interest evaluates against the buyer's real identity;
- expected minutes remains the primary loan-destination signal, with tactical fit secondary.

### T5.4 — scouting and training

- `scoutingTacticalAssessment.js` is the knowledge boundary between scouting evidence and tactical fit;
- exact/current reports may evaluate canonical known attributes;
- partial/public reports evaluate neutral masked proxies derived only from observed ranges;
- hidden PAC/SHO/PAS/DRI/DEF/PHY cannot leak through a fit label;
- stale partial reports retain their stored tactical observation;
- reports use the user's current saved plan;
- `trainingTacticalRecommendation.js` reuses role/action demand to recommend existing development-plan families;
- Recovery, Sharpness and Position Conversion retain priority;
- tactical training remains advisory and does not directly write ratings/progress;
- core development/training settlement remains authoritative.

Manager DNA remains an observation of manager choices/results, not a hidden-ability inference engine or proof of one objectively optimal tactic.

---

## T6 contract — Broadcast and tactical analysis

T6 is governed by [`attribute-to-tactics-causality-2-t6-plan.md`](./attribute-to-tactics-causality-2-t6-plan.md).

A large ledger-driven Broadcast baseline had already landed earlier in PR #28. T6 deliberately extended that implementation rather than replacing it.

### T6.1 — inherited ledger-driven Broadcast

Watched matches remain presentation over authoritative T3 phases:

- `ledgerDriven:true` Broadcast consumes one authoritative action record per phase;
- acquire → route → contest/chance → settle/restart scene choreography remains presentation-only;
- `isBroadcastReady()` blocks the next authoritative phase until the scene completes;
- pause and 1×/2×/4× speed affect presentation coherently;
- goal reveal, halftime and lineup replacement respect active scene lifecycle;
- Broadcast cannot invent a goal, scorer, result, attempt, corner or foul;
- the action ledger remains non-spatial; coordinates/connecting touches are illustrative.

### T6.2 — route/outcome semantics

`src/game/broadcastLedgerSemantics.js` maps the authoritative record into user-facing route/outcome wording and named actor/runner/defender/shooter context.

`src/game/broadcastFrameSemantics.js` applies that wording to the existing Broadcast frame snapshot without mutating the simulation.

The final semantic wiring deliberately leaves `broadcastSimulation.js` choreography unchanged.

Manager-facing language now distinguishes the current authoritative routes:

- circulation;
- direct pass;
- pass into space;
- carry;
- wide delivery;

and terminal outcomes including progression, retain, interception, turnover/tackle, foul, block/corner, save, miss and goal.

### T6.3 — compact tactical analysis

`src/modules/matchTacticalAnalysis.js` is a pure DOM/DB-free projection over the authoritative ledger.

It derives compact facts such as:

- route attempts and successful progressions;
- chances/shots and total/average xG;
- turnovers/interceptions suffered;
- best-used route information;
- deterministic score-independent observations grounded in actual records.

It does not infer missing events or expose raw execution/counter internals.

Managed Quick Sim and Watch share the same final tactical analysis. Background AI-v-AI world matches avoid unnecessary managed-match analysis work.

### T6.4 — UI

`MatchTacticalAnalysisPanel.svelte` adds a compact **Tactical Read** beneath existing After-match statistics.

It preserves the existing five-beat Match route, live pitch hierarchy, controls and result flow rather than becoming a separate analytics screen.

---

## Current balance evidence at T6 close

Current action-ledger neutral distribution remains inside the reviewed guardrail:

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

T6 does not widen this envelope or change the fixed RNG packet.

The current paired-seed gate also remains green for:

- direct counter vs high line;
- aggressive press vs patient build-up;
- wide delivery vs narrow block;
- work ball vs balanced block.

T7 will deliberately broaden this calibration beyond the existing four fixtures.

---

## Verification history

- **T1:** SHA `ca2d22ca61f14c7ea09c67284dd081429e72dca1` — complete build/validate gate green.
- **T2:** SHA `489f2345446a8f4d5cae8da030a1fa3fc3050a76` — complete build/validate gate green after fixture-isolation correction.
- **T3:** SHA `177eeddbb7cf2908059ac8a112d8c131691dea7b` — workflow **#550** fully green.
- **T4:** SHA `54716b9af13e6b40a018c09333cc92a6d2ae4dd7` — workflow **#557** fully green.
- **T5.3 recruitment correction:** SHA `a26c627f93fa3e19151a0da03357ef61e9786848` — workflow **#570** fully green.
- **T5 final code:** SHA `86019a75514fd2ae07896f86c355446e3671c943` — workflow **#573** fully green.
- **T6 analysis core:** workflow **#576** fully green.
- **T6 Quick Sim/Watch analysis integration:** SHA `ab8a2be183a974ba21a8420108b09449ee6f9566` — workflow **#577** fully green.
- **T6 semantic presenter checkpoint:** SHA `86d276ef1eccddf1318694bfff1ffe5aac57f07d` — workflow **#579** fully green after a test-only ESLint correction.
- **T6 MatchScreen integration:** SHA `897a5322c2079f67e1e5cf4fde5a1b7bcb3583bb` — workflow **#580** fully green.
- **T6 final code gate:** SHA `8570a824c74816b92cb234b0692f7ece1bf3ad6a` — workflow **#581** fully green.

### Final T6 automated gate — workflow #581

- legacy build / deterministic replacement contracts ✅
- Vite production build ✅
- ESLint ✅
- **100 Vitest files / 791 tests** ✅
- ledger Broadcast sequencing/outcome/deferred-lineup contracts ✅
- Broadcast route/outcome semantic tests ✅
- frame adapter non-mutation tests ✅
- managed tactical-analysis deterministic/parity tests ✅
- seeded Quick Sim/Watch authority/parity coverage retained ✅
- UI emoji audit: **42 source files / 0 violations** ✅
- **3,000-simulation** balance gate ✅
- club accent audit: **181 clubs / 0 failures** ✅
- Actions artifact upload ✅

The existing 600-match statistical fixture completed inside its unchanged **5s** test ceiling during the final gate.

### T6 responsive inspection

The exact changed Tactical Read markup/styles were rendered and inspected at **320, 390, 768 and 1280 px**:

- no horizontal overflow or clipping;
- long route/observation copy wraps safely;
- mobile metrics collapse correctly;
- match-stat hierarchy and Continue controls remain intact;
- desktop content remains compact/centred rather than stretching across the shell.

A deployed-browser walkthrough is not claimed where the execution environment cannot directly navigate the preview.

---


## T7 — COMPLETE (5 Sep 2026)

T7 closes Attribute-to-Tactics Causality 2.0 as a calibrated, versioned and regression-protected system rather than adding another feature tranche.

### T7.1 — expanded deterministic calibration

The standard 3,000-simulation gate remains unchanged. T7 adds a separate 25-scenario matrix over 100 paired seeds per scenario (**5,000 authoritative simulations**) covering quality gaps, venue, formations, tactical counters, specialists, fitness and roles. The matrix is deterministic/serialisable and every paired scenario records zero seed mismatches.

### T7.2 — structural guardrails

`tools/lib/matchBalanceT7Guardrails.mjs` protects reviewed relationships rather than exact September 2026 numbers. The production CI step is `npm run balance:match:deep:check`, so the real 5,000-simulation report must prove:

- +5/+10/+20 player-quality edges remain meaningful and monotonic;
- a single reviewed tactic swing remains materially smaller than the +5 quality edge;
- tactics retain contextual upside and downside rather than universal positivity;
- key instructions retain their intended route/trade-off signatures;
- Pace, Passing, Dribbling, Shooting, Defending and Physical specialists move their causal domains;
- aggressive pressing loses value under low starting fitness;
- role changes move participation without becoming generic result multipliers.

Workflow **#607** is the first fully enforced integrated pass and prints `T7 deep calibration guardrails: PASS.`

### T7.3 — fixture-version activation boundary

`src/modules/matchSimulationVersion.js` owns the supported simulation tuple fields. New live states stamp the current tuple once. Segment advancement validates it before football advances; partial or unsupported tuples fail explicitly instead of being silently upgraded. Supported tuples survive segmenting/finalisation unchanged, while deliberately unversioned legacy/manual states keep their legacy path. Same-seed Quick Sim/Watch parity remains covered.

### T7.3 — runtime and storage evidence

Newly reproducible automated evidence at workflow #607:

- 600-match statistical fixture: **3.088s**, below the unchanged **5s** ceiling;
- **108 Vitest files / 845 tests** green;
- 15-season P3 player payload remains below **2,500 bytes/player**;
- public/historical results do not retain `actionLedger`;
- managed `tacticalAnalysis` has an explicit **<12 KiB** serialized regression bound;
- AI-v-AI background results keep `tacticalAnalysis:null`.

The browser world limits remain **<20s fresh-career / <25s full-world week / <50 MiB storage at 4× CPU throttle**, but there is intentionally no browser/E2E harness after that suite was removed. P3's **13.108s / 7.301s / 3.41 MiB** figures are **historical evidence only**, not newly measured T7 values. T7 does not materially change the world-week persistence loop.

### T7.4 — documentation / rollout closure

- `AGENTS.md` and `CLAUDE.md` record the fixture-version and dual balance-gate authority.
- `docs/benchmarks/match-engine-t7-calibration.md` freezes the reviewed distribution used by the structural gate.
- T7 adds no new Help/UI surface, so no new rendered responsive inspection is required beyond the recorded T4/T6 UI verification.
- Current `main`/PR #30 was reconciled with explicit merge commit `8fb90a161c6db80b1c5f1c41f710ddc3949bfd80`; the integrated branch does not carry a stale-base conflict.

### T7 implementation verification — workflow #607

- legacy build / deterministic replacement contracts ✅
- Vite production build ✅
- ESLint ✅
- **108 Vitest files / 845 tests** ✅
- seeded Quick Sim/Watch and T6 ledger/Broadcast contracts ✅
- UI emoji audit: **42 source files / 0 violations** ✅
- standard **3,000-simulation** balance gate ✅
- enforced **5,000-simulation** T7 deep guardrail gate ✅
- club accent audit: **181 clubs / 0 failures** ✅
- Actions artifact upload ✅

**T0–T7 implementation is complete.** PR metadata/final PR-head verification remain delivery steps, not an additional simulation phase.
