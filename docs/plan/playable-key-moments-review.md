# PR #35: independent review and recommended decisions

Review baseline: `0385f0206f37c81c3e44d99034393b195ee736df` on
`plan/playable-key-moments-roadmap`, reviewed 5 September 2026.
The fetched `main` was `0c20cf2`; the PR differs from it only by the original
764-line planning document. This is a source/documentation review, not a tested
3D implementation or an asset-pack certification.

Read this first, then [architecture and automated assets](playable-key-moments-architecture.md)
and [revised delivery gates](playable-key-moments-delivery.md). These are proposed
amendments to [the original plan](playable-key-moments-roadmap.md), preserved for
comparison. Where they differ, the amendment is explicit below; no runtime or
contributor instructions change in this review commit.

## Recommendation

**Do not implement the original roadmap unchanged.** Keep Pitch's authoritative
engine and optional match mode, but replace the assumed animation supply chain
with an early, executable feasibility gate. Start with a small stylized 3D scene,
procedural football movements, and one reproducible asset build. Prove shot/keeper
contact quality as well as enjoyable input before building five scenario families.

**Three.js is my provisional first choice for this constrained scene**, using
its existing animation mixer and a small scene controller. PlayCanvas remains a
credible challenger, especially if native animation graphs materially simplify
the proven rig/clip set. Babylon.js deserves consideration if scripted retargeting
becomes essential. No source review can honestly establish the fastest or best
looking choice without measuring the same scene and assets in Pitch.

This recommendation does not require paid assets, manual Blender work, an editor
subscription, a new game application, or replacing Broadcast. It does require
engineering and visual iteration: automated production is not automatic quality.
Do not quietly redefine the requested presentation as discs-only just because
that is easiest to deliver.

## Findings, ordered by implementation risk

| Priority | Finding and evidence | Required amendment |
| --- | --- | --- |
| Blocker | Original §§4–5/10.6 name generic animation libraries without an exact, free, compatible strike/keeper clip inventory. A licence and a large clip count do not establish football coverage. | Prove one character plus strike, dive both sides and recovery at POC; provide a procedural source for missing movements. No five-scenario commitment until this passes. |
| Blocker | `resolveAuthoritativePhase()` immediately calls `resolveShotOutcome()`. `simulateMatchSegment()` then appends the ledger and goal event before processing discipline, injuries and substitutions. `MatchScreen.runTick()` consumes that completed phase. | Introduce a prepare/resolve/commit boundary before the terminal shot; do not overwrite a completed result after a gesture. Carry the uncommitted continuation exactly once. |
| Blocker | No authoritative in-match penalty/direct-free-kick shot branch appears in the inspected action resolver. `foul_won` is an outcome, not a positioned penalty award. `cups.js:resolveSingleLegKnockout()` resolves a tied knockout through a deterministic verdict, not a per-kick shootout ledger. | Penalty may be an isolated visual harness. Integrate an existing open-play shot first. Add explicit set-piece domain semantics before promising career penalties/free kicks/shootouts. |
| High | Fixed RNG does not persist pending intent, prevent duplicate commits, or recover live Maps/player state. | Persist a versioned continuation and commit receipt through existing slot/DB boundaries; test crash points and competing tabs. |
| High | Broadcast geometry is presentation, driven by elapsed time and an already-resolved ledger, including `record.finish`. Treating a live snapshot as football truth introduces timing and outcome leakage. | Build a small deterministic pre-shot geometry contract from pre-outcome context. Reuse appropriate coordinate/formation helpers, not outcome-aware spatial simulation as authority. |
| High | Original F9 puts calibration after MVP although MVP already promises calibration elsewhere. A modifier-only swipe also risks feeling cosmetic: wide aim must not be rendered as a goal. | Calibration and intent-to-visible-result coherence start with the first resolver. Keep automatic T7 gates unchanged and add interactive profiles and spatial consistency contracts. |
| High | Original asset output is `public/assets/playable/`, but the actual `vite.config.ts` has `root:'web'` and `publicDir:false`. The legacy build strips modules into one ordered scope. | Use explicit Vite asset imports in the lazy scene module; keep renderer imports out of the legacy/domain graph. Observe `src/build.py` ordering and syntax restrictions. |
| Medium | The original animation/state-graph argument selects an engine before proving its inputs. The review comment's gzip comparison is not a reproducible benchmark. | Compare a pinned, production-built scene including loaders/decoders/assets and initialization cost. Do not compare a whole engine bundle to renderer-core bytes. |
| Medium | Five different mechanics are labelled MVP; accessibility, geometry and performance are partly deferred. | First career release covers existing open-play finishing and keeper decisions, with skip/accessibility/resume included. Expand scenario families only after their domain and visual gates pass. |
| Medium | Contributor guide says P6 next; roadmap says P8 next; P8/P9 runtime files already exist. Old simulator-only wording also conflicts with the user's newer playable-moments direction. | Treat this as a separate optional programme; reconcile status from delivery evidence before scheduling it. Record the narrowly revised product boundary without restarting or silently displacing career work. |

## Assessment of the other agent's review

