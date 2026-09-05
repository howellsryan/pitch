# T6 — Broadcast and analysis plan gate

**Workstream:** Attribute-to-Tactics Causality 2.0  
**Phase:** T6 — Broadcast and analysis  
**Status:** In progress — reconciled against the latest PR #28 broadcast implementation

## Why this gate differs from the original T6 checklist

A significant part of the original T6 broadcast work already landed earlier on PR #28 in commit `2268cf49e21fce69a91267f8c397fedf7c7ea53a` (`Drive live broadcast from authoritative action phases`). T6 must extend that implementation, not replace it with the older pre-ledger plan.

The inherited baseline is now load-bearing:

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

The wider T0 vocabulary also names defensive/restart action concepts, but those are not independent authoritative `record.route` values today. T6 must not fabricate new match-engine records merely to make the presentation vocabulary look complete. If a later phase extends match authority, Broadcast may consume that versioned data then.

## T6 delivery slices

### T6.1 — inherited ledger-driven broadcast baseline

Treat the existing PR #28 ledger choreography as the starting implementation rather than future work. Preserve all current deterministic and lifecycle contracts.

### T6.2 — route/outcome presentation semantics

Improve the existing scene labels/commentary and movement cues using only authoritative record fields that already exist:

- distinguish retained circulation, line-breaking progression and transition wins;
- distinguish direct passes from passes into space;
- make carries visibly read as carries rather than a delayed generic phase;
- distinguish wide delivery/cross scenes and aerial/box contests where the selected target/outcome supports them;
- distinguish intercepted passes, tackles/turnovers, fouls, blocks, saves, misses and goals;
- use named authoritative actor/target/defender/shooter identities where available;
- never change phase timing, RNG, scorer, result, xG, stats or authoritative possession to improve presentation.

### T6.3 — compact post-match tactical analysis

Add one pure, DOM/DB-free projection over the authoritative action ledger. It may calculate compact causal facts such as:

- route attempts and successful progressions;
- carry attempts/success;
- passes into space attempted/completed;
- wide-delivery attempts/success;
- chances, shots, total/average xG and conversion;
- turnovers/interceptions suffered;
- the most materially successful and least effective used route;
- one or two deterministic, score-independent match observations grounded in those records.

The projection is **not** a second match engine and must not infer events that the ledger does not contain. It must not expose raw internal execution/counter scores to the normal user-facing surface.

`finaliseLiveMatch()` may attach this compact projection to the transient result so Quick Sim and Broadcast share the same analysis. Existing world/cup persistence must remain explicitly bounded: do not start storing the full action ledger, and do not widen canonical historical records unless separately justified.

### T6.4 — concise pre/post-match UI

- Reuse the T5 squad-aware opponent insight on Team News; do not build a second pre-match tactical predictor.
- Enrich it only where the existing user plan + opponent insight can support a concise matchup note without hidden-attribute omniscience.
- Add a compact post-match analysis section to the existing After view using the shared T6.3 projection.
- Prefer 3–5 readable facts over an opaque tactic rating or dense analytics dashboard.
- Preserve the existing mobile controls, live pitch hierarchy and five-beat Match route.

## Explicit non-goals

T6 does **not**:

- change match-engine scoring, chance creation, route selection or tactical balance;
- add spatial coordinates to the authoritative action ledger;
- persist the 120-record ledger into season history;
- add manual/on-pitch football controls;
- reconnect the legacy arbitrary open-play chooser to current ledger-backed matches;
- add a browser/E2E test suite;
- redesign the match route or reopen unrelated R0–R7 UI decisions.

## Verification and rollback boundary

Required before T6 is called complete:

- all existing `ledgerBroadcast.test.js` sequencing/outcome/deferred-lineup contracts remain green;
- new presentation-semantic tests prove named route/outcome labels without inventing football events;
- tactical-analysis projection is deterministic, finite, non-mutating and derived only from ledger facts;
- Quick Sim and segmented Broadcast still finalise to the same score/stats/analysis for the same authoritative state;
- full legacy build, Vite build, lint, Vitest, UI emoji, balance and accent gates pass on the final pushed SHA;
- Cloudflare branch preview is green;
- affected Match/After UI is inspected at 320 / 390 / 768 / 1280 widths from rendered output, with an honest note if direct preview-browser access is unavailable.

Rollback should remain separable: T6 presentation/analysis can be reverted without changing T3 action resolution, T4 tactics persistence, T5 AI/career selection, save versions or the fixed 14-value RNG packet.
