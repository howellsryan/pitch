# Immersive football broadcast

The watched match previously connected independently selected actors using staged
acquire/route/contest scenes. Long passes were capped at 720 ms, intercepted passes
reached the receiver before a tackle, flights homed towards moving players, goals
reset every marker, and the UI published at about 30 fps. This replacement gives
the engine ownership of the connecting action sequence and integrates continuous
movement before rendering it on a cached canvas.

## Ownership and football data

`matchEngine.js` remains the authoritative orchestrator for both Quick Sim and
Broadcast. New matches carry engine 3/resolver 3/ledger 2/RNG-packet 1. Its unchanged
14-value packet fixes all result randomness; additional spatial intent reuses
those values. Existing completed matches keep their recorded results/versions.
An incompatible live tuple fails explicitly rather than being relabelled.

`modules/matchFootball.js` carries the preceding owner, intended ball zone and
restart. Kickoffs, free kicks, corners, goal kicks and saved keeper possession
belong to the correct next side. An ordered chain specifies recovery, connecting
pass, route pass/carry/cross, final ball and shot, with metric origin/destination,
participants, height intent and terminal possession. The real final pass in the
chain determines the recorded assister. The half-time kickoff swaps sides.

Normal episodes still represent 45match seconds and select possession from the
calibrated midfield share. A proposed extra 24% persistence blend was rejected:
its feedback through forced restarts amplified venue effects. The supported
model keeps causal restart ownership and a bounded 1-point venue execution edge.
The standard 3,000-match and deep 5,000-match guardrails are unchanged.

This is **tactical intent**, not measured tracking. Chance probability/xG still
comes from the calibrated route, attributes and tactical matchup. Intended shot
zones reflect that chance; moving an illustrative marker cannot recalculate xG
or override a goal. Penalties, tracking-derived statistics and a fully spatial
outcome resolver require their own authoritative model/calibration work.

## Continuous tracking projection

`game/footballSimulation.js` uses a 105×68 m pitch and 20 ms fixed integration steps.
Each player's active match role supplies the shared formation anchor. Pace and
current fitness bound top speed; acceleration and turning are bounded, arrival
brakes and local avoidance steers intention without adding uncapped displacement.
Team width, defensive line and pressing consume the shared tactical instructions.
Exact roles are assigned before fallback suitability so a midfielder cannot
accidentally consume a later defender's slot.

Formation commands also reassign the authoritative match positions for the same
XI. Substitutions inherit the departing player's active slot and transfer compact
carrier identity without changing a completed action. AI replacements favour a
suitable outfield player and reserve the backup goalkeeper. A depleted XI names
an emergency keeper in the result engine and tracking together.

A pass locks its endpoint at release. Distance and the passer's attribute set
travel duration; acceleration constrains the receiver's planned reach and ground
passes lose some pace while retaining a rolling velocity at the intended first
touch. Receiver velocity, acceleration and braking jointly constrain the kick
and receiving run. Active flight intents apply before movement so the formation
planner cannot briefly steal a receiving run. A late player follows the rolling
ball along its original release vector; it does not park at a fixed endpoint.
Planning and integration share the same drag-adjusted kick timing. Ground kicks
use constant grass drag and softer weight near boundaries to leave collectable
roll; first-touch movement takes priority over avoidance close to contact. A
receiver who has run beyond a line returns inside before release.
The receiver must physically meet the ball. Runs are checked
against the ball, second-last defender and halfway line at release, with actual
corner/goal-kick exemptions. An interception ends along the pass lane and belongs
to the recorded defender before the intended receiver gets a touch. Challenges,
blocks and goalkeeper catches require contact. Shot endpoints stay fixed; the
keeper moves/dives towards the attempt, and the score reveals after the goal-line
crossing. No projected touch adds a new recorded shot, foul or goal.

The attacking/defending blocks travel with play. Nearby support forms triangles,
the next defender covers the pressing lane and defenders follow nearby forward
runs. Upcoming actors and blockers begin their movement during build-up. Offside
checking uses the nearer legal line, rather than an unnecessary halfway retreat;
the owner carries while that run is checked. Both sides close a contested carry.
A remote phase-level recovery projects a lost distribution into the named
recoverer's reachable zone instead of holding the old owner still for a player
to cross the field. Saved/blocked contact points use reachable participant motion.
These projections preserve recorded possession, actor, scorer and result; they
are constructed movement around statistical episodes, not authoritative tracking.

Players walk into goal/half-time/restarter positions; their coordinates are never
reset during a visible match. Dead-ball collection hides the out-of-play ball
until the next taker reaches its spot. Live substitutions defer until the active
scene completes and retain the outgoing slot's position. Tracking is transient;
neither full frame histories nor action ledgers enter completed career results.
Background fixtures never integrate or render 22-player tracking.

