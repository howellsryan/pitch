# T7 — Balance, rollout and documentation plan gate

**Workstream:** Attribute-to-Tactics Causality 2.0  
**Phase:** T7 — Balance, rollout and documentation  
**Status:** COMPLETE — 5 Sep 2026; enforced implementation gate workflow #607 green at `ef19644a23666b8f9b578d09a1d14c3c2a801415`

## Goal

T7 closes the Attribute-to-Tactics Causality 2.0 workstream by proving the system delivered in T0–T6 remains balanced, deterministic, performant, storage-bounded and safely versioned across real career conditions.

T7 is **not** a new tactics feature tranche. It should prefer evidence, guardrails and rollout contracts over adding more controls or another match model.

The controlling principles are:

1. **Player quality must matter more than tactical rock-paper-scissors.** A 20-point stronger squad should not routinely lose its advantage because of one instruction matchup.
2. **No instruction is universally positive.** Strong tactical choices should be contextual and expose a cost, counter or squad-fit requirement.
3. **Specialists should matter where their attributes are causally relevant.** Pace into space, Passing on progression, Dribbling on carries, Shooting on finishing, Defending/recovery against penetration and Physical in relevant contests should move the intended outputs without acting like generic overall buffs.
4. **The current T0→T6 authority boundaries stay fixed unless evidence proves a defect.** T7 does not casually change the fixed 14-value RNG packet, create a second simulator or persist full action ledgers.
5. **Calibration comes before retuning.** Build the broader diagnostic matrix first; only change production constants if that evidence identifies a real exploit/dominance/balance failure.

## Current audit at T7 start

### Existing balance harness

The current `tools/lib/matchBalance.mjs` + `tools/match-balance-report.mjs` gate is useful but intentionally narrow:

- 600 neutral matches at equal rating 77;
- 300 paired seeds per tactical matchup;
- four matchup fixtures;
- both teams currently use 4-3-3 in the harness;
- the synthetic balance players primarily exercise headline ratings rather than deliberate detailed-attribute specialist profiles;
- standard CI executes 3,000 simulations and protects the accepted neutral envelope.

That existing gate stays as the fast standard regression check unless reviewed evidence justifies changing it.

### Existing long-career/performance evidence

The repository already contains useful T7 foundations rather than starting from zero:

- `playerP3Balance.test.js` runs reproducible multi-season population checks and a 15-season per-player payload bound;
- historical hands-on 4× CPU evidence records approximately **12.33s fresh-career load, 18.50s authoritative full-world week and 2.76 MiB browser storage**;
- unchanged regression ceilings remain **<20s fresh career**, **<25s full-world week**, **<50 MiB storage**;
- an earlier >41s world-week regression was previously fixed by removing duplicate world settlement/scans rather than weakening the 25s ceiling.

T7 must establish what can be reproduced automatically and what remains an explicit hands-on benchmark. It must not invent current performance numbers from historical measurements.

### Existing simulation-version boundary

`matchEngine.js` currently stamps every live state/result with:

- `matchEngineVersion`
- `actionResolverVersion`
- `actionLedgerVersion`
- `rngPacketVersion`

A watched match is transient in the current Svelte Match route rather than persisted as a resumable save object. A loaded application module therefore cannot change implementation underneath an in-memory match; a fresh fixture builds a fresh live state using the currently loaded versions.

However, `simulateMatchSegment()` currently refreshes version fields to module constants rather than validating an incompatible resumed state. T7 must make the **supported boundary explicit and testable**:

- new simulation versions activate when a new match state is built;
- an already-built supported live state retains its recorded contract while it is being advanced;
- incompatible/unknown resumable states must fail clearly rather than silently being relabelled as the current version;
- T7 does not add persistent live-match resume unless separately required.

## Delivery slices

### T7.1 — expanded calibration matrix

Extend the existing match-balance tooling rather than creating a parallel simulation harness.

Keep `createMatchBalanceReport()` and the current 3,000-simulation CI gate stable. Add a deeper diagnostic mode/function that can exercise deterministic paired scenarios across a representative matrix:

