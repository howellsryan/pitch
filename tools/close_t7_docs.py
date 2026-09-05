from pathlib import Path
from textwrap import dedent

repo = Path('.')

contributor_block = dedent('''

### Match simulation versioning and T7 balance gate

- A new fixture owns one coherent simulation tuple: `matchEngineVersion`, `actionResolverVersion`, `actionLedgerVersion`, `rngPacketVersion`. `buildLiveMatchState()` stamps it once. `simulateMatchSegment()` validates it before advancing; partial or unsupported tuples fail explicitly. Do **not** silently relabel an already-started match to the currently loaded simulator. Intentionally unversioned legacy/manual states retain only their documented compatibility path.
- Public/historical match results never retain the authoritative `actionLedger`. Managed results may retain the compact `tacticalAnalysis` projection only; its deterministic regression budget is **<12 KiB**, and AI-v-AI background results keep `tacticalAnalysis:null`.
- CI keeps the unchanged standard 3,000-simulation balance gate and also runs `npm run balance:match:deep:check`: **25 scenarios × 100 paired seeds = 5,000 authoritative simulations**. The T7 guardrails protect relationships rather than pinning one calibration snapshot: player quality must remain stronger than any single reviewed tactic swing, tactics must keep contextual costs/counters, specialists must move their causal domains, fatigue must matter, and every paired scenario must preserve its seed stream. Never widen these guardrails merely to get green.
- World/career browser budgets remain **<20s fresh-career load / <25s full-world week / <50 MiB storage at 4× CPU throttle**, but the old browser benchmark was removed with E2E. Treat the P3 measurements **13.108s / 7.301s / 3.41 MiB** as historical evidence only; re-measure by hand when changing world simulation, persistence or a per-gameweek hot loop.
''')
anchor = '- P1 background fixtures also use the authoritative fast match engine. Never run Broadcast simulation for the background world.\n'
for filename in ('AGENTS.md', 'CLAUDE.md'):
    path = repo / filename
    text = path.read_text()
    if '### Match simulation versioning and T7 balance gate' not in text:
        if text.count(anchor) != 1:
            raise SystemExit(f'{filename}: expected authoritative-match anchor once, found {text.count(anchor)}')
        path.write_text(text.replace(anchor, anchor + contributor_block, 1))

plan = repo / 'docs/plan/attribute-to-tactics-causality-2-t7-plan.md'
text = plan.read_text()
old_status = '**Status:** In progress — starts from PR #28 T6 closure head `0d996da7d5195526e41d0a84659a4352059b2a29`'
new_status = '**Status:** COMPLETE — 5 Sep 2026; enforced implementation gate workflow #607 green at `ef19644a23666b8f9b578d09a1d14c3c2a801415`'
if old_status in text:
    text = text.replace(old_status, new_status, 1)
elif new_status not in text:
    raise SystemExit('T7 plan status anchor missing')
closure = dedent('''
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

''')
exit_anchor = '## Exit criteria\n'
if '## Closure evidence — 5 Sep 2026' not in text:
    if text.count(exit_anchor) != 1:
        raise SystemExit('T7 plan exit anchor missing')
    text = text.replace(exit_anchor, closure + exit_anchor, 1)
plan.write_text(text)

status = repo / 'docs/plan/attribute-to-tactics-causality-2-status.md'
text = status.read_text()
boundary = '## T7 next-phase boundary\n'
complete_heading = '## T7 — COMPLETE (5 Sep 2026)'
if complete_heading not in text:
    if boundary not in text:
        raise SystemExit('status T7 boundary anchor missing')
    prefix = text.split(boundary, 1)[0]
    close = dedent('''
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
    ''')
    status.write_text(prefix + close)

design = repo / 'docs/plan/attribute-to-tactics-causality-2.md'
text = design.read_text()
t7_exit = '**Exit:** neutral tactics stay close to the accepted baseline; specialists matter in the intended contexts; no tactic dominates across squads/opponents.\n'
delivered = '\n**Delivered 5 Sep 2026:** complete. The unchanged 3,000-simulation gate is supplemented by an enforced 5,000-simulation paired T7 matrix with structural quality/tactic/specialist/fatigue/role guardrails; fixture simulation versions are validated at segment boundaries; historical results remain ledger-free and managed tactical analysis is compact. See `attribute-to-tactics-causality-2-status.md` and `../benchmarks/match-engine-t7-calibration.md`.\n'
if '**Delivered 5 Sep 2026:** complete.' not in text:
    if text.count(t7_exit) != 1:
        raise SystemExit('design T7 exit anchor missing')
    text = text.replace(t7_exit, t7_exit + delivered, 1)
