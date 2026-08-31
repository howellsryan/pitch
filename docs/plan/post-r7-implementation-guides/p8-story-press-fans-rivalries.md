# P8 Implementation Guide — Story Engine, Press, Fans and Rivalries

> Planning document only. This guide assumes P3, P6 and P7 are complete. It does not implement P8.

## Outcome

P8 turns real simulation state into memorable, decision-driven career stories. A deterministic rule engine selects eligible events, the Inbox becomes the action surface, choices execute typed domain commands, and follow-ups remember prior decisions without requiring an LLM or server call.

## Entry gate

Verify:

- P3 owns individual morale, promises, rehabilitation and transfer intent;
- P6 owns manager employment, job security and vacancies;
- P7 owns board, finance, philosophy and facilities;
- P4 owns transfer/contract state machines;
- the completed world-week boundary is stable and idempotent;
- the current Inbox/news path and screen mounting are understood.

P8 must not invent placeholder player, job or finance meters.

## Current repository baseline

- save.inbox is a bounded-looking array of informational news items.
- src/ui/inbox.js owns a legacy innerHTML screen renderer plus news helper functions.
- main.js imports inbox.js for side effects; there is no mounted InboxScreen.svelte.
- Home shows a compact waiting/decision list but most items route elsewhere.
- save.pendingEvents is the load-bearing football match queue.
- P1 season history can store compact decisions/records.
- P2 provides stable hashing/seeded simulation patterns.

## Locked architecture decisions

1. Core stories are deterministic, rule-based and local. No LLM/server dependency for career progression.
2. Narrative events are not football pending events. Never overload save.pendingEvents.
3. Templates declare trigger, participants, priority, cooldown, expiry, choices, effects and follow-ups.
4. Effects call approved domain commands from P3/P4/P6/P7/P9. The Inbox never edits save/player/team objects directly.
5. Event instances store template/version IDs, participant references, status and compact decision state—not duplicated prose-heavy histories.
6. Evaluation occurs once after the world week and relevant domains settle.
7. Effects are idempotent with application keys; reload/rapid tap cannot apply a choice twice.
8. Press, fan sentiment and rivalries are contextual inputs/outputs, not permanent dashboard meters.
9. Migrate the Inbox to a Svelte action surface rather than expanding the legacy innerHTML renderer.
10. Content volume is capped by priority, cooldown and outstanding-action limits.

## Event template contract

Each template requires:

- stable template ID and version;
- category and importance;
- eligibility predicate over a read-only career snapshot;
- participant selectors and fallback rules;
- cooldown/deduplication key;
- deterministic priority/tie-break;
- generated context tokens from approved fields;
- choices with trade-offs, domain commands and validation;
- expiry behaviour;
- optional follow-up template/state;
- authoring/test metadata.

Keep presentation copy separate from domain effects. Templates may evolve, but an existing instance remains resolvable through its stored template version or migration.

## Event instance contract

Persist in a bounded save.careerEvents domain:

- stable instance ID and deterministic seed;
- template ID/version;
- created/due/expiry gameweek and status;
- participant IDs and compact context snapshot needed for stable copy;
- selected choice and effect-application key;
- follow-up state;
- resolution summary code.

At season rollover, compact resolved instances into a small decision-history summary and retain only cross-season follow-ups.

## Work packages

### WP1 — Event schema and evaluator

- Define templates, instances, statuses, eligibility results and deterministic IDs.
- Build a read-only career snapshot from canonical domain selectors.
- Add cooldown, deduplication, priority and outstanding-event caps.
- Evaluate only at the completed world-week boundary.
- Add replay tests proving identical seed/state produces identical selection.

Gate: reopening the same gameweek cannot generate a second instance.

### WP2 — Command/effect boundary

- Define an allow-list of domain commands and typed parameters.
- Validate command preconditions again at choice time because state may have changed.
- Apply all effects for one choice atomically where they span stores.
- Record the idempotency key before/with commit.
- Return actionable failure/expiry states rather than partially applying.
- Never allow template-authored arbitrary property paths.

Gate: double tap/reload cannot apply morale, money, promise or job effects twice.

### WP3 — First vertical event slice

Ship a deliberately small cross-system set:

- repeatedly dropped captain or broken playing-time promise;
- youngster asks for loan;
- early return from injury;
- star contract/transfer concern;
- board warning after poor form;
- budget pressure or sale trade-off;
- manager approach/job decision.

Every choice must trade benefits/costs. Avoid one obviously correct option.

Gate: each event is triggered by real domain state and changes at least one other system.

### WP4 — Chained follow-ups and expiry

