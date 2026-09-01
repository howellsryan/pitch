# P11 Implementation Guide — Creator Challenges and Live Starts

> Planning document only. This guide ships creator challenges locally first. Live Starts are a separate later adapter and product promise. It does not implement P11.

## Outcome

P11 lets users create, import and share safe, versioned career scenarios built from approved football-domain operations. A challenge creates a normal career, records its constraints/objectives, evaluates completion deterministically and never imports arbitrary save/IndexedDB state.

## Entry gate

Verify:

- P0 career factory/slots/export migrations are stable;
- P10 career settings and allow-listed overrides are canonical;
- P1–P9 domain commands exist for every supported scenario mutation;
- P8 event/effect safety patterns are available;
- stable team/player/competition identifiers are documented;
- local challenge format can ship without accounts or server authority.

Do not couple local challenges to Cloudflare sharing or Live Starts.

## Locked architecture decisions

1. A challenge is schema-validated configuration, never a raw save snapshot.
2. Challenge setup invokes approved domain commands against a normal new-career factory.
3. The source definition, version, hash and applied setting overrides remain in career metadata.
4. Objectives and restrictions are pure, deterministic and evaluated from canonical state.
5. Completion/reward state is idempotent.
6. Local text/file create/import/export ships first.
7. Cloud short codes/discovery are an optional later service slice with validation, rate limits and moderation.
8. Live Starts mean dated real-world career snapshots, not live/manual football.
9. Live Starts require a legal, maintainable data source and separate replaceable ingestion adapter.
10. No account is required to create or play local challenges.

## Challenge definition

A versioned definition may contain only approved fields:

- metadata: title, summary, author label, difficulty, version;
- base: club, season/date/gameweek and supported content/settings versions;
- table/competition context through approved commands;
- squad availability edits, injuries and suspensions;
- budget/debt, embargo and points-deduction conditions;
- signing, nationality, age, academy/homegrown or tactical restrictions;
- objectives, milestones and failure conditions;
- allow-listed P10 settings overrides;
- optional explanatory intro.

Do not allow arbitrary JavaScript, property paths, HTML, remote URLs or full player objects.

## Objective/restriction contract

Support small composable predicates:

- league position/points/survival/promotion;
- cup/European progress;
- deadline/date;
- squad composition and age/nationality/homegrown counts;
- transfer/spending restrictions;
- academy appearances/development;
- tactical formation/instruction restrictions;
- finance/debt recovery;
- manager reputation/job outcomes where safe.

Validate impossible or contradictory conditions before career creation when detectable.

## Work packages

### WP1 — Schema and security validator

- Define versioned challenge schema and size/count limits.
- Validate IDs against installed content packs.
- Allow only approved mutations, settings and objective predicates.
- Return actionable path-specific errors.
- Add migration policy for older definition versions.
- Add hostile/malformed input fixtures.

Gate: arbitrary save fields/code/URLs cannot pass validation.

### WP2 — Deterministic career factory

- Start from the normal P0 new-career path in an isolated slot.
- Apply scenario mutations through domain commands in fixed order.
- Validate invariants after each stage.
- Commit the career only after the full scenario validates.
- Backing out/failure leaves the existing active career untouched and removes temporary state.
- Store definition hash/version and mutation summary.

Gate: same definition/content/settings version produces the same starting state.

### WP3 — Objectives, restrictions and completion

- Evaluate progress from canonical selectors at safe boundaries.
- Surface restriction checks before illegal commands complete.
- Keep challenge rules out of match result scripting.
- Apply completion/failure once with an idempotency key.
- Preserve progress across export/import/cloud.
- Add impossible-condition warnings and creator preview.

Gate: reload cannot complete/fail twice, and no restriction silently changes a result.

### WP4 — Creator and local sharing UI

- Add a guided creator using supported fields rather than raw JSON as the primary path.
- Provide expert JSON import/export with validation.
- Add curated starter templates/examples.
- Preview the start state, objectives, restrictions and compatibility requirements.
- Integrate with Career Menu/new-career flow.
- Keep mobile creation progressive; dense advanced configuration also needs a wide check.