design.write_text(text)

benchmark = repo / 'docs/benchmarks/match-engine-t7-calibration.md'
benchmark.write_text(dedent('''
# T7 Deep Match Calibration — reviewed baseline

**Frozen:** 5 Sep 2026  
**Authoritative implementation checkpoint:** `ef19644a23666b8f9b578d09a1d14c3c2a801415`  
**Enforced GitHub Actions gate:** workflow **#607**, run `33960525220`  
**Report version:** 1  
**Samples:** **25 scenarios × 100 paired seeds = 5,000 authoritative simulations**

This is the reviewed T7 distribution. It supplements rather than replaces the unchanged standard 3,000-simulation T0→current balance gate. T7 guardrails intentionally protect causal/relative relationships rather than pinning these exact values forever.

## Reviewed scenario distribution

| Scenario | Category | Δ pts | Δ GF | Δ GA | Δ poss. | Δ shots | Δ xG | Better / same / worse | Seed mismatches |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| +5 squad quality | quality | +0.700 | +0.560 | -0.360 | +1.630pp | +1.950 | +0.378 | 34 / 66 / 0 | 0 |
| +10 squad quality | quality | +0.890 | +1.150 | -0.470 | +3.000pp | +3.120 | +0.678 | 44 / 56 / 0 | 0 |
| +20 squad quality | quality | +1.660 | +3.360 | -0.630 | +6.260pp | +7.260 | +1.669 | 69 / 31 / 0 | 0 |
| Same subject moved from home to away | venue | -0.030 | -0.040 | +0.040 | -0.580pp | -0.420 | -0.092 | 34 / 31 / 35 | 0 |
| 4-2-3-1 vs 4-3-3 | formation | +0.090 | +0.060 | -0.090 | +0.160pp | +0.080 | +0.019 | 8 / 91 / 1 | 0 |
| 4-4-2 vs 4-3-3 | formation | -0.120 | -0.070 | +0.070 | -0.170pp | -0.090 | -0.023 | 2 / 88 / 10 | 0 |
| 5-3-2 vs 4-3-3 | formation | -0.080 | -0.070 | +0.050 | -0.380pp | -0.460 | -0.104 | 9 / 75 / 16 | 0 |
| Pass into space vs high line | tactic | +0.200 | +0.250 | +0.010 | -1.380pp | +0.770 | +0.276 | 17 / 79 / 4 | 0 |
| Pass into space vs low line | tactic | +0.170 | +0.220 | 0.000 | -1.600pp | +0.310 | +0.152 | 13 / 85 / 2 | 0 |
| Run at defence vs compact block | tactic | +0.030 | -0.020 | 0.000 | 0.000pp | +0.010 | -0.002 | 8 / 86 / 6 | 0 |
| Wide attack vs narrow defence | tactic | +0.020 | -0.070 | 0.000 | -0.600pp | +0.760 | -0.040 | 10 / 81 / 9 | 0 |
| Wide attack vs wide defence | tactic | -0.160 | -0.140 | +0.010 | -0.370pp | +0.650 | -0.049 | 8 / 75 / 17 | 0 |
| Work into box vs balanced | tactic | +0.210 | +0.160 | -0.130 | +3.520pp | -1.060 | +0.073 | 22 / 69 / 9 | 0 |
| Shoot on sight vs balanced | tactic | -0.040 | -0.030 | +0.010 | 0.000pp | +0.780 | -0.045 | 7 / 84 / 9 | 0 |
| Counter-press vs patient build-up | tactic | +0.170 | +0.150 | -0.130 | +8.940pp | +0.950 | +0.135 | 13 / 84 / 3 | 0 |
| Pace specialists into a high line | specialist | +0.120 | +0.130 | -0.050 | 0.000pp | +0.630 | +0.161 | 9 / 91 / 0 | 0 |
| Passing specialists in direct progression | specialist | +0.160 | +0.260 | 0.000 | 0.000pp | +1.150 | +0.253 | 10 / 90 / 0 | 0 |
| Dribbling specialists running at defence | specialist | +0.150 | +0.180 | 0.000 | 0.000pp | +0.790 | +0.155 | 8 / 92 / 0 | 0 |
| Shooting specialists on balanced chance creation | specialist | +0.220 | +0.200 | -0.010 | -0.020pp | +0.020 | +0.002 | 13 / 87 / 0 | 0 |
| Defending specialists against space attacks | specialist | +0.200 | +0.020 | -0.210 | -0.010pp | +0.010 | +0.002 | 12 / 88 / 0 | 0 |
| Physical specialists in an aggressive press | specialist | +0.180 | +0.180 | -0.120 | -0.010pp | +0.420 | +0.089 | 10 / 90 / 0 | 0 |
| Fatigued aggressive press vs fresh aggressive press | fitness | -0.140 | -0.130 | +0.170 | -0.380pp | -0.680 | -0.131 | 2 / 87 / 11 | 0 |
| Penetration roles vs default roles | role | 0.000 | -0.020 | 0.000 | +0.010pp | -0.170 | -0.013 | 4 / 91 / 5 | 0 |
| Wide roles vs default roles | role | -0.010 | -0.020 | +0.050 | +0.020pp | +0.130 | +0.024 | 3 / 93 / 4 | 0 |
| Possession roles vs default roles | role | +0.060 | +0.060 | 0.000 | +0.160pp | +0.060 | +0.005 | 13 / 79 / 8 | 0 |

## Causal route evidence

- Pass Into Space vs high line: **+7.010** pass-into-space attempts/match and **+0.276 xG**; against a low line the xG gain is **+0.152**, preserving the contextual high-line advantage.
- Run at Defence vs compact block: **+6.650 carry attempts/match**.
- Wide attack: **+8.490 wide deliveries** vs narrow defending and **+8.750** vs wide defending, while the result swing is better against the narrow block (+0.020 vs -0.160 points/match).
- Work Into Box: **-1.060 shots**, **+3.520pp possession**, **+0.073 xG**.
- Shoot On Sight: **+0.780 shots** but **-0.045 xG**.
- Passing specialist: pass-into-space success **+6.380pp**; Dribbling specialist: carry success **+7.350pp**.
- Shooting specialist: **+0.200 goals/match** with only **+0.020 shots**.
- Fatigued aggressive press: **-0.140 points**, **-0.131 xG**, **+0.170 goals against**.
- Penetration roles: **+1.610** pass-into-space attempts; wide roles: **+0.910** wide deliveries; possession roles: **+1.520** circulation attempts.

## Structural conclusions

- Player quality is the strongest reviewed signal: +5 quality gives **+0.700 points/match**, substantially larger than the biggest single reviewed tactic swing (**+0.210**).
- Quality is monotonic from +5 → +10 → +20, and the +20 side is never worse on a paired result in this sample.
- Tactical choices remain contextual rather than universally positive.
- All six detailed outfield specialist attributes move their intended causal domains without becoming universal overall multipliers.
- Starting fitness materially constrains high-intensity pressing.
- All **25** paired scenarios have **0 seed mismatches**.

## Standard gate retained

The unchanged 600-match neutral distribution in workflow #607 remains:

- goals/match **1.973**;
- home goal edge **+0.243**;
- home points/match **1.523**;
- home possession **49.835%**;
- shots/match **12.963**;
- shots on target/match **4.923**;
- xG/match **1.952**;
- yellow cards/match **0.457**;
- forward scorer share **77.700%**.

The 600-match statistical fixture completed in **3.088s**, below the unchanged **5s** ceiling.

## Storage / rollout evidence

- historical/public match results do **not** retain the full `actionLedger`;
- managed `tacticalAnalysis` is deterministic between Quick Sim and segmented Watch and has an explicit **<12 KiB** serialized test bound;
- AI-v-AI background matches keep `tacticalAnalysis:null`;
- the 15-season P3 player payload remains below **2,500 bytes/player**;
- browser world budgets remain **<20s fresh career / <25s world week / <50 MiB storage at 4× CPU throttle**. T7 did not reintroduce browser/E2E automation, so P3's **13.108s / 7.301s / 3.41 MiB** measurements are historical evidence only, not newly measured T7 figures.

**Enforced result:** `T7 deep calibration guardrails: PASS.`
'''))

print('T7 closure documentation prepared successfully.')
