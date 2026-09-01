# P12 Implementation Guide — Long-term Content Expansion

> Planning document only. P12 is a programme of separate content work packages, not one implementation branch. It does not implement P12.

## Outcome

P12 expands breadth only after systemic depth is stable. The first content programme adds second tiers in Spain, Germany, Italy and France through shared rules/data pipelines, strengthening promotion, recruitment and manager movement without country-specific code forks.

International management, Create-a-Club and women's club football remain separate product programmes with their own plans and quality gates.

## Entry gate

Verify before any production content pack:

- P0 competition rules express tier links, entry and qualification without scattered round/index magic;
- P1 world simulation/history/population scales within mobile budgets;
- P4/P5 recruitment and P6 manager market support club movement across configured leagues;
- P7 finance/board philosophy and P9 pathways are league-agnostic;
- P10 settings/content compatibility and P11 challenge IDs are versioned;
- data provenance, maintenance owner and reconciliation pipeline are documented.

Do not treat existing conditional references to future leagues as proof that their data/rules are production-ready.

## Current repository baseline

- Nine leagues and 186 clubs are active.
- English four-tier movement is the deepest tier chain.
- League data is generated/reconciled through CSV and Node tools.
- src/data/extraLeagues.js and conditional future-league references require inventory; they are not an implementation contract.
- competitionRules.js owns the configurable competition foundation.
- promotion.js, season.js and some UI priority/zone lists still contain league-specific assumptions.
- club accent validation covers the current club set.
- P1 performance baseline covers the current 186-club world.

## Locked architecture decisions

1. System depth remains higher priority than league count.
2. First production expansion order: Spain, Germany, Italy and France second tiers.
3. Add one country end-to-end at a time and keep each pack independently reviewable.
4. New leagues use shared competition, tier, cup-entry and season rules. No new country conditionals scattered through lifecycle code.
5. Content packs have stable IDs, version and compatibility metadata.
6. Existing career IDs/history remain stable when a pack is installed or the app updates.
7. Every dataset/asset has provenance and a maintenance path. Do not copy protected game assets/data.
8. Re-run world, market, manager, finance, population and storage tests after each pack.
9. International management, Create-a-Club and women's club football are separate programmes.
10. Browser load/build size and 15-season mobile viability are release gates.

## Phase A — Generic tier/content-pack foundation

Before the first new division:

- inventory every league-name conditional in rules, promotion, season, fixtures, UI, data loading and tests;
- define league/division/content-pack registry with stable IDs, country, tier, team count, calendar, promotion/relegation/playoff links, cup entries and enabled/version state;
- make competition rules consume the registry;
- make fixtures/standings/season rollover/promotion consume configured tier links;
- make UI league ordering, zones and labels data-driven;
- make world history/newgen nationality/context consume registry data;
- define career compatibility when new packs appear;
- extend validation for duplicate IDs, broken tier links, missing assets and unsupported team counts.

Gate: current nine leagues reproduce identical seeded schedules, promotion and history before adding content.

## First expansion — second tiers

For each country pack, complete the full route before starting the next.

### 1. Spain second tier

- rules, clubs/players, promotion/relegation/playoffs;
- domestic cup entry and schedule;
- transfers/loans/manager movement across tiers;
- history/newgens/academy context;
- UI and performance.

### 2. Germany second tier

Repeat the same pipeline using configured German rules. Do not fork Spanish code.

### 3. Italy second tier

Repeat with configured Italian rules and verified promotion/playoff assumptions.

### 4. France second tier

Repeat with configured French rules and verified promotion/relegation assumptions.

The exact order may change only for a documented data/provenance blocker. One pack must prove the generic architecture before parallel data work begins.

## Per-pack work packages

### WP1 — Rules and identifiers

- Research/verify current format from primary competition sources at implementation time.
- Define stable league, club and competition IDs.
- Configure team count, calendar, tiebreaks, promotion/relegation/playoffs and cup entry.
- Add deterministic rule tests.

### WP2 — Data pipeline

- Add source/reconciliation inputs through existing Node tooling.
- Validate required team/player fields, ratings, potentials, nationalities and club identity.
- Keep generated JS derived from source pipeline; do not hand-edit generated league output.
- Record provenance/version/date and maintenance steps.

### WP3 — Living-world integration

- Generate fixtures/standings/history.
- Include the tier in background domestic competitions.
- Extend promotion/relegation and season rollover.
- Validate newgen/player population and squad sizes.
- Preserve apply-once projection and bounded writes.

