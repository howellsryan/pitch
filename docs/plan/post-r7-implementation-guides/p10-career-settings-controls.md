# P10 Implementation Guide — Career Setup, Difficulty and Simulation Controls

> Planning document only. P10 is cross-cutting: its contract may land earlier, but this guide defines the completion phase. It does not implement P10.

## Outcome

P10 makes Pitch's depth configurable without hidden handicaps or divergent game logic. Every career stores explicit versioned settings, presets expand to those values at creation, existing careers keep current behaviour, and balance-affecting changes apply only at safe world-week boundaries.

## Entry gate

Inventory every subsystem setting seam already introduced by P3–P9. Do not add controls for behaviour that has no tested central selector.

Verify:

- deterministic seeds/baselines exist for match, development, transfer, manager and story systems;
- existing saves can be proven equivalent to the intended Authentic defaults;
- one safe world-week boundary exists for applying queued changes;
- P1 always advances a coherent world.

## Locked architecture decisions

1. Persist a versioned careerSettings object on the save row.
2. A preset expands to explicit values when the career is created. Later tuning does not silently rewrite existing careers.
3. Existing careers migrate to values that reproduce their pre-P10 behaviour.
4. Difficulty changes uncertainty, frequency, financial/board pressure and AI decision quality—not hidden rating penalties, scripted results or user-only bad luck.
5. All leagues still play coherent fixtures/results. Simulation breadth may reduce retained detail or batching frequency, never freeze/fake the world.
6. Balance-affecting changes queue and apply at an empty pending-event/world-week boundary.
7. Accessibility/presentation controls may change immediately and stay separate from career-balance settings.
8. Subsystems read one central settings registry/selector; no scattered preset-name branches.
9. Custom values are validated and clamped with plain-language consequences.
10. Record material settings changes in career metadata/history.

## Settings contract

Organise settings by subsystem rather than a flat bag of magic numbers.

| Group | Candidate controls |
|---|---|
| Match | Simulation variance within tested bounds |
| Health | Injury frequency, recovery/reinjury severity |
| Development | Growth speed and potential uncertainty |
| Transfers | Strictness, activity and negotiation pressure |
| Board/manager | Board strictness, job-market activity |
| Finance | Operating pressure and AI spending caution |
| Scouting | Uncertainty and report speed |
| Stories | Event frequency |
| World | History detail/retention and safe performance options |
| Presentation | Separate immediate controls; not career difficulty |

Use semantic values or documented ranges that map through subsystem adapters. Do not expose internal formulas directly.

## Presets

### Casual

Lower administration/uncertainty and gentler pressure while preserving fair football outcomes and an active world.

### Authentic

The exact current balanced/default behaviour at migration time. This is the compatibility anchor.

### Hardcore

Stricter information, finance, contract and board consequences within the same football rules.

### Custom

Explicit validated values with reset-to-preset and consequence summaries.

No preset may give the user a hidden match-engine penalty.

## Work packages

### WP1 — Registry, schema and migration

- Define setting IDs, types, ranges, defaults, descriptions and owning subsystem.
- Define settings version and ordered migration.
- Expand presets into explicit settings.
- Backfill existing saves to Authentic-equivalent values.
- Store the resolved settings snapshot in career metadata/export.
- Add pure validation and preset-equivalence tests.

Gate: an old save and a migrated Authentic save produce identical seeded baseline outputs.

### WP2 — Central subsystem adapters

- Add one settings selector/adapter per subsystem.
- Route existing constants through adapters while keeping default results unchanged.
- Land one subsystem at a time with deterministic equivalence tests.
- Remove direct preset checks and duplicate defaults.
- Keep optional settings seams introduced earlier backward-compatible.

Gate: default behaviour is unchanged before any UI/control ships.

### WP3 — Safe change lifecycle

- Separate immediate presentation changes from queued balance changes.
- Validate and stage pending changes with effective gameweek/date.
- Apply only when save.pendingEvents is empty and the world week has settled.
- Record previous/new values and effective date in compact metadata.
- Prevent changes that would invalidate an active deal/event/challenge unless a documented transition exists.
- Make reload/retry idempotent.

Gate: changing a setting between two matches in one week cannot create mixed rules.

### WP4 — Preset and Custom product surface

- Add preset selection to new-career setup.
- Add consequence summaries, not vague Easy/Hard labels.
- Add Custom controls with validation, reset and unsaved/pending state.
- Show which changes apply now versus next gameweek.
- Keep controls mobile-first and grouped progressively.
- Add contextual help.

Gate: a user understands what becomes harder/easier without reading formulas.

### WP5 — World/performance controls

Only after P1/P3–P9 benchmarks identify meaningful savings:

- reduce retained detailed history while keeping compact season summaries;
- adjust optional report/event detail;
- change safe batch/detail policies without changing results;
- never stop leagues, fabricate tables or omit transfers that affect the world.

Gate: careers at every supported breadth remain coherent and inspectable.

### WP6 — Balance and fairness validation

- Build seeded comparison reports across presets.
- Verify match outcomes are not directly handicapped.
- Verify injuries, transfers, finances, scouting, development, manager market and stories move in documented directions.
- Check AI/user symmetry where applicable.
- Run multi-season distribution and solvency tests.
- Document the default version used by each new career.

Gate: preset differences are explainable and remain within regression bands.

## Persistence and compatibility

- careerSettings is additive unless a future incompatible export format requires an envelope bump.
- Preserve resolved values across local/cloud export/import.
- Imported challenges may override only allow-listed settings through P11.
- A later app version migrates old setting versions explicitly; it does not reinterpret a preset label.
- Store compact change history, not every UI interaction.
- Existing Accessibility/Settings values keep their current storage contract until deliberately migrated.

## Test matrix

| Area | Required evidence |
|---|---|
| Migration | Existing career equals Authentic defaults |
| Registry | Type/range/default/owner validation |
| Equivalence | Seeded subsystem outputs before/after adapter routing |
| Safe boundary | Pending user events, queued apply, reload/retry |
| Presets | Directional comparisons and no hidden match handicap |
| Custom | Clamp, invalid values, reset and persistence |
| Export/cloud | Resolved values and pending changes round-trip |
| World | Coherent fixtures/stats/history at every breadth option |
| UI | Mobile setup/settings and help; wide custom layout |
| Long horizon | Preset distributions, performance and storage |

## Commit and push plan

1. Registry/schema/migration and Authentic equivalence tests.
2. Match/health/development adapters.
3. Transfer/scouting/manager/finance/event adapters.
4. Safe queued-change lifecycle.
5. Presets and new-career integration.
6. Custom Settings/help.
7. Evidence-based world/performance controls.
8. Multi-preset balance, E2E, export/cloud and documentation.

## Exit criteria

- every control has one tested owner/adapter;
- existing careers retain current behaviour;
- presets store explicit values;
- balance changes apply only at safe boundaries;
- no preset scripts results or penalises user ratings;
- every world remains coherent;
- mobile, deterministic and long-horizon evidence pass.

## Explicit deferrals

- Challenge-defined overrides belong to P11 and must use the allow-list.
- League/content selection belongs to P12 content packs, not a performance shortcut.