- ability gaps: 0 / 5 / 10 / 20 points;
- home and away reversal;
- representative supported formations, including at minimum 4-3-3 / 4-2-3-1 / 4-4-2 plus one three- or five-defender shape where useful;
- fresh vs fatigued squads;
- balanced vs deliberately specialist detailed-attribute profiles;
- key tactical routes/counters such as pass into space vs high/low lines, carry vs compact/front-foot defending, wide delivery vs narrow/wide defending, patient circulation vs pressing, work-into-box vs shoot-on-sight;
- representative role changes where the same player quality is preserved but participation changes.

Implementation requirements:

- paired variants must use the same initial seed stream;
- synthetic squads must use canonical detailed `attributeProfile` values, not just headline ratings;
- generated reports must be finite, serialisable and deterministic;
- report construction must not mutate input squads/tactics;
- compact unit tests use small samples; the deep diagnostic run remains an explicit calibration command unless runtime evidence shows it is suitable for every CI run.

### T7.2 — dominance, specialist and quality guardrails

Do **not** choose arbitrary thresholds before observing the expanded matrix.

First capture the diagnostic outputs, then review and encode guardrails for the real invariants:

- stronger squads maintain a meaningful aggregate advantage at +5/+10/+20 rating gaps;
- tactics may narrow/widen that advantage contextually but must not routinely erase a 20-point quality gap;
- no tested instruction/archetype produces a positive result shift across nearly every heterogeneous context;
- specialist profiles move their intended action/output more than unrelated actions;
- fitness costs show up where aggressive/high-intensity approaches demand them;
- home advantage remains bounded rather than becoming a hidden dominant multiplier;
- directional causal tests remain monotonic where appropriate but do not require every individual seed to improve.

If a failure is found, make the smallest production adjustment at the causal source and rerun both the deep matrix and the unchanged standard T0/T3 balance gate. Never widen a threshold merely to make CI green.

### T7.3 — rollout, long-career performance and storage

#### Simulation versioning

Add a small explicit compatibility boundary around live match state:

- current version constants remain the source of new-fixture version stamps;
- `buildLiveMatchState()` creates a coherent version tuple once at fixture start;
- segment advancement validates that tuple instead of silently upgrading it;
- same-version segmented play remains identical to Quick Sim;
- unsupported version tuples fail explicitly with a useful error;
- result metadata preserves the versions that actually simulated that fixture.

Do not add persistent live-match resume merely to satisfy versioning documentation.

#### Performance/storage

Reuse existing world/career performance infrastructure where possible.

Required evidence:

- standard 600-match statistical fixture remains below its unchanged 5s test ceiling;
- 181-club world regression ceilings remain <20s fresh-career / <25s world-week / <50 MiB storage where reproducible in the established benchmark setup;
- 15-season player/save payload remains bounded;
- no full action ledger is retained in historical fixtures/season summaries;
- managed tactical analysis remains compact and does not make background AI-v-AI fixtures carry manager-only payloads.

Historical measurements may be cited as historical baselines only. T7 final status must distinguish newly measured values from retained prior evidence.

### T7.4 — final documentation and product help

Only after T7.1–T7.3 are green:

- update this workstream's execution ledger to T7 complete;
- update `AGENTS.md` and `CLAUDE.md` with the final simulation-version/balance authority if new durable rules were introduced;
- update roadmap/architecture notes so future agents do not resurrect aggregate score synthesis, duplicate tactics schemas or hidden scouting ratings;
- update user-facing Help/Settings copy only where the final controls/analysis need explanation;
- update PR #28 title/body to T0–T7 and make the final verification evidence easy to audit.

Any UI/help change must be rendered at 320 / 390 / 768 / 1280 widths. No browser/E2E suite is introduced.

## Test plan

### Deterministic/unit

- same deep-calibration config + seed set returns byte-equivalent report data;
- every paired scenario has zero seed mismatches;
- synthetic specialist builders preserve headline quality while changing only intended detailed attributes;
- input squads/tactics are not mutated;
- all aggregate/report values are finite and serialisable;
- simulation version tuple created at fixture start is preserved through segments and final result;
- unsupported version tuples are rejected explicitly.

### Causal/balance

- stronger-squad aggregate advantage across 5/10/20 point gaps;
- home/away reversal checks;
- specialist directional tests;
- tactical counter/exploit checks across heterogeneous opponents;
- no universal-positive instruction/archetype after reviewed thresholds are set;
- existing 3,000-simulation T0→current gate remains green.

