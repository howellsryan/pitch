# Playable moments: revised POC, MVP and full delivery

Proposed execution sequence following the [PR review](playable-key-moments-review.md)
and [architecture/asset proposal](playable-key-moments-architecture.md).
This file is a plan; none of its implementation gates has been demonstrated yet.

## Programme boundary

The user's newer direction authorizes planning **optional short playable moments**.
Quick Sim and Watch remain complete management-simulator choices. Continuous 11v11
movement, Player Career, another match engine, paid assets and manual art-tool
operation remain outside scope.

Treat this as an independent experimental stream, not a silent replacement for
P8–P12. Before implementation, reconcile actual merged delivery with the stale
programme headings and align AGENTS.md, CLAUDE.md and the strategic roadmap to the
narrow exception above. Do not infer that P8/P9 are unfinished merely from a
heading when their runtime files exist. This review leaves adjacent status cleanup
and durable instruction edits for that explicit preparation slice.

The original five-family MVP becomes staged delivery. The first career MVP covers
existing open-play chances for attacking shots and goalkeeper decisions; penalties,
free kicks and shootouts need new authoritative semantics first. This is an explicit
scope recommendation, not a claim that the original five-family MVP is delivered.

## POC: prove the risky parts before scaling

| Slice | Deliverable | Exit evidence |
| --- | --- | --- |
| P0: preparation and automatic baseline | Load locked workflows, align the narrow product boundary, capture automatic parity and unchanged balance baselines; inspect live-match save/queue ownership. | Reviewed short plan for phase continuation, versions and eventual persistence. No unreviewed changes to simulation constants. |
| P1: finish seam and headless contracts | Separate phase preparation from final resolution/commit; use existing open-play shot inputs. Automatic mode follows the same path with null intent. Add input validation and preliminary interactive calibration. | Exact automatic ledger/result/RNG parity, including segmented execution and phase-boundary effects; no renderer/DB imported into domain code. |
| P2: visual and asset feasibility | Dev-only penalty-style scene with synthetic context, shooter and keeper, procedural goal/ball and generated strike/dive movement. One locked asset pipeline; Three.js candidate and a bounded equivalent PlayCanvas comparison. | Clean unattended rebuild, coherent strike/contact/save/miss, inspected human movement, measured mobile payload/init/frame cost, recorded engine choice. Synthetic penalty is labelled a harness and cannot write career results. |
| P3: integrated vertical slice | Reuse that presentation for one authorized open-play chance in a temporary fixture. Freeze/accept intent/commit/resume through the actual phase boundary. | Demonstrate both attacking and keeper input at the seam, genuine changed outcomes, coherent ledger/stats, no rerun of phase effects; no career rollout yet. |

POC must answer both **is it enjoyable?** and **can this automated visual workflow
meet the target?** A static model loading successfully, or a fun discs-only input
test, does not close the full POC. Use the same normalized input contract in any
2D debug harness so it does not create a throwaway rules implementation.

At POC closeout, record goal/save/miss/blocked examples, left/right input, wide aim,
good/bad timing and high/low abilities. Watch normal speed and slow motion for
sliding feet, impossible keeper reach, snapping limbs and ball teleports. Test on
a real touch device where available; desktop mobile emulation alone is not proof
of iOS Safari GPU/memory behaviour. Disclose any unavailable device verification.

Use a small formative test (for example five willing testers, explicitly not a
statistical retention study): can they understand aiming after one instruction,
explain the outcome, perceive a meaningful quality/pressure difference, and prefer
another attempt? Record confusion and accidental browser gestures. Do not use
silent telemetry collection as a substitute for observed feedback.

**Stop rule:** if the free/procedural movement is not convincing or the interaction
does not feel fair, revise the bounded slice. Do not start five scenarios, buy a
pack, require Ryan to use Blender, or claim that passing unit tests solved art.

## MVP: one reliable career mode

1. **Persist pending and committed moments.** Versioned per-slot continuation,
   atomic submission/result receipt, Maps/plain-data serialization and crash-safe
   resume are required before a real career can opt in. Extend the existing DB and
   envelope migration paths; do not add a parallel database or gameweek queue.
2. **Integrate open-play attacking and keeper choices.** Start with a fixed shot
   decision and a keeper positioning/dive decision. No continuous approach control.
   Keep both sides fair and attributed to actual engine-selected players. Skip
   goes through automatic resolution from the existing packet.
3. **Add selection and pacing.** Use pre-finish chance/context, managed side, score,
   minute and a soft cap. Zero eligible moments is valid. Do not manufacture chances
   or select using a known auto-result. Test how selection itself changes team
   advantage and average goals. Treat the original 3–7 count as an unproven pacing
   hypothesis, not an acceptance quota.
4. **Complete the match lifecycle.** League/cup/European matches, half-time,
   substitutions, injuries, tactics, finish/skip, repeated entry and post-match
   projection all use existing ownership. Leave knockout shootout verdicts
   automatic until the later per-kick domain phase. No pending shot survives as an
   unresolved fragment of an already-finalized fixture.
5. **Close quality and rollout.** Accessible non-drag controls, reduced motion,
   load-failure fallback, replay skip, mobile cleanup, calibration and manual
   verification ship together behind a feature flag. Do not wait for full delivery
   to add an accessible way to play or to handle unsupported WebGL.

## Meaningful verification gates