## Rendering and controls

`MatchPitch.svelte` and `footballCanvas.js` draw one canvas per animation frame.
Turf, markings, nets and stand detail are cached; pixel ratio is capped at 2.
Metric markings retain their proportions across portrait and landscape views.
Procedural original player figures use actual facing, distance-driven stride,
shirt numbers, shadows and ball-height separation without external assets.

Broadcast gently follows play, with wider framing for dead balls and a compact
whole-pitch locator. Tactical keeps the complete pitch visible. Reduced motion
uses the fixed overview and removes stride. Score, commentary and 44 px controls
remain accessible DOM elements. HUD updates are bounded independently from the
every-frame drawing; engine episodes advance on readiness instead of one-second
polling. Clock interpolation and narration follow the visible sequence, with
future shot/interception results withheld until contact.

Pause and the Tactics room freeze the same timeline. Labelled 1×/2×/4× apply
physical rates 4×/8×/16×: the old 4× pace is the new default 1×. Integration remains
20 ms and the renderer substeps accelerated time; legacy scheduling uses the same
rate. The three measured real-squad fixtures take about three minutes at default 1×.
Large wall-clock gaps are bounded to prevent background-tab fast-forward. Full
time waits for the final shot/goal hold, then uses the existing atomic result
commit. Quick Sim and Skip retain that same engine/result/persistence path.
Goal takeovers clear when open play resumes so accelerated football remains
visible while the readable goal notification continues.
The Tactics room constrains its content grid to the available width; team-plan
choices remain visible on 320 px phones while formation and bench rows scroll
independently.

## Verification contract

Pure contracts protect whole/segmented parity, action/restart/assist identity,
metric speed/acceleration/contact bounds, immutable endpoints, release-time
offside, frame-partition invariance, complete 120-phase matches, goal counts,
halftime and deferred scorer substitution. Retained legacy realism contracts
must also pass. Browser inspection covers actual mobile/desktop sustained play,
camera, pause/speed/tactics, save/goal/restart, full-time exit and canonical stats.
The normal build/test/lint/accent, unchanged balance/deep gates,4× CPU world
budgets and exact-final-SHA preview are release requirements.

Local evidence on 2026-10-09: both builds (including 198 replacement contracts),
1,066 Vitest tests, lint, the club-accent audit and both unchanged balance gates
passed. Complete metric matches cover four formations, fatigue, automatic/manual
substitutions and an emergency keeper. Native inspection covered 390 px mobile,
320 px/short-phone and 1280 px views, pause/camera,4× playback, formation/team-plan
and keeper changes, goals/restarts, half-time, full-time and result commitment.
The report's score/statistics matched the saved fixture/table;90 world fixtures
across nine leagues advanced once, including correct 8/82-minute keeper exposure.
A 30-second 4× CPU/4× playback observation delivered 60 fps (95th-percentile frame
interval 16.7 ms). Tracking stays transient; this initial career used 4.08 MiB.
The final-model world-week check resolved 90 fixtures in 3.35 s at 4× CPU, drained
the event queue and advanced once; storage remained 4.08 MiB. Fresh-career setup
was 13.58 s at 4× CPU. The long-career history/storage codec remains unchanged.

Flow correction evidence on 2026-10-10: two complete native mobile matches on
production and the previous preview were watched before editing. Three repeatable
real-squad fixtures previously spent 35–42% of live presentation time with a
stationary ball, including 7–9 s holds. The corrected fixtures each spent below
0.5%; a further 40-fixture, six-formation-pair audit measured 0.447% overall.
Those 40 matches and an extra targeted fixture completed all 120 phases with
no late receptions or backwards shots. These are movement regression metrics,
not an empirical validation against real football tracking.

Fresh build, 1,081 Vitest tests, lint, accents and unchanged 3,000/5,000-match
calibration gates passed. Native inspection of the built assets covered default
and fastest playback, 320/390/1280 px views, Broadcast/Tactical, pause and the
Tactics room. Pause preserved both clock and canvas; closing Tactics preserved
manual pause. Complete Rayo–Madrid 0–3 and Madrid–Barcelona 1–2 matches reached
full time without Skip; saved scorers and report statistics matched their fixtures.
A 30 s probe of actual canvas draws at labelled 4× (physical 16×), with 4× CPU
throttling, measured a 17.1 ms 95th-percentile draw interval while play advanced
from 13:09 to 66:18. Fresh local career setup took 3.86 s and its first world week
took 2.93 s at 4× CPU: 90 fixtures resolved once, the pending queue emptied and
the career advanced to GW2. Browser storage used 8.42 MiB after that week.
