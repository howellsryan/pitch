# Historical delivery baselines

Recorded evidence migrated from the contributor guides; test counts and timings
are historical, not current pass claims. Preserve the behavioural regression
contracts below when changing the corresponding domain. Browser-suite references
are retired; the current verification contract is verification.md. Programme
status belongs only in ../plan/post-r7-career-depth-roadmap.md.

### P0 completion baseline

P0's completion gate established the initial safety floor:

- deterministic P0 contract suites for competition rules/integration, save migration and UEFA finance;
- full Vitest suite;
- 186-club accent audit;
- retained/inspected 390x844 Career Menu screenshot.

### P1 completion baseline

P1 extends that floor; do not weaken these regressions:

- deterministic world ledger, world competition, atomic projection, season-history/rollover and injury-cadence contracts;
- **128/128 Vitest tests** green on the implementation-complete SHA;
- **186/186 club accent checks** green;
- retained/inspected **390×844 Competitions screenshot**;
- throttled P1 benchmark baseline: **12.33s career load, 18.50s authoritative 186-club world week, 2.76 MiB storage at 4× CPU throttle** on shared CI.

### P2 completion baseline

P2 adds the simulator-depth safety floor; do not weaken it to make P3 pass:

- seeded/serialisable RNG and exact whole-match vs segmented-Broadcast parity contracts;
- shared tactic/role schema, managed-match adapter, AI tactical profile/opposition insight and idempotent Manager DNA contracts;
- additive P2 save backfill preserving formation, mentality and lineup;
- **150/150 Vitest tests** green on `de7de8a8`;
- **186/186 club accent checks** green;
- retained/inspected P2 tactics and Team News screenshots;
- P1 performance regression still within guardrails at **12.57s / 18.93s / 2.61 MiB**;
- GitHub Actions and Cloudflare Workers successful on the same exact head SHA.

### P3 completion baseline

P3 adds the player-state safety floor; do not fork these contracts in P4/P5:

- additive player-model v4 backfill plus canonical baseline/effective-level, potential-range, position/trait, role/promise and rehabilitation contracts;
- idempotent weekly personal-state/development settlement coalesced into bounded league/competition projection writes;
- match selection and transfer valuation consume the shared selector, with regression coverage preserving the previous XI/bench ordering exactly;
- **242/242 Vitest tests** green across 41 files, plus the UI emoji audit;
- **186/186 club accent checks** green;
- throttled P1 regression at **13.108s career load, 7.301s authoritative world week and 3.41 MiB storage**, inside the unchanged ceilings;
- GitHub Actions and Cloudflare Workers successful on the final promoted roadmap SHA.

### P4 completion baseline

- bounded/versioned `save.transferMarket` with additive legacy-offer migration and immutable completed history;
- deterministic legal transitions, typed fee/loan/contract terms, transparent interest reasons and rival/hijack outcomes;
- need-first AI recruitment through the shared minimal squad-planning service;
- exactly one idempotent market tick per completed world week plus unique deadline-hour ticks;
- atomic settlement across save, teams, players and transfers, including retry keys, exchange and loan-back execution;
- persisted Deals/Market/Loans/Contracts/history UI with no modal-owned negotiation state;
- **257/257 Vitest tests** green across 44 files, plus the UI emoji audit and legacy replacement contracts.

### P5 completion baseline

- pure `scouting.js` / `coaching.js` / `training.js` / `squadPlanning.js` domain layer with a bounded, versioned `save.scouting` and per-club coaching departments;
- one idempotent P5 settlement per completed world week, keyed so a reload cannot double-apply it;
- a dedicated scout returns an exact report after one completed gameweek and that certainty is scoped to the season it was gathered in — last season's scouts and reports are retired, never carried forward;
- reports store observations against canonical player ids only; they never copy or mutate authoritative attributes or potential.

### P6 completion baseline

- a dedicated `managers` IndexedDB store (`DB_VERSION` 3→4) with an idempotent, `managerModelVersion`-gated backfill giving every club exactly one manager entity;
- a bounded, versioned `save.managerMarket` (vacancies, review checkpoints, processed week keys, capped recent-appointments, user approaches/applications, pending handover) with no second manager/job-market persistence path;
- one shared appointment state machine (`managerAppointments.js`) driving both AI hiring and the user's own resignation/approach/application/accept flow, with same-tick candidate reservations so two vacancies can never be awarded the same manager;
- a bounded projection adapter (`managerCompetitionHandoff.js`) reconciling the `save.cups` vs `save.worldCompetitions` shape mismatch on club-control transfer, rather than a riskier full unification;
- an atomic, idempotent club-control handover (`managerClubHandover.js`) gated on the same empty-`pendingEvents` safe boundary as every other P6 control change;
- a "Manager Career" card + sheet on `SettingsScreen.svelte` (profile, safe-boundary-gated resignation, approaches/applications/open-jobs) verified by hand at 390×844 against the built `dist/`;
- manager `age` increments at every season rollover so age-based retirement can actually fire over a multi-season career;
- **471/471 Vitest tests** green, plus the UI emoji audit and 186/186 club accent checks.

### P7 completion baseline

- an additive, versioned `team.philosophy` (8 weighted traits, deterministically seeded) and `team.finance` ledger (cash, seasonTotals, capped audit trail, scheduled obligations) — every budget-mutating write in the codebase routes through one `applyLedgerMovement`/`syncLedgerCash` pair so the legacy `team.budget` field can never drift from `finance.cash`;
- a weighted 3-objective board contract (`boardContract.js`, sporting/financial/youth) replacing the old single finish-target, with a season-close verdict and a `dismissalRecommended` judgment that is now actually executed, not just surfaced;
- three bounded, integer-tiered facility tracks (`facilities.js`: training/medical/scouting) with real, capped consumers for the user's own managed squad, and one weekly runtime tick (`p7Runtime.js`) settling obligations and completing facility upgrades;
- board-driven dismissal and the pre-existing job-security trigger unified onto the one soft `dismissAndCaretake` handover P6 already built for resignation — replacing a hard `resetForNewCareer()` save-wipe that was inconsistent with P6's own manager-career premise;
- product surfaces: the season-end board-objective breakdown, and a "Club" card (finance + facility upgrades) on `SettingsScreen.svelte`;
- **591/591 Vitest tests** green, plus the UI emoji audit, 186/186 club accent checks, and the legacy `build.py`/`validate_p0.py` bridge (92/92 deterministic replacement contracts);
- disclosed, not fixed this phase: AI clubs' facilities are inert (no consumer wiring reaches background clubs yet); Inbox isn't yet fed by facility/obligation events; Home/Squad/Transfers/League aren't unemployment-aware; this phase's own final WP7 UI (the Club card, board breakdown, rewritten sacked modal) was not hand-verified with a rendered screenshot.



### Testing policy (supersedes any earlier phase wording)

Verification is Vitest contracts plus hands-on inspection of the running app.
There is no browser/E2E suite and none is to be introduced — see [verification.md](verification.md).

The original redesign record is `docs/plan/07-redesign.md`. R8 quality,
light-mode and PWA work is a separate stream; use its current plan for status.