Gate: create → validate → start → export → import → resume works without an account.

### WP5 — Curated challenge pack

- Ship a small reviewed pack covering survival, lower-league rise, academy-only, debt/embargo, age-limited recruitment and no-signing recovery.
- Use bespoke/unlicensed copy and maintainable identifiers.
- Add deterministic golden starts and completion tests.
- Keep curated definitions versioned with the app.
- Avoid quantity before the format is stable.

Gate: every curated challenge remains constructible and achievable under its supported version.

### WP6 — Optional Cloudflare short codes

Only after local format stabilises:

- validate again on the server;
- store immutable definition/version/hash and moderation metadata, not user saves;
- generate non-guess-sensitive short codes;
- add size/rate limits and abuse reporting/moderation;
- keep accounts optional for play, with ownership only where editing/moderation needs it;
- version D1 migrations and server contract.

Gate: server rejection cannot be bypassed by a locally valid-looking payload.

### WP7 — Live Start adapter spike

Treat as a separate spike/deliverable:

- identify a licensed/provenance-safe data source and update cadence;
- define normalized dated snapshot schema;
- map source IDs to stable Pitch IDs;
- validate fixtures/tables/squads/injuries/transfers and competition rules;
- define expiration/version/support policy;
- produce a challenge-compatible starting definition;
- measure maintenance cost before promising the feature.

If the source/legal/maintenance gate fails, stop. Creator challenges remain complete without Live Starts.

## Creation ordering

1. validate definition and compatibility;
2. allocate temporary isolated career context;
3. create a normal base career;
4. apply approved settings overrides;
5. apply table/competition/finance/squad/status mutations;
6. attach restrictions/objectives/metadata;
7. run invariant validation;
8. commit slot and activate only on success.

Never mutate the current active career in place to start a challenge.

## Persistence and compatibility

- Store original definition, version/hash and compact progress metadata.
- Do not store arbitrary creator prose repeatedly in event/history rows.
- Export/import includes the definition and supported-version information.
- If required content is unavailable, fail before career creation with a clear message.
- Later definition migrations are explicit; never silently reinterpret objectives.
- Short-code fetch materialises the same local validated definition.
- Challenge careers remain ordinary careers for world/player/history persistence.

## Security and test matrix

| Area | Required evidence |
|---|---|
| Schema | Valid cases, unknown fields, size/count limits, version migration |
| Security | Script/HTML/URL/property injection, prototype-like keys, invalid IDs |
| Factory | Atomic success/failure, slot isolation, deterministic start |
| Objectives | Progress, completion, failure, contradictions, idempotency |
| Restrictions | Transfers, tactics, squad, finance and academy commands |
| Persistence | File/text, export/import/cloud and missing content |
| Curated pack | Golden start and achievable completion |
| UI | Mobile creator/player journey and wide advanced editor |
| Optional service | Server revalidation, rate limit, moderation and D1 migration |
| Live Start spike | Provenance, mapping, lifecycle and maintenance decision |

## Commit and push plan

1. Schema/validator/security fixtures.
2. Deterministic isolated career factory.
3. Objective/restriction evaluators.
4. Progress/completion persistence.
5. Creator/import/export UI.
6. Curated challenge pack.
7. E2E/compatibility/documentation.
8. Optional short-code service in a separate reviewed slice.
9. Live Start spike in a separate plan/branch only after the data gate.

## Exit criteria

Creator challenges are complete when:

- no raw save state is imported;
- failed creation cannot damage another slot;
- objectives/restrictions are deterministic and idempotent;
- local sharing works without an account;
- curated scenarios pass golden tests;
- mobile and full-suite evidence pass.

Live Starts are not part of this completion claim unless their separate provenance, ingestion, lifecycle and verification gates pass.

## Explicit deferrals

- Public discovery/voting/moderation may follow short codes.
- Real-time/manual football is permanently out of scope.
- New content packs and international management belong to P12.
