# Players Market contracts

Read when changing these domains; do not load for unrelated work. Paths in code
spans are repository-relative. These are maintained constraints; verify volatile
implementation details against the current checkout.

### Player Model 2.0 — P3 foundation

- `src/modules/playerModel.js` owns the additive v4 player contract and shared baseline/effective-level selectors. Durable ability remains attack/midfield/defence/goalkeeping; effective level is derived and must not be persisted as a competing rating.
- `src/modules/playerPathways.js`, `playerDevelopment.js` and `playerRehabilitation.js` own position suitability/traits, seeded growth profiles and the explicit injury-return state machine. They are pure, DOM/DB-free dependencies loaded immediately before `playerModel.js` in the legacy bundle.
- Match selection, transfers, Squad and Academy consume the canonical selectors. Preserve exact XI/bench ordering when optimising hot rating paths; caches must be scoped to the player object/snapshot because world projection creates same-ID copies at different lifecycle states.
- P3 personal state and development settle once per completed world week. League projection settles completed background clubs, competition projection settles deferred cup/European clubs, and ordinary final P3 settlement loads only the managed squad. League-less/cup-only weeks retain the full-world P3 fallback.
- Existing careers receive an idempotent player-row/domain backfill without a `DB_VERSION` change, preserving baseline ability, IDs, ownership, loans, history, formation and lineup.

### Matchday squad: XI, bench, reserves

- `matchEngine.js` owns the whole selection contract: `MAX_MATCHDAY_BENCH` (9),
  `selectBench`, `selectReserves`, `pruneBenchToSquad`. `save.bench` is an
  additive array of player ids; **`null` means automatic**, an array means the
  manager named it and is honoured **exactly** — no back-filling, because a
  back-fill silently undoes a removal. A named substitute who is injured or
  suspended therefore leaves an empty seat (shown as such on the Squad strip),
  exactly as a real team sheet would.
- The automatic bench reserves its **last** seat for a goalkeeper. Substitutes
  are shifted off the *front* and a match can use only three, so this — and the
  9-cap itself — leaves every AI/background result bit-identical. Do not
  reorder the bench without re-checking that.
- `save.bench` is threaded through the same seams as `save.lineup`
  (`gameweek.js` league/cup/European, `cups.js`, `managerTactics.js`'s
  `buildManagedMatchInputs`, `MatchScreen`) via `simulateMatch`'s existing
  `options`; `deriveMatchSeed` does not read it, so seeded parity is unchanged.
- **Because the bench is honoured exactly, an unresolvable id costs a
  substitute rather than being ignored.** Every path that moves a player out of
  the managed squad must clear their seat: `db.js`'s deal settlement (keyed on
  where each player *ends up*, so a loan-back player is not evicted),
  `transfers.js`'s `acceptOffer`/`loanOutPlayer`, `contracts.js`,
  `startingFreeAgents.js`, `season.js` rollover (retirees excluded),
  `managerClubHandover.js`. `SquadScreen`'s load-time `pruneBenchToSquad` is the
  self-heal, not the mechanism. `src/game/matchdaySquad.js`'s
  `reconcileBenchWithLineup` keeps the bench in step when the XI changes.
- There is **no squad-size ceiling**. The old 30-senior cap
  (`buyer_squad_full`, `SQUAD_FULL`, `DESTINATION_SQUAD_FULL`) is gone from
  settlement, squad planning, academy promotion and loans. Only the *selling*
  side is still guarded, so a club can never be left unable to field a team or
  without a keeper. `simulateAITransfers`' own `>= 28` appetite check stays —
  that is a club choosing not to buy, not a validation.

### Recruitment lists: scouted keys, not canonical rows

- `scoutingView.js`'s `projectScoutedListKey` is what the Buy list sorts and
  filters on. Filtering or ordering a world-sized list on canonical attributes
  both contradicts the fogged figures on screen and leaks true ability through
  the sort order, so **every ability/fee/potential predicate reads the key**.
  `scoutingView.test.js` asserts the key equals the full projection field for
  field, including across the confidence-rounding step boundaries; a field
  added to `currentEffectiveLevel`/`potentialEstimate` and not to the key's shim
  fails that test rather than skewing the market quietly.
- `scouting.js`'s `observedPlayerBands` is the single implementation of the
  report arithmetic; `buildScoutingReport` is that plus the tactical/status
  prose. Do not fork it for a cheaper caller.
- Only one page (`src/game/marketPagination.js`, 100 rows) is ever projected in
  full. Projecting the whole world cost ~330 ms per load and was why the list
  could fail to appear; it is ~90 ms now. `coachingEffects` normalises only the
  department it needs, which was the single biggest cost in building a report.

### Who negotiates personal terms

- `transferMarket.js`'s `managedBuyerOwnsPersonalTerms` decides this: the
  manager negotiates a player's wage **only** when their own club is buying and
  the deal is not delegated. Selling a player, or watching two AI clubs trade,
  resolves through `resolveBuyerLedContractResponse` — the buying club meets the
  demands (bounded by `BUYER_WAGE_STRETCH`, a wage-against-wage judgement, never
  the transfer-fee `budget`) or the move collapses. This also fixed a real
  pre-existing defect: AI-vs-AI and user-as-seller deals whose player countered
  were parked on `awaiting:'user'` forever, which `advanceTransferMarketWeek`
  skips. `transferMarket.test.js` sweeps the parameter space asserting no
  seller-side deal is ever parked on the manager.

