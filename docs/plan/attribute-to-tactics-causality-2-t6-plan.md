# T6 — Broadcast and analysis plan gate

**Workstream:** Attribute-to-Tactics Causality 2.0  
**Phase:** T6 — Broadcast and analysis  
**Status:** ✅ Complete — final code gate `8570a824c74816b92cb234b0692f7ece1bf3ad6a`, workflow #581

## Why this gate differs from the original T6 checklist

A significant part of the original T6 broadcast work already landed earlier on PR #28 in commit `2268cf49e21fce69a91267f8c397fedf7c7ea53a` (`Drive live broadcast from authoritative action phases`). T6 extends that implementation rather than replacing it with the older pre-ledger plan.

The inherited baseline remains load-bearing:

- current watched matches create `broadcastSimulation` with `ledgerDriven:true`;
- each authoritative phase passes its action-ledger record into `updateBroadcastSimulation()`;
- the presentation uses acquire → route → contest/chance → settle/restart choreography;
- `isBroadcastReady()` prevents the next authoritative phase from advancing until the active scene is complete;
- pause and 1×/2×/4× speed affect both clocks coherently;
- goals reveal only when the visual goal scene reaches its hold;
- half time waits for an in-flight scene;
- authoritative substitution/formation changes are immediate but visual lineup replacement is deferred until the current scene completes;
- the broadcast cannot invent another scorer, goal, result, attempt, corner or foul for ledger-backed matches;
- the action ledger remains non-spatial; coordinates and connecting touches remain illustrative presentation data.

`docs/plan/live-broadcast.md`, `AGENTS.md`, `src/game/ledgerBroadcast.test.js` and the current MatchScreen implementation document/protect this boundary.

## Authoritative data reality

The current resolver chooses one of five authoritative progression routes per phase:

- `circulation`
- `direct_pass`
- `pass_into_space`
- `carry`
- `wide_delivery`

A record can then carry terminal context such as `outcome`, `chance`, `xg`, `shotId`, `assistId`, `finish`, `onTarget` and `cornerWon`.

The wider T0 vocabulary also names defensive/restart action concepts, but those are not independent authoritative `record.route` values today. T6 does not fabricate new match-engine records merely to make the presentation vocabulary look complete. If a later phase extends match authority, Broadcast may consume that versioned data then.

## T6 delivery slices

### T6.1 — inherited ledger-driven broadcast baseline ✅

The existing PR #28 ledger choreography is the starting implementation and remains unchanged as the authoritative presentation lifecycle. Existing deterministic sequencing, goal reveal, halftime, speed/pause and deferred-lineup contracts remain protected by `ledgerBroadcast.test.js` and `broadcastSimulation.test.js`.

### T6.2 — route/outcome presentation semantics ✅

T6 adds pure presentation semantics over the existing authoritative record fields:

- retained circulation, line-breaking progression and transition wins are distinguished;
- direct passes are distinguished from passes into space;
- carries visibly read as carries rather than a generic delayed phase;
- wide delivery/cross scenes and box actions use the authoritative route/target/outcome context already present;
- intercepted passes, tackles/turnovers, fouls, blocks, saves, misses and goals are distinguished;
- authoritative actor/target/defender/shooter names are used where available;
- the presentation layer does not change phase timing, RNG, scorer, result, xG, stats or authoritative possession.

Implementation boundary:

- `src/game/broadcastLedgerSemantics.js` maps one ledger record to manager-facing wording;
- `src/game/broadcastFrameSemantics.js` overlays that semantic wording onto the existing frame snapshot;
- `MatchScreen.svelte` consumes the adapter for the visible phase label/commentary;
- the final semantic integration does **not** modify `broadcastSimulation.js` choreography.

### T6.3 — compact post-match tactical analysis ✅

`src/modules/matchTacticalAnalysis.js` is the pure, DOM/DB-free projection over the authoritative action ledger. It provides compact causal facts including:

- route attempts and successful progressions;
- carries and passes into space through the same route aggregates;
- wide-delivery usage;
- chances, shots, total/average xG and conversion context;
- turnovers/interceptions suffered;
- best-used route information;
- deterministic, score-independent observations grounded in the ledger.

The projection is not a second match engine and does not infer events the ledger does not contain. It does not expose raw internal execution/counter scores to the normal user-facing surface.

`finaliseLiveMatch()` attaches the compact projection to the managed-match result so Quick Sim and Broadcast share the same analysis. The full 120-record ledger remains transient and canonical background/history records remain bounded.

### T6.4 — concise pre/post-match UI ✅

- Team News continues to reuse the T5 squad-aware opponent insight rather than introducing another pre-match predictor;
- the post-match After view now contains a compact `MatchTacticalAnalysisPanel.svelte` Tactical Read beneath the normal match statistics;
- the card surfaces a small number of route/output facts and observations rather than an opaque tactic score;
- existing mobile controls, live-pitch hierarchy and five-beat Match route are preserved;
- desktop width is capped/centred so the analysis remains a readable card rather than a wide dashboard.

## Explicit non-goals retained

T6 does **not**:

- change match-engine scoring, chance creation, route selection or tactical balance;
- add spatial coordinates to the authoritative action ledger;
- persist the 120-record ledger into season history;
- add manual/on-pitch football controls;
- reconnect the legacy arbitrary open-play chooser to current ledger-backed matches;
- add a browser/E2E test suite;
- redesign the match route or reopen unrelated R0–R7 UI decisions.

## Final verification

Final T6 code SHA: `8570a824c74816b92cb234b0692f7ece1bf3ad6a`  
GitHub Actions workflow: **#581 — fully green**

- legacy build / deterministic replacement contracts ✅
- Vite production build ✅
- ESLint ✅
- **100 Vitest files / 791 tests** ✅
- `ledgerBroadcast.test.js` sequencing/outcome/deferred-lineup contracts ✅
- `broadcastLedgerSemantics.test.js` route/outcome language contracts ✅
- `broadcastFrameSemantics.test.js` non-mutating frame adapter contracts ✅
- T6 tactical-analysis deterministic/parity contracts ✅
- Quick Sim and segmented Watch authority/parity retained ✅
- UI emoji audit: **42 source files / 0 violations** ✅
- **3,000-simulation** balance gate ✅
- club accent audit: **181 clubs / 0 failures** ✅
- Actions artifact upload ✅

The unchanged balance guardrail remains inside the reviewed football-like envelope. T6 changes presentation/analysis only; it does not widen the action-ledger balance envelope or the fixed 14-value RNG packet.

## Responsive verification

The changed Tactical Read surface was rendered and inspected at **320 / 390 / 768 / 1280 px**:

- no horizontal overflow or clipping;
- long route/observation copy wraps correctly;
- mobile metric layout collapses safely;
- standard match-stat hierarchy and Continue controls remain intact;
- desktop content remains compact and centred.

Direct deployed-browser validation is not claimed where the execution environment cannot navigate the preview. The required rendered responsive inspection is complete.

## Rollback boundary

T6 remains separable from match authority. Its presentation/analysis changes can be reverted without changing T3 action resolution, T4 tactics persistence, T5 AI/career selection, save versions or the fixed 14-value RNG packet.

**T6 is closed. T7 — Balance, rollout and documentation is the next phase.**
