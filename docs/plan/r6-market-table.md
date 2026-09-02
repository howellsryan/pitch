# R6 — Market and Table

> **Status: done.** This note supplements `07-redesign.md` and records the implementation choices that matter to future agents.

R6 is intentionally a **presentation/density pass over mature screens**, not another feature rewrite. Transfers and League already had the required data flows and interactions; the work here makes them read as one product with R0–R5 without disturbing the difficult behaviour underneath.

## Market

`src/lib/ui/TransfersScreen.svelte` remains the functional owner of Buy / Sell / Loans / Free Agents, filtering, negotiation sheets and the windowed ~3,000-player list.

R6 styling lives in `src/r6.css`, loaded after `app.css` from `src/main.js`. The rules are scoped under `#screen-transfers` and deliberately use higher specificity than the component's pre-redesign scoped styles. This avoids a risky markup/logic rewrite solely to change visual treatment.

The visual direction is the `SpineMarket.dc.html` idea translated into the final Kickoff token system:

- flat rows rather than floating cards;
- tabular numerals and restrained metadata;
- budget/status information kept compact in the header;
- active tabs and filter chips use `--color-accent`, not club colour;
- club colour remains identity, not a generic action colour;
- search/filter controls are compact and near-square;
- list rows keep rating/value scannable at a glance;
- Sell/Loan/Free rows use the same flat density language as Buy.

### Virtualisation is load-bearing

Do **not** change Transfers' height chain casually.

The window is still based on:

- `ROW_H = 68` in `TransfersScreen.svelte`;
- `.buy-scroll { flex:1; min-height:0; overflow-y:auto; }`;
- a positioned `.buy-spacer` with only the visible slice rendered;
- the shell keeping `#screen-transfers` as a flex column rather than forcing `display:block!important`.

R6 keeps the actual row at 62px plus its existing 3px inset inside each 68px virtual slot. The visual flattening does not alter the virtual coordinate system.

`tests/r6-market-table.spec.mjs` starts a real career, opens Market at 390×844, confirms the scroll container is genuinely scrollable, asserts fewer than 40 rows are in the DOM, scrolls deep into the list and verifies the rendered window changes. If that test fails after a CSS change, treat it as a functional regression, not a styling disagreement.

## Table

`src/lib/ui/LeagueScreen.svelte` remains the owner of table data, recent results, qualification/relegation zones, user-row highlighting and `animate:flip` reordering.

R6 makes the screen deliberately plain and dense:

- table/results cards lose the soft floating-card treatment;
- rows become ruled, flat lines;
- the user club keeps the club-colour identity stripe/wash;
- qualification/relegation semantics stay unchanged;
- numeric columns stay monospaced/tabular;
- Recent Results uses the same ruled-row language;
- mobile remains the compact four-column table already chosen by the component;
- desktop keeps the full statistics/form columns.

The R6 browser check (since retired with the E2E suite) confirmed all 20 Premier League rows render, exactly one user row remains identifiable, and the flat density rules are actually present at runtime.

## Why a global R6 layer

The existing component styles predate the final redesign but the behaviour is already correct. A global screen-scoped layer gives R6 three useful properties:

1. no transfer/game logic churn for a visual phase;
2. no accidental rewrite of Transfers' flex/virtualisation chain;
3. the R6 treatment can be retired cleanly later if these screens get a deeper component rewrite.

Do not move these rules into `shell.html`; the legacy build does not need the redesign-only presentation layer, and keeping them in the Vite graph makes ownership explicit.

## Next

R7 — Academy, Trophies, Settings and Inbox, including the deferred Continue/New Career route work and the required stale-fixtures/standings fix before making a new career reachable from an existing save.