Reviewed the complete [review submission](https://github.com/howellsryan/pitch/pull/35#pullrequestreview-5122497916),
including all seven sections. The fetched discussion also contained the Cloudflare
deployment comment; the inline review-thread endpoint returned no threads.

| Review claim | Assessment |
| --- | --- |
| The animation list is not supported by the named packs. | Agree that the plan has not demonstrated coverage. Producer descriptions do not establish the requested complete football library. No archive was downloaded or animation rendered in this review, so do not claim an exhaustive clip audit. |
| No free football animation exists; paid mocap plus Blender is the only route to skeletal football. | Too absolute. Code can generate bone tracks, and Three.js/Babylon provide scripted retargeting facilities. CMU's indexed official pages also identify soccer kicks, although current terms/downloads were not fully retrievable here. None of these proves a production-ready free keeper library. |
| Universal Animation Library 2 is not fully CC0 because only part is free. | Confuses price/access with licence. The producer page explicitly lists CC0 while also advertising free/source tiers. Record the exact zero-price archive and its included licence; do not promise all advertised clips or paid source files. |
| PlayCanvas has no automatic humanoid retargeter. | A valid planning concern: the official support response says retargeting is unsupported. Do not assume a turnkey feature. But matching names alone is not sufficient compatibility: hierarchy, rest pose, units and bind transforms matter. |
| A merge into one character GLB is mandatory. | Overstated. Compatible animation tracks can be associated separately at runtime. A build-time remap/merge is one reproducible packaging choice, not a universal requirement. |
| Engine size makes Three.js the obvious winner. | Three.js is a sensible first candidate for a tiny procedural scene; the quoted 1–2 MB versus 168 KB figures are not accepted evidence. Maintenance, animation workflow, supported devices and actual transferred chunks also matter. |
| One optional resolver argument is the whole domain change. | Useful local seam, insufficient integration. Pause/commit, pending state, scenario authorization, intent semantics, downstream effects and versioning remain. |
| The packet contains 12 fields and solves anti-reroll. | At the reviewed SHA it contains **14**, including `discipline` and `injury`. Preserve that allocation. Repeatable RNG is necessary but not an idempotent save protocol. |
| Broadcast already supplies all needed geometry. | Reuse its presentation conventions and safe pure helpers. Do not feed elapsed-time or result-conditioned coordinates into outcome calculations. A renderer must not decide whether the initial chance was offside. |
| Legacy bundling was missed. | Agree. The file is `vite.config.ts`, not `.mjs`. TypeScript in the original document is a schema sketch, not itself a code defect; copying it into bundled JS would be. |
| Calibration and minimum geometry belong before MVP. | Agree. The exact claim that +0.4 goals breaks every T7 relationship is not established; measure effects and keep the existing guardrails. |
| 2D first, then reassess. | Useful input experiment, insufficient proof of the requested 3D movement/asset pipeline. Use as a short fallback/input harness, not an extra mandatory product phase or a replacement ambition. |
| Product boundary, roadmap priority and performance budgets need attention. | Agree. The user's latest request already authorizes planning optional moments. No renewed permission request is necessary to document it; align durable guides in the subsequent implementation preparation change. |
| Cut all post-MVP planning. | Keep a concise dependency-driven full-delivery outline, as the user explicitly requested it. Avoid pretending that twelve speculative work packages are an approved estimate. |

## What should survive unchanged in principle

- Pitch owns outcomes; scene rendering never writes a score or runs background fixtures.
- Quick Sim and Watch Match remain available and independent of the playable runtime.
- Input is normalized intent, with player/keeper ability and pressure still meaningful.
- Real eligible chances govern selection, with a cap rather than a guaranteed quota.
- Per-file provenance, lazy loading, cleanup and reduced motion remain mandatory.
- No browser/E2E suite is reintroduced; use pure contracts and hands-on preview inspection.

## Evidence and limits

Repository anchors at the reviewed SHA:

- [shot/phase resolver and 14-field packet](https://github.com/howellsryan/pitch/blob/0385f0206f37c81c3e44d99034393b195ee736df/src/modules/matchActionResolver.js)
- [phase orchestration](https://github.com/howellsryan/pitch/blob/0385f0206f37c81c3e44d99034393b195ee736df/src/modules/matchEngine.js)
- [match UI lifecycle](https://github.com/howellsryan/pitch/blob/0385f0206f37c81c3e44d99034393b195ee736df/src/lib/ui/MatchScreen.svelte)
- [Broadcast projection](https://github.com/howellsryan/pitch/blob/0385f0206f37c81c3e44d99034393b195ee736df/src/game/broadcastSimulation.js)
- [version contract](https://github.com/howellsryan/pitch/blob/0385f0206f37c81c3e44d99034393b195ee736df/src/modules/matchSimulationVersion.js)
- [knockout resolution](https://github.com/howellsryan/pitch/blob/0385f0206f37c81c3e44d99034393b195ee736df/src/modules/cups.js)
- [legacy bundler](https://github.com/howellsryan/pitch/blob/0385f0206f37c81c3e44d99034393b195ee736df/src/build.py), [Vite config](https://github.com/howellsryan/pitch/blob/0385f0206f37c81c3e44d99034393b195ee736df/vite.config.ts)

External primary sources and their precise implications are in the architecture
document. This review does not certify clip inventories, browser performance,
animation quality, game feel or migration correctness. Those are explicitly
scheduled POC/MVP proofs, not assumed successes.
