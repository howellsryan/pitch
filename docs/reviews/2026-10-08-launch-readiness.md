# Main-branch launch review — 8 October 2026

## Scope and release status

Review baseline: `main` at `cfa845b1b146f3b277b9815ca4560870b17610da`.
Changes are collected in [PR #46](https://github.com/howellsryan/pitch/pull/46).
No other feature branch supplied the review baseline. Production has not been
updated by this review; Cloudflare's existing Git integration publishes previews.

**Review complete:** the native career completed fifteen seasons (2026/27–2040/41)
and the mobile UI rolled it into 2041/42. The recommendation is a public beta
after this PR is merged and the production build succeeds. Final commit checks
and its direct Cloudflare preview are recorded in the PR handoff.

## Product assessment

Pitch has a clear browser-first proposition: choose a club, make management
decisions, and watch or instantly simulate football without an account. The
mobile shell, match presentation, scouting uncertainty and persistent world
provide a coherent foundation. The strongest product decision is keeping one
football engine behind Quick Sim, Broadcast, background matches and play-offs.

The original main branch passed its automated gates, but those gates did not
catch several career-level defects. Interrupted writes, reduced-field cups,
unemployment, ownership changes and the outgoing season boundary required
explicit scenario review. These were material launch issues, rather than
cosmetic preferences.

The product should be described as a free football management beta. It offers
meaningful tactics, recruitment and career progression, but the current world
coverage and competition detail are narrower than a commercial Football Manager
database. [Features and decisions](../features.md) documents the shipped game.

## Findings and changes

| Priority | Finding during review | Resulting change |
| --- | --- | --- |
| Critical | Season rollover and import could leave mixed old/new career state after a failed write | One all-store transaction publishes a complete rollover or import; failures preserve the previous career and active slot |
| Critical | Managed match retries could resimulate a result, replay projections or consume a changed queue | Persist canonical results, participant updates, queue consumption and Manager DNA together; reuse committed receipts and reject stale event heads; ignore presentation-only league venue hints while validating the actual fixture participants |
| Critical | Transfer/loan settlement could disagree with canonical ownership, accept stale free-agent agreements, renew a borrowed player or block a valid keeper renewal/loan-back | Canonical transitions retain identity and registration history; validate current ownership at settlement; reject invalid renewals/exchanges; apply squad/keeper departure floors when registration actually leaves |
| High | Reduced-field domestic cup draws could finish without a final or runner-up | Allocate draws against later entrants and remaining rounds; retain real finals and exclude byes from participation |
| High | English promotion places were incorrect, and play-offs used a separate outcome model | Correct automatic/play-off/relegation places; use the match engine with outgoing squads before season resets |
| High | Contract expiry used the wrong season year; loan returns and departing lineups could retain stale state | Expire contracts against the outgoing end year, return loans canonically, prune departed IDs and archive outgoing registrations before mutation |
| High | Club cash lacked a reliable recurring income model; future-season installments could settle early | Seed a fixed weekly income baseline, settle income/wages once per week, retain cash across seasons, and compare obligation season years before payment |
| High | A dismissed manager could keep managing the former club; applications could become self-appointments | Check persisted employment at management commands, advance the existing world queue between jobs, and require a genuine reviewed club offer |
| High | Resignation and accepted handover wrote club, manager and save separately | Commit all ownership changes together; failed writes preserve the previous job or pending handover |
| High | Every season duplicated detailed registrations for the growing entire player population, exceeding 50 MiB in the seventh season | Retain the latest detailed world archive and three recent seasons of world totals; retain earlier leaders, award winners and lifelong detail for the club managed at each season close; omit only idle unattached rows from the latest archive; atomically migrate existing careers |
| High | Later world weeks repeatedly deserialized unrelated players and consumed match payloads, exceeding performance/storage budgets | Use indexed football/payroll/cup/story reads, an injury index including unattached injured players, participant-only atomic transfer reads and complete eligible indexed recruitment pools; compact consumed cup/league payloads, retain managed/pending reports and avoid repeated history copies |
| High | Fourteenth-season weekly storage and rollover still exceeded 50 MiB after archive/history compaction | Share immutable snapshots and omit unused zero bookkeeping; compact physical player and season rows through ordered atomic database upgrades through V8, keeping canonical values, indexes, IDs and logical V2 exports intact |
| High | Retirement replacements lacked canonical ownership and registration until a later backfill | Create each replacement through the existing lifecycle transition with an open first-team registration in the new season |
| High | The former club's academy remained user-controlled after dismissal; outfield promotions could crowd out its only keeper | Apply employment ownership to academy rollover, prioritize keeper seats, allow one emergency adult keeper promotion and renew the last AI keeper |
| High | A real year-13 compressed cloud backup was 9.44 MB, above the API’s 1.8 MB limit | Store bounded internal chunks and a versioned head in one atomic D1 batch; return the same opaque blob, hide chunks from career lists and clean them up on replacement/deletion; retain single-row compatibility without a schema migration |
| High | Export/cloud snapshot reads could mix career checkpoints while the next match or rollover ran | Read all stores in one readonly transaction; a concurrent-checkpoint regression reproduces the mixed export and verifies a coherent envelope |
| High | Cloud restore on an empty device missed generated career slots; malformed auth could return a server error | Discover the latest remote slot, re-check local state after network work, preserve an existing career and return an authentication failure for malformed tokens |
| High | An unset lineup after changing formation or accepting a job displayed an XI but disabled both match paths | Validate automatic selection through the match engine; keep incomplete, injured and suspended named selections blocked; enter the next fixture when returning from a committed Quick Sim report |
| Medium | Cold boot could trigger repeated hidden match work; save transfer controls were hidden | Track explicit screen refreshes, avoid reactive queue loops and show export/import on entry and Settings |
| Medium | Mobile full-time scores wrapped; negative costs appeared as “Free”; nationality flags were inferred from league | Keep the score on one line, render signed financial amounts correctly and use source nationality aliases with an honest unknown fallback |
| Medium | Offer controls implied sell-on and loan purchase terms that were not executed | Remove unsupported controls/default terms while preserving old recorded term shapes; document supported negotiations |
| Medium | Imported text could enter a toast as HTML | Render messages as text; a regression covers imported markup |
| Medium | Invalid generated roster data could overwrite earlier output before a later league failed | Validate IDs, affiliations and roster shape first, stage every target, then write; current CSV regeneration makes no data changes |

Detailed changes remain with their existing owners under `src/modules/`,
`src/game/`, `src/lib/ui/` and `functions/`. Unemployed season-history rows now say “Between clubs” without crediting the former club’s finish or prize. Senior Squad now excludes academy prospects and validates current ownership before toggling inclusion. Product-facing academy, loan and facilities copy explains football decisions without phase or persistence terminology.

No browser-test framework, alternate
simulation authority, deployment pipeline, dependency or lockfile was added.

## Verification

The unchanged-main baseline passed build, tests and lint before implementation.
Final source verification passed with the statistical guardrails unchanged:

| Gate | Final result |
| --- | --- |
| `npm run build` | Production build passed; 1,154 raw legacy assertions passed, 71 explicitly superseded source-shape assertions remained, and the mandatory replacement bridge passed all 198 tests across 28 files |
| `npm run test` | 1,041 tests across 134 files passed; emoji audit passed all 42 assertions; unchanged 3,000-match balance passed |
| `npm run lint` | Passed |
| `npm run check:accents` | All 181 clubs passed |
| `npm run balance:match:deep:check` | Unchanged 5,000-match deep calibration passed |
| Pinned agent workflows | All seven pinned skill revisions passed verification |
| Complete late-career world week, 4× CPU | Year 15 week 20: 22.32s; winter-window week 23: 24.27s; each began with 90 unplayed fixtures across nine leagues and an empty queue, then finished exactly one week later with the queue empty |
| Native origin storage | Final-code weekly peak 39.30 MiB; season-close 38.03 MiB; actual mobile rollover peak 47.01 MiB, below the unchanged 50 MiB limit |

The legacy bridge result, rather than an allow-listed raw failure count alone,
is the compatibility gate. No test thresholds or statistical guardrails were
relaxed for this review.

A continuous native IndexedDB career completed **15 seasons and 52,920 league
fixtures**, plus domestic/European cups and English play-offs. Every season
completed all 3,528 supported league fixtures and their projections. Complete
W/D/L, GF/GA/GD and points recomputation was added from season eight onward;
previous seasons checked per-team played totals and finite player state. The
final season had canonical ownership, competition winners, no undersized senior
squads or missing keepers, finite player ages/fitness and no negative club cash.

This was an evolving review career: defects discovered during the run were
fixed and the same career resumed. It is not fifteen clean seasons all run on
the final revision. The manager was dismissed after season one; later endurance
covers unemployed world progression and AI management of the former club. The
separate hands-on job journey below covers taking over and playing at a new club.

The 390px compiled game UI advanced the final season into **2041/42, week 1**,
saved archive 15 as **Between clubs**, and created 3,528 unplayed fixtures across
nine leagues with an empty queue. All clubs retained at least eleven eligible
seniors and a keeper. That inspection exposed 32 retirement replacements without
canonical lifecycle fields; generation now creates those fields and the initial
registration immediately. Focused contracts and a native comparison verify that
the change preserves random output, IDs, positions, ages, ratings and finances.
Cold-loading the final compiled artifact also retained 2041/42 week 1, left every
player canonical through the existing backfill and measured 36.98 MiB of storage.

A final-year canonical export contained **21,801 players and 14 archives**;
complete player/archive JSON hashes matched database reads, with no physical
codec wrappers in the logical V2 envelope. Its uncompressed envelope was
107.62 MB (save code 143.54 MB): file/cloud are preferable to copying such a
long code. This validates representation, not an authenticated cloud round trip.

Hands-on checks already completed at 390px include the entry/import controls,
club selection, Home, team news, Quick Sim, Broadcast pause/speed/tactics/
substitution, full time, tactical statistics, updated standings, export/import
by save code, corrupt import recovery, resignation, applications and world
advancement between jobs. Settings was also inspected at 1280px. The actual mobile job journey resigned
from Arsenal, advanced ten world weeks, accepted a genuine Gillingham offer
and completed the first fixture after taking over (1–2 against Fleetwood).
Changing formation to 4-2-3-1 allowed Broadcast, whose league result saved and
reached statistics. Leaving a committed Quick Sim report correctly opened the
next queued FA Cup tie; its watched 0–3 result persisted and advanced the week.
Academy promotion moved the same player from ten prospects/27 seniors to nine
prospects/28 seniors, with native confirmation.

The Cloudflare preview completed a fresh career and first match: its displayed
score, scorer, statistics and table agreed. Resignation immediately removed
former-club finance/facility controls. Native IndexedDB abort inspection and
contract tests cover failed season, import, resignation and handover writes.

The endurance run found the archive growth above. On the same native career,
atomic archive migration took **0.89 seconds**, reduced raw archive JSON from
**49.38 MB to 24.83 MB**, and reduced the measured origin usage to **35.30 MB**.
The latest world season remained detailed and the active calendar did not move.

A tenth-season week failed the 4× CPU budget at **37.31 seconds**. Profiling
identified IndexedDB deserialization and repeated history copying, followed by
the active cup ledger's already-applied fitness/tactical payloads. Native
backfill reduced that ledger from **4.15 MB to 1.39 MB** in **0.80 seconds**,
with identical competition history, pending-record count and calendar. After
scoping football, payroll, cup and story reads, a full world week took
**21.99 seconds at 4× CPU slowdown**, with origin usage **35.75 MiB**.
The final-season measurements are recorded in the gate table above.

Year 12 again exposed storage growth, at **66.25 MiB**. Year-13 backfill removed
consumed league fitness/non-goal payloads (raw fixture JSON **8.08 MB → 3.96 MB**)
and idle unattached archive duplicates (**29.03 MB → 20.91 MB**) in **1.33 seconds**.
Every retained player-history object and match report field was identical; the
calendar, queue and table did not change. These numbers measure raw JSON;
IndexedDB's physical usage also varies with its own compaction. No active player
records were deleted. A year-13 profile still failed at **30.12 seconds**. Scoping
P5 training/scouting and closed-window market reads reduced the next full week to
**20.58 seconds at 4× CPU**, with **33.66 MiB** measured origin usage.

The local Worker with real D1 binding and both existing migrations round-tripped
an opaque **9.6 MB** backup with HTTP 200 for PUT/GET. Fourteen database rows
contained one career head and thirteen internal chunks; maximum payload per row
was **750,000 bytes**, and the career list returned only the head. SQLite contracts
also verify failed-batch rollback, replacement/deletion cleanup, user/slot isolation
and safe rejection of incomplete backups. Google sign-in remains unverified.

Weekly sampling in year 14 caught a **53.69 MiB** peak rather than relying only
on season-close usage. The player ledger contained **10.66 MB** of repeated
within-row snapshot JSON. Lossless reference sharing applied to **14,861 of
20,599** real player rows when rebuilt from JSON; all values were byte-for-byte
identical, and sharing survived native IndexedDB reads. The next actual week
closed at **33.28 MiB**, taking **14.91 seconds at 4× CPU** while draining its
existing pending event. That was a partial-week recovery measurement; the
fifteenth-season complete-week and remaining weekly storage samples were therefore
required and are recorded above. The storage figure includes IndexedDB's own background compaction,
so it is not an isolated size estimate for reference sharing. Subsequent weekly
sampling still reached **51.90 MiB**, requiring another change rather than a
claim based on the lower sample. Registration payload compaction reduced raw
player JSON **67.53 MB → 58.05 MB** in **3.86 seconds**. Native comparison checked
**54,643 seasonal registration projections** across all 20,599 players: every
projection and all non-history player fields were identical, with unchanged
calendar/queue. It removes known zero counters and academy evidence copied onto
non-academy spells, preserving actual academy history, unknown/nonzero fields,
club registrations and lifecycle IDs. Subsequent samples exposed the additional codec issues below.

Sampling after those changes still reached **56.19 MiB**, so field compaction
alone did not satisfy the budget. A reversible physical player codec now keeps
the existing player ID and club index while representing repeated field names
compactly. The native **version 4 → 5** upgrade took **6.88 seconds** for all
**20,599 players**. Exact JSON hashes for the complete player population, indexed
Arsenal squad, save, fixtures, standings and season archives were identical.
Raw stored player JSON fell to **30.48 MB**. Injecting a failure on the second
cursor update preserved database version 4 and both original player rows in
an isolated native upgrade inspection. File/cloud exports still contain canonical
V2 player objects; old logical saves import through the existing path.

The first complete week with the codec failed narrowly at **25.46 seconds**;
profiling found decoding cost. Avoiding redundant dense-array indexes and
per-object temporary allocations reduced the next measured complete week to
**20.86 seconds at 4× CPU**, with **40.47 MiB** origin usage. All 90 league
fixtures across nine leagues were unplayed before that measurement. These were intermediate measurements; the final
fifteenth-season measurements and weekly storage sampling are recorded above.

V1 weekly sampling subsequently reached **53.99 MiB**. V2 removes the remaining
per-field numeric array entries through a compact key-order string and dense
values; unused unknown-field tables take no array allocation. Its ordered
**database 5 → 6** migration retained exact full-population, indexed-squad,
calendar, queue, fixture, table and archive hashes for the same 20,599-player
career. Migration took **6.51 seconds**; applying the final empty-table
representation took **3.74 seconds**, with identical player JSON and **32.68 MiB**
origin usage. A native interrupted **4 → 6** upgrade also preserved version 4
and both original rows. A complete subsequent week started with all **90** league
fixtures unplayed across all nine leagues and completed in **23.05 seconds at
4× CPU**. The previous codec remains readable; logical V2 saves remain canonical.
These are intermediate checks, not a substitute for final weekly/endurance
sampling below.

V2-player weekly sampling stayed below **34.87 MiB** through the rest of season
14, but its rollover still reached **60.54 MiB** because archives retained the
expanded object representation. Database **6 → 7** now applies the same reversible
graph format to season records while leaving V6 player rows untouched. The native
upgrade took **0.46 seconds** for all **14 archives**, bringing measured origin
usage to **26.17 MiB**. Every complete archive JSON hash, all 21,801 player values,
calendar, queue, fixtures and standings remained identical. An injected failure
on the second archive update retained database version 6 and both original rows.
The auto-increment archive IDs and canonical file/cloud representation have
contract coverage. After the subsequent V8 upgrade, feature rollbacks must retain database V8,
its injury index and both decoders; older clients cannot open a physically
upgraded database. These storage figures
include IndexedDB's own compaction rather than estimating size from raw JSON.

The year-15 opening window still failed at **33.64 seconds** (a subsequent profiled
week took **28.44 seconds**). Profiling identified full-player deserialization for
medical recovery and individual atomic deals. Database **7 → 8** adds a numeric
injury projection/index without changing player objects: **47 indexed players**
produced exactly the same recovery result as the full **21,801-player** population.
Migration took **7.10 seconds** and retained all player, calendar, queue, fixture,
standing and archive hashes. Native injected failures on the second player update
(**4 → 8**) and second archive update (**6 → 8**) retained the original database
versions and all original rows. Injured free agents remain included by contract.
Transfer settlement now reads only target/exchange players and the seller's squad
inside its existing transaction. Open-window recruitment keeps every registered
club and active unattached target; nonempty ranking parity is covered, and the
existing AI ranker still excludes free agents. This also exposed keeper renewals
and loan-backs being rejected as departures; their guards now follow actual
registration changes while preserving last-keeper/squad floors on departures.

The next measured week still failed at **26.82 seconds**. Avoiding recursive
decoder calls for primitive leaves retained exact player/archive/save/fixture/table
hashes and reduced the following complete nine-league week to **21.70 seconds at
4× CPU**. The final year-15 checks measured **22.32 seconds** for week 20 and
**24.27 seconds** for week 23 during the winter transfer window, both at **4× CPU**.
Each started with all **90 league fixtures unplayed across nine leagues**, no
pending events, and ended at exactly the next week with the queue empty. The
season-close and actual UI rollover/storage checks appear in the gate table above.

## Data accuracy and remaining limits

- The checked-in world has **181 clubs and 5,092 starting players** in nine
  leagues. The refresh report was generated **4 September 2026**, referencing
  **1 September 2026**, from the public EA SPORTS FC 27 feed. This review
  validated the existing snapshot; it did not invent a new roster refresh.
- Ages were absent from that feed run. All rows used retained metadata or the
  age-24 fallback, and **3,012 starting players are age 24**. Current real-world
  ages are therefore unverified. Potential, wage, value and fine-grained ability
  profiles also include generated game data.
- League Two has 22 clubs and the Eredivisie 15. Continental second tiers and
  the National League are absent; European qualification uses a simplified
  allocation rather than current national access lists.
- Play-offs retain compact scores and winners. They do not yet project detailed
  player statistics or fitness/injury changes between legs. Other completed
  league/cup matches retain their normal projections.
- Cloud is a backup with same-slot last-writer-wins behavior. Settings advises
  one device at a time. Server contracts and local D1 migration fixtures were
  checked. Read-only production inspection confirmed the configured D1 binding,
  the presence of the three required secret names, and the live users,
  identities and multi-slot saves schema/indexes against both checked-in
  migrations. No user records, secret values or database writes were needed.
  The preview returned 401 for missing/malformed authentication and redirected
  OAuth start to Google with Secure, HttpOnly and SameSite=Lax state-cookie
  flags. Actual Google sign-in and authenticated backup/restore remain
  unverified; direct production-domain HTTP access was blocked by the workspace
  network proxy.
- Save-code export/import and a physical 17.7 MB `.pitch` download were exercised
  in Chromium. The downloaded file also restored through Settings and retained the club,
  fixture and squad. Desktop download used a browser without Web Share; native
  mobile sharing is not verified. Atomic restore paths have contract coverage.
- The client bundle remains approximately 414 KB gzipped and emits Vite's
  existing chunk-size warning. Loading/career timings matter more than that
  warning; code splitting remains a useful follow-up for slow connections.
- The scheduled player refresh on main on 5 October
  ([run 37308403301](https://github.com/howellsryan/pitch/actions/runs/37308403301))
  passed refresh/build/test steps but failed **Open scheduled refresh PR**.
  Job metadata confirms that failure. Log and repository-permission access were
  denied to the available integration, so its exact cause remains unverified.
  Repairing that PR-opening step is an owner follow-up; no speculative workflow
  or repository-setting change was made.

## Next milestone

Prioritize verified player ages and a reviewed roster refresh, complete play-off
projections, and exercise cloud backup/restore with the production account and
database configuration. These improve realism and cross-device confidence without
changing the local-first launch proposition. Longer-term product work should add
competition coverage and richer club economics rather than more unsupported
negotiation controls.
