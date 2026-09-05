
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