| Risk | Required test/evidence |
| --- | --- |
| Automatic regression | Whole-match versus multiple segment sizes; null intent versus baseline; exact football outputs/ledger and cursor parity. Retain current standard and deep balance checks unchanged. |
| Phase mutation replay | Suspend immediately before finish; resume once and twice; verify fitness, counters, discipline, injuries and AI subs apply once, especially at phase multiples triggering them. |
| Input/result contradiction | Outside-goal aim never scores; saved trajectory reaches permitted keeper contact; blocked path has a blocker; 30/60/120 Hz presentation and resize do not change a recorded intent result. |
| Calibration | Poor/average/strong/near-perfect profiles across paired seeds and ability, pressure, side and chance-quality buckets; measure goals added/removed, target rate, keeper effects and selection bias. |
| Save correctness | Crash before pending save, before submit commit, after commit before reveal, during replay and before fixture closeout; duplicate submits, stale tabs, full-time retry and write failure. Same stored intent resumes identically. |
| Save isolation/updates | Two slots with overlapping fixture IDs; export/import/cloud round trip; unsupported simulation tuple and stale cached assets; no silent reinterpretation of started matches. |
| UI lifecycle | Real branch preview: narrow/mobile/tablet/desktop, keyboard/tap, reduced motion, orientation, pointer cancel, hidden tab, missing asset, context loss and repeated enter/exit. |
| Build boundaries | Both build paths, lint, Vitest, balance gates and club audits. Renderer absent from legacy/domain dependency graph; assets emitted and fetched from built preview. |

For calibration, keep the existing automatic 25-scenario × 100 paired-seed T7
gate. Add interactive policy comparisons without demanding that intentionally
changed results equal automatic ones. Define and record numeric bounds for average
goals added, quality ordering and skill effects **before** tuning to pass them.
Use paired uncertainty estimates and adequate samples per rare scenario; a handful
of naturally occurring penalties cannot validate penalty balance. No universal
bonus and no weakened existing threshold is an acceptable way to get green.

The repository has no E2E/browser test suite; add none. Pure contracts cover the
state machine and domain. Hands-on rendered inspection provides visual/device
evidence. A report must distinguish these two kinds of proof.

## Performance acceptance

Existing design limits remain **<20s fresh-career load, <25s world week and <50 MiB
storage at 4× CPU throttle**. Their old browser automation was removed. Re-measure
by hand when persistence or simulation changes, recording device/browser/method.
Do not cite the old P3 measurements as evidence for this feature.

Proposed additional POC targets, to ratify with the first measured scene:

- No 3D runtime or playable binary requests in ordinary initial management load.
- Cold moment ready within 3 seconds on a documented 10 Mbps/100 ms RTT profile;
  repeat entry within 500 ms. Record distributions, cache state and exact device.
- Target 60 fps on capable devices; require p95 frame time below 33 ms on the
  selected supported low-tier device during the short action, or simplify it.
- Twenty enter/exit cycles leave no active render/input handlers and no continuing
  growth in retained resources after warm-up/cleanup. Record measurement limits
  on browsers without trustworthy heap/GPU counters.
- Record and freeze separate compressed JS, asset, decoder and warm-cache budgets
  at engine selection. Do not pretend a generic package-size number proves them.

These are proposed programme targets, not measured current performance. First
reduce visuals/payload if they fail; do not silently loosen existing career limits.
Asset download failure uses an explicit automatic path for the same pending
moment, never an invented new attempt.

## Full delivery after MVP

| Order | Scope | Dependency and completion condition |
| --- | --- | --- |
| F1 | Snapshot and one-on-one staging variations | Reuse the proven shot/keeper contract; authorize pressure/channel/keeper depth before input. New mechanics require new calibration, not merely a different camera. |
| F2 | In-match penalties and direct free kicks | Add explicit award/location/taker/wall/keeper semantics in the authoritative model and ledger. Separate penalty calibration from open-play xG/block logic. Only then connect the proven scene. |
| F3 | Final pass, cutback, cross and rebound | Engine must authorize continuation/receiver/restart and its downstream chance. No presentation-only creation of extra possessions, corners or second shots. |
| F4 | Headers, volleys and broader keeper saves | New contact/trajectory and animation recipes pass source, rig, realism and ability gates; no imaginary free clips as dependencies. |
| F5 | Shootouts and competition integration | Replace aggregate verdict with a versioned, rules-correct per-kick process through existing cup/European ownership; verify early conclusion, sudden death and idempotent progression. |
| F6 | Presentation and long-term rollout | Reusable scene direction, optional provenance-safe audio, short replays, quality tiers, asset upgrades and long-career compaction. Verify statistics, accessibility and mobile performance throughout. |

Scene reuse, input accessibility, motion contact, calibration and lazy delivery
start in POC/MVP; these full-delivery phases deepen them rather than introduce
them belatedly. Broader scope should be reprioritized using POC/MVP evidence.
No calendar or staffing estimate is credible until the visual and save seams pass.

## First next task and handoff

Open a dedicated implementation PR for P0/P1, then the bounded visual P2 slice;
keep PR #35 as the planning decision record. At every handoff state the shipped
scope, exact pushed SHA, fresh gate results, direct Cloudflare preview, inspected
viewports/devices, remaining evidence and next slice. Do not describe an untested
asset route or an automated build proposal as a working production pipeline.