### Full regression

Before T7 completion:

- legacy deterministic replacement contracts;
- Vite production build;
- ESLint;
- full Vitest suite;
- Quick Sim/Watch segmentation parity;
- T6 ledger Broadcast contracts;
- UI emoji audit;
- standard match-balance gate;
- club accent audit;
- Actions artifact upload;
- required responsive inspection for any changed UI/help surface.

## Promotion strategy

T7 work remains on `scratch/t7-balance-rollout` until each meaningful slice has focused evidence.

Suggested promotion checkpoints:

1. **T7.1 diagnostic harness** — pure tooling/tests only, no match constants changed;
2. **T7.2 reviewed guardrails/fixes** — only if matrix evidence requires production tuning;
3. **T7.3 rollout/performance** — version compatibility + bounded-storage/performance evidence;
4. **T7.4 closure docs/help** — final PR metadata and merge gate.

The PR branch must not be advanced from a known-green checkpoint merely to expose incomplete calibration work.


## Closure evidence — 5 Sep 2026

T7 closed without adding another tactics model or retuning production constants to chase the sample.

- **T7.1:** the deterministic matrix covers **25 scenarios × 100 paired seeds = 5,000 authoritative simulations**, including +5/+10/+20 quality gaps, venue reversal, representative formations, instruction counters, all six detailed-attribute specialist domains, fitness pressure and role participation. Every reviewed pair records zero seed mismatches.
- **T7.2:** `matchBalanceT7Guardrails.mjs` encodes reviewed structural relationships instead of exact snapshot values. CI runs `balance:match:deep:check`, so the real matrix itself must pass those guardrails. Workflow **#607** is the first fully enforced integrated pass.
- **T7.3 version boundary:** new fixtures stamp one four-field simulation tuple; segment advancement validates rather than upgrades it; partial/unsupported tuples fail explicitly; same-version Quick Sim/Watch parity remains tested; deliberately unversioned legacy/manual states remain unversioned.
- **T7.3 payload/runtime:** the 600-match statistical fixture completed in **3.088s** under its unchanged **5s** ceiling in workflow #607. The 15-season player payload remains below the existing **2,500 bytes/player** bound. Historical results do not retain `actionLedger`; managed `tacticalAnalysis` is bounded below **12 KiB**; AI-v-AI results carry no manager-only tactical analysis.
- **Browser world budgets:** no browser/E2E benchmark was reintroduced. The established **<20s / <25s / <50 MiB** constraints remain load-bearing, while P3's **13.108s / 7.301s / 3.41 MiB** measurements are retained only as historical evidence. T7 does not materially change the world-week persistence loop.
- **Current-main reconciliation:** PR #30 was merged semantically into T7 via explicit two-parent merge `8fb90a161c6db80b1c5f1c41f710ddc3949bfd80`; the resulting scratch branch is a true descendant of current `main` and preserves both workstreams.
- **UI/help:** T7 itself adds no new user-facing controls or Help copy. T4/T6's already-recorded 320/390/768/1280 rendered verification remains the applicable visual evidence; no new browser/E2E suite was introduced.

### Enforced implementation gate — workflow #607

- legacy build / deterministic replacement contracts ✅
- Vite production build ✅
- ESLint ✅
- **108 Vitest files / 845 tests** ✅
- UI emoji audit: **42 source files / 0 violations** ✅
- unchanged standard **3,000-simulation** balance gate ✅
- enforced T7 **5,000-simulation** deep guardrail gate ✅
- club accent audit: **181 clubs / 0 failures** ✅
- Actions artifact upload ✅

The frozen reviewed distribution is recorded in `docs/benchmarks/match-engine-t7-calibration.md`.

## Exit criteria

T7 is complete only when:

- balanced/neutral output remains inside the accepted football-like envelope;
- player quality clearly survives tactical counter effects across reviewed ability gaps;
- intended specialists matter in intended contexts;
- no reviewed tactic/instruction is universally dominant;
- deterministic and Quick/Watch parity contracts remain intact;
- simulation-version activation/compatibility is explicit and tested at fixture boundaries;
- world/career performance and storage remain within established ceilings or an honest blocker is documented;
- final architecture/help/PR documentation matches the shipped code;
- the complete T0–T7 branch passes the full repository gate without weakened thresholds.