### WP4 — System integration

- P4/P5 recruitment and squad needs across tiers;
- P6 vacancies/appointments and reputation movement;
- P7 finance/objective calibration;
- P9 academy/loan pathways;
- P11 challenge identifier compatibility.

### WP5 — Product and validation

- Data-driven competition navigation/zones.
- Club identity/accent coverage.
- Entry/club selection where appropriate.
- Mobile/wide inspection and cross-tier stories.
- P1 performance/storage and 15-season simulation.

## Save/content compatibility

- A career records enabled content-pack versions at creation.
- Define whether newly shipped packs become available to an existing career. Prefer a safe migration that initialises them at the next season boundary; otherwise keep the existing career's world set stable and explain why.
- Never remove/reuse stable IDs.
- Import fails clearly if a required pack/version is unavailable.
- Challenge definitions declare required packs.
- Promotion/manager/transfer histories retain IDs even if display data updates.
- Pack migration must be deterministic and bounded.

## Performance gates after every pack

Measure at the established mobile-class target:

- fresh career load;
- full world-week simulation;
- IndexedDB size after fresh week and 15 seasons;
- season rollover;
- transfer/manager market tick;
- player population/average quality;
- build/download size and first usable screen.

Do not simply raise existing ceilings. Investigate full-world scans/writes and batch/detail policies first.

## Separate future programme — international management

Create a dedicated plan covering:

- international competition rules/calendars/qualification;
- national-team selection and eligibility;
- dual club/national manager employment;
- player workload/injury and club release;
- world history/awards;
- job market/reputation;
- UI and simulation performance.

International fixtures must use the authoritative fast match engine and coexist with club calendars. Do not bolt them onto domestic cup state.

## Separate future programme — Create-a-Club

Create a dedicated plan covering:

- bespoke/unlicensed identity, colours, kits/crest system and stadium abstraction;
- league placement/replacement rules;
- starting squad/budget/philosophy/facilities;
- stable generated IDs and content compatibility;
- career/challenge integration;
- identity asset generation/provenance.

A created club uses normal club rules and stores; it is not a privileged special-case team.

## Separate future programme — women's club football

Treat as a deliberate data/competition expansion:

- researched competition structures/calendars;
- dedicated clubs/players and maintainable data;
- calibrated ratings, transfers, finance, academy and history;
- appropriate continental/international pathways;
- product identity and quality review.

Do not model it as a cosmetic swap over men's league assumptions.

## Test matrix

| Area | Required evidence |
|---|---|
| Generic registry | Existing nine-league equivalence and validation |
| Rules | Team count, schedule, tiebreak, promotion/playoff/cup entry |
| Data | Schema, IDs, roster quality, provenance and regeneration |
| World | Fixtures, standings, history, cups, rollover and apply-once |
| Systems | Transfers, loans, managers, finance, academy and challenges |
| Save | New/existing career policy, export/import and missing pack |
| Long horizon | Population, quality, club movement and solvency |
| UI | Mobile/wide league/club/tier inspection |
| Performance | Per-pack load/week/rollover/storage/build size |
| Licensing | Recorded source/asset ownership and maintenance owner |

## Commit and PR plan

Generic foundation:

1. Inventory and current-behaviour characterisation.
2. Content-pack/tier registry.
3. Generic promotion/season/cup-entry integration.
4. Data-driven UI/history/newgen integration.
5. Existing-world equivalence and performance evidence.

Then one reviewable country pack at a time:

1. rules/IDs/tests;
2. data/reconciliation;
3. world/system integration;
4. UI/identity;
5. long-horizon/performance/docs.

Use separate branches/PRs where a country pack is independently shippable. Do not combine all four divisions into one unreviewable change.

International management, Create-a-Club and women's club football each begin with their own plan-gated design branch after the second-tier programme proves the generic foundation.

## Exit criteria for the second-tier programme

- four second-tier packs use one generic registry/rules pipeline;
- promotion/relegation, transfers, loans and manager movement work across each tier;
- no country-specific lifecycle branches were added outside configuration/adapters;
- save/content compatibility is explicit;
- data provenance and regeneration are documented;
- P1 performance/storage and 15-season quality remain viable on mobile;
- full repository and rendered acceptance evidence pass per pack.

## Explicit non-goals

- More top-flight-only countries before second-tier/system quality.
- Manual/live football.
- Unlicensed copied visual assets.
- Promising live current-season data without a maintained legal pipeline.
- Shipping international/Create-a-Club/women's football as one combined content phase.