- Add follow-up states that can become eligible weeks later.
- Preserve participant identity through transfer, injury or manager movement.
- Define what happens when a participant is no longer valid.
- Add expiry/default consequences.
- Keep chains finite and observable.
- Include prior decisions in later context without retaining full prose.

Gate: a chain resumes correctly after export/import and cannot resolve after expiry.

### WP5 — Svelte Inbox and Home projection

- Create InboxScreen.svelte and mount it in main.js.
- Preserve informational news through a compatibility projection while migrating legacy helpers.
- Provide Pending, Resolved and News views with clear deadlines/status.
- Dispatch domain commands from explicit actions.
- Make Home show only the highest-priority actionable items.
- Remove the legacy screen renderer only after all callers and badges migrate.
- Retain 44×44 controls, focus-visible and safe-area behaviour.

Gate: no decision exists only in rendered DOM, and all actions remain reachable at 390×844.

### WP6 — Press moments

- Trigger only around derbies, finals, title/relegation run-ins, major transfer sagas, job events and serious internal issues.
- Use the same template/effect engine.
- Connect answers to real morale, confidence, board or player state.
- Avoid weekly press repetition.
- Keep copy compact and consequence explanations visible.

Gate: press cannot change an authoritative match result or create hidden scripted outcomes.

### WP7 — Rivalries and fan/media context

- Add a bounded club-relationship/rivalry map using stable club IDs.
- Seed known competition/geographic relationships only from maintainable data; allow simulated history to nudge intensity within caps.
- Derive fan/media pressure from results, expectations, derbies, major sales and decisions.
- Feed context into event likelihood, board confidence and tone.
- Do not add permanent nav/dashboard meters.

Gate: context affects decisions/events but does not become a second board/job system.

### WP8 — Content authoring and safeguards

- Document template authoring, allowed commands, cooldown conventions and test fixtures.
- Add validation that fails build/test for duplicate IDs, invalid participants, unknown commands or impossible expiry.
- Add content coverage reports by subsystem/season frequency.
- Keep templates in versioned, reviewable source files.
- Add localisation-ready token boundaries without introducing a localisation programme.

Gate: a bad template cannot silently ship or corrupt a save.

## Weekly ordering

After P3/P4/P6/P7/P9 systems have completed for the world week:

1. build a read-only career snapshot;
2. apply due follow-up/expiry transitions;
3. evaluate eligible templates;
4. select a bounded set deterministically;
5. persist instances;
6. project actionable/news views to Inbox/Home;
7. advance the career date/gameweek.

User choices may occur between weeks, but their commands must validate against current state and remain idempotent.

## Persistence and migration

- Additive save.careerEvents can remain in the current save envelope if import semantics stay compatible.
- Migrate save.inbox items as News projections or retain them behind a compatibility reader; do not convert informational history into fake unresolved decisions.
- Compact by season and cap unresolved/resolved retention.
- Cloud/local exports preserve active chains, deadlines and applied-effect keys.
- A P6 club move keeps manager-owned story history while club/player participants remain referenced by stable IDs.
- Template migrations must be explicit when an unresolved instance's version is retired.

## Deterministic test matrix

| Area | Required evidence |
|---|---|
| Eligibility | Positive/negative fixtures for every template |
| Selection | Priority, cooldown, dedupe, caps and seeded ties |
| Effects | Legal commands, stale precondition, atomicity, idempotency |
| Chains | Follow-up, participant invalidation, expiry, season crossover |
| Replay | Same seeded career produces same event sequence |
| Migration | Existing Inbox news remains readable |
| Integration | P3 promise/injury, P4 transfer, P6 job, P7 finance/board |
| UI | Mobile pending/resolved/news and action confirmation |
| Storage | Multi-season compaction and bounded save growth |

## Commit and push plan

1. Template/instance contracts and validator.
2. Deterministic evaluator/cooldowns.
3. Domain command/effect boundary.
4. First vertical event slice.
5. Follow-ups/expiry/compaction.
6. Svelte Inbox and legacy compatibility.
7. Press moments.
8. Rivalry/fan/media context.
9. Replay/E2E/storage evidence and authoring documentation.

## Exit criteria

- all decisions originate from real state;
- no core event requires a server/LLM;
- effects execute only through approved commands;
- event generation/effects are idempotent;
- save.pendingEvents remains football-only;
- Inbox is a Svelte action surface and legacy news remains readable;
- event frequency/storage stay bounded;
- mobile/replay/full-suite evidence pass on the final SHA.

## Explicit deferrals

- Academy and live loan-report stories can be added after P9.
- Event-frequency/pressure controls belong to P10.
- Community-authored challenge narrative belongs to P11, through validated schemas rather than arbitrary templates.
