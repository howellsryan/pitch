# Data and simulation hygiene

Read before data pipelines, player-model or world persistence changes.
Paths are repository-relative.

## 5) Data and simulation hygiene

- `src/data/` contains league/team/player data; use the existing CSV/reconciliation tooling rather than hand-editing generated league JS when a pipeline exists.
- Preserve licensing/provenance discipline. Do not copy protected game assets/data to close content gaps.
- P1 onward must be benchmarked for long-career IndexedDB growth, gameweek processing and mobile load time. A 15-season career must remain practical on a phone.
- Avoid full-world writes when only a bounded subset changed. P1 deliberately narrows cup persistence to participating clubs and league persistence to changed player rows.
- P2 established seeded/injectable RNG and statistical regression coverage; P3 extends it through development, decline, position conversion and reinjury. Later balance paths must not reintroduce unseeded randomness.
- P3's player-model modules are pure/DOM-free and must not import `matchEngine.js`, IndexedDB or UI. Durable baseline ability remains the existing attack/midfield/defence/goalkeeping data; derived effective level must not be separately persisted.

