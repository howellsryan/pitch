# Gameplay Depth Roadmap

Tracks the post-rebuild feature work identified by comparing Pitch's simulation
depth against EA Sports FC 27's Manager Career mode (Aug 2026 review — scoped
to career-mode management systems, since Pitch has no playable match, only a
tick-based simulation). Ranked by **fun delivered per unit of engineering
risk**, not by parity with a AAA title: each item takes the 20% of its gap
that produces most of the payoff. Sequenced so most items lean on the one
before them — see each section's own note.

Status legend: ⬜ not started · 🔶 in progress · ✅ shipped

## Status

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Two-legged European knockouts | ✅ shipped | |
| 2 | Wages that cost something | ✅ shipped | |
| 3 | Contracts | ✅ shipped | |
| 4 | Board objectives & job security | ✅ shipped | |
| 5 | Morale with real effect | ✅ shipped | |
| 6 | Academy investment | ✅ shipped | |
| 7 | Cloud save & Google account | ⬜ not started | new infra — D1 + first server routes |
| 8 | Manager career progression | ⬜ not started | plan-gate (schema); builds on 4 |
| 9 | Data completeness polish | ⬜ not started | |

Items 8 and 9 were originally ranked 7 and 8 in the first pass of this list;
cloud save was inserted as the new #7 and both pushed back one slot.

Update this table (and the item's own section) in the same commit that ships
it — that's the whole point of the file.

---

## 1. Two-legged European knockouts — ✅ shipped

**Gap:** UCL/UEL/UECL knockout rounds were decided by a single coin-flip-AET
match — no home-and-away tie, no away-goals rule.

**Shipped:** R16/QF/SF now play two legs with a real aggregate score, the
away-goals tiebreak, then penalties if still level — reusing the same
tie-resolution shape `promotion.js`'s playoff semis already use
(`simulatePlayoffTie`), applied to European knockout rounds via a new
`resolveCupProgress()`/`computeTwoLegOutcome()` pair in `cups.js`. The Final
stays a single match at a neutral venue, matching the real competitions. Leg 2
reuses leg 1's opponent and flips home/away instead of drawing a fresh
opponent. Both the quick-sim and Watch Match code paths share the same
resolution helper.

**Skipped (by design):** seeded/pot-based draws, dynamic qualification tied to
other leagues' coefficients.

---

## 2. Wages that cost something — ✅ shipped

**Gap:** every player had a `wage` field, but nothing deducted it from
`team.budget` on any cadence — wage costs only ever surfaced inside loan-fee
math. Clubs could carry an unlimited wage bill for free.

**Shipped:** `payWeeklyWages()` (`season.js`) sums each club's active squad
wages and deducts the bill from `team.budget` once per gameweek, for the user
and every AI club alike. Players out on loan are skipped — the loan club
already prepaid their projected wages in full at signing
(`transfers.js`'s `_loanWageCost`), so charging them again here would
double-bill it. A "Wages / wk" line now sits next to the transfer budget in
Transfers.

**Skipped (by design):** a separate wage cap distinct from transfer budget
(item 4's territory), sponsorships or other revenue to offset it.

---

## 3. Contracts — ✅ shipped

**Gap:** no length, expiry, free agency, or release clause anywhere — a
repo-wide grep for `"contract"` returned zero hits. Every deal just
overwrote a flat wage field.

**Shipped:** every player has `contractExpiry` (the last season-start-year
their deal covers) — assigned at new-game seeding, youth promotion, buys,
sells, accepted offers, and AI-to-AI transfers, and backfilled at season
rollover for saves from before this shipped (never treated as instantly
expired). Squad's player sheet shows years remaining with a "Renew Contract"
action (`renewContract()`); at season end an unrenewed expiry sends the
user's player to a real free-agent pool (`teamId: 'free_agents'`) — the
`teamId !== 'free_agents'` filter that sat unused in TransfersScreen is now
wired up via a new Free Agents tab (`signFreeAgent()`, wage-only, still
reputation-gated). AI clubs self-manage renewals — mostly renew, more likely
to release older players.

**Skipped (by design):** buyback clauses, relegation wage reductions,
competition bonuses, agent fees, work-permit rules.

---

## 4. Board objectives & job security — ✅ shipped

**Gap:** zero board-confidence, sacking risk, or season targets existed — a
repo-wide grep for `"board"`/`"sack"`/`"objective"` came back empty. Results
carried no consequence beyond league position itself.

**Shipped:** one objective per season (`generateBoardObjective()`), set from
the club's reputation relative to its league — title/Europe/top-half/
relegation-survival for single-tier leagues, promotion/play-offs/mid-table/
relegation-survival for the pyramid (League Two's floor is "mid-table" since
it has no relegation). A `jobSecurity` number (0-100) is evaluated at each
season's end (`evaluateBoardObjective()`, `nextJobSecurity()`) against the
outgoing objective — missing it costs noticeably more than meeting it gains.
Hit zero and the manager is sacked: a dedicated end-state offers "Start New
Career" (a new `resetForNewCareer()` that wipes the active save/squad but
keeps honors and season history) instead of "Start Next Season." Home shows
a live board-confidence meter next to the existing morale block, plus the
current objective's label.

**Skipped (by design):** a formal warning tier before sacking, secondary
objectives, board press statements, and — since item 8 (manager career
progression) doesn't exist yet — any new-club job offer on sacking; v1 is a
clean restart, not a new job.

**Why it mattered:** the biggest "stakes" gap in the game — nothing you did
could previously end the career badly. Sets up item 8, which will replace
the restart with an actual job offer once it exists.

---

## 5. Morale with real effect — ✅ shipped

**Gap:** "morale" was a UI-only label computed on the fly from the user's own
win rate on Home — it wasn't stored anywhere and touched nothing else.

**Shipped:** `team.morale` (0-100, `standings.js`) is a real stored value,
eased each gameweek toward a target set by recent form
(`moraleTargetFromForm`/`easeMorale`/`updateTeamMorale`, hooked into the same
three "gameweek advancing" checkpoints `payWeeklyWages` already uses), plus
one-off nudges: +3 when the user renews a contract, -2 per player per season
who leaves for nothing because their contract lapsed. The one mechanical
effect: `potential.js`'s growth-point calculation scales by a 0.85x-1.15x
multiplier from squad morale (`moraleDevMultiplier`), so a settled squad
develops faster than an unsettled one — reusing the existing growth-point
system rather than inventing a second one. Home's morale meter now reads
this stored value instead of deriving a cosmetic label from the win rate.

**Skipped (by design):** press-conference dialogue trees, per-player
morale/complacency states, and — a scope cut from the original plan —
routing swings through the inbox as narrative beats. `season.js`/
`standings.js`/`transfers.js` sit on the DOM-free side of the `modules/`
boundary and the inbox lives in `src/ui/`, so wiring narrative text in from
there would cross it; the existing Home morale/board meters are the
"visible" surface instead. A future pass could thread a morale-swing event
back up through `advanceOneFixture`'s return value for a UI caller to post
to the inbox, without modules/ ever importing ui/ directly.

---

## 6. Academy investment — ✅ shipped

**Gap:** academy tier was derived purely from club reputation — nothing was
spendable, and there was no staff of any kind (zero hits for
`scout`/`coach`/`physio`).

**Shipped:** `team.academyInvestment` (0-100, `£500k` per point via
`investInAcademy()`) blends into `academyTier()` as up to +15 effective
reputation at max — enough to push a club roughly one tier above its
reputation alone. Yearly intake also scales with it, from 10 players up to
14 at full investment. Academy screen has a slider-driven "Invest" card
showing the current level, a live points-for-spend preview, and the actual
intake size — replacing the previously hardcoded "10 per season" stat.

**Skipped (by design):** named individual staff as hireable characters,
foreign scouting networks, opposition scout reports.

---

## 7. Cloud save & Google account — ⬜ (new)

Auto-save before and after every match played, plus a manual "Save to Cloud"
action, gated behind an optional Google account. Playing without an account
still works exactly as today (IndexedDB only) — there is no forced sign-up.

### Reference implementation

PocketRPG (`howellsryan/pocketRPG`) already ships Google OAuth + D1-backed
cloud saves. Reuse its pattern rather than designing a new one:

- `functions/api/auth/google.js` — `GET` redirects to Google's OAuth consent
  screen, setting a short-lived `oauth_state` cookie for CSRF defence.
- `functions/api/auth/google/callback.js` — exchanges the code for a Google
  access token, fetches userinfo, upserts an `oauth_identities` row, mints a
  session JWT, redirects back with the token.
- D1 schema (`migrations/0001_init.sql`): an `oauth_identities` table with
  `UNIQUE (provider, provider_user_id)`, so the same Google account always
  resolves to the same user row from any browser/device.
- `functions/_lib/auth.js`'s `requireAuth` reads the session JWT's `sub`
  claim and does an ownership-scoped `SELECT`/`UPDATE` before any write —
  `functions/api/save.js` follows this pattern for save data specifically.
- `src/cloud/api.js` / `src/cloud/sync.js` — client pulls (`getSave`) and
  pushes (`putSave`) with a monotonic `save_revision` counter; the server is
  the single source of truth.
- Google blocks OAuth inside embedded in-app webviews (`disallowed_useragent`)
  — PocketRPG detects this and steers to a real browser. Not relevant to
  Pitch today (web-only, no native wrapper) — worth remembering if that ever
  changes.

### What's actually new here, architecturally

PocketRPG already runs Cloudflare Pages Functions (`functions/api/**`)
dispatched into its Worker. **Pitch's `wrangler.jsonc` today only serves
static assets** (`assets.directory: ./dist`) — zero server-side request
handling exists yet. Standing up `pitch-db` (D1) and Pitch's first API routes
is the real size of this item; the OAuth flow itself can be ported
near-verbatim from PocketRPG.

### Proposed shape

1. **D1 database**: create `pitch-db`, bind it in `wrangler.jsonc`
   (`d1_databases`).
2. **Schema** (trimmed to what Pitch needs for v1):
   - `users (id, created_at)`
   - `oauth_identities (id, user_id, provider, provider_user_id, email, display_name, UNIQUE(provider, provider_user_id))`
   - `saves (user_id PK/FK → users.id, save_blob TEXT, save_revision INTEGER, updated_at)`
     — **one save per account for v1** ("store what we can to restore a
     browser session," not a multi-slot save system). `save_blob` reuses the
     same serialization the existing export/import `.pitch` file already
     produces, rather than inventing a second format.
3. **Auth routes** — `functions/api/auth/google.js` +
   `functions/api/auth/google/callback.js`, ported from PocketRPG.
4. **Save routes** — `functions/api/save.js` (`GET` to pull, `PUT` to push),
   `requireAuth` + ownership check, same pattern as PocketRPG's `save.js`.
5. **Client**:
   - Auto-save checkpoints: right before a match's pre-match beat commits, and
     right after a match result is written (`advanceOneFixture`/
     `advanceOneFixtureWithResult`'s existing `putFixture`/`putSave` calls) —
     a best-effort `cloudSave()` push at both points when signed in.
   - Manual "Save to Cloud" action in Settings, next to the existing
     export/import/reset controls.
   - Sign-in entry point on Home.
6. **Signed-out behavior** (explicit product requirement): no account → no
   cloud-save UI at all — **absent, not a disabled button**, so it neither
   errors nor draws attention to itself. Auto-save is a silent no-op. Home
   states plainly, once, that progress is local-only and is lost if the
   tab/browser data is cleared, unless signed in.

### 80/20 cut

- **Build:** Google OAuth only (no GitHub — nothing else in Pitch needs a
  second provider), one save slot per account, auto-save at the two
  checkpoints above plus manual save, sign-in/out, the explicit local-only
  messaging.
- **Skip for v1:** multi-device conflict resolution beyond last-write-wins
  (carry the `save_revision` column now as a cheap future-proofing hook, but
  no conflict-resolution UI yet), multiple save slots per account, account
  deletion/export flow (PocketRPG has already solved this — copy it before
  this goes further than a v1), any non-Google provider.

### Why it's ranked 7th

Every item from #1–#6 is a pure client-side gameplay change with no new
infrastructure. This item stands up a new database and Pitch's first-ever
server-side request handling — real, valuable, but a different category of
work and risk than the rest of the list, so it's sequenced after the cheaper,
self-contained wins.

---

## 8. Manager career progression — ⬜ (was #7)

**Gap:** the save is bound to exactly one `userTeamId` for its entire life —
nothing ever reassigns it (`save.js`) — and `managerName` is cosmetic flavor
text only.

**Build:** on being sacked (item 4) or user-initiated resignation, offer 2–3
vacancies weighted by a new, simple manager-reputation number built from
trophies won and job-security history. Picking one re-points `userTeamId`,
carries honors/trophy history forward, resets squad-facing UI to the new
roster.

**Skip:** mid-season poaching while still employed, rival managers competing
for the same job, a full open job board — the vacancy offer is presented, not
browsed.

**Why it's ranked here:** the highest single fun ceiling on this list, but it
needs item 4's job-security concept to exist first, and it's the one item
here that touches almost every screen's single-club assumption — worth doing
once, properly, after the cheaper wins prove the direction.

---

## 9. Data completeness polish — ⬜ (was #8)

**Gap:** Serie A carries no nationality field at all; squad depth swings from
~13 players/team (Eredivisie) to ~26 (La Liga) with no game-mechanical reason
for the gap.

**Build:** run the existing `tools/reconcile.mjs` / `csv-to-league.mjs`
pipeline against Serie A and the thinnest squads — no new tooling required.

**Skip:** wiring the second-tier CSVs (Segunda, 2.Bundesliga, etc.) into
`promotion.js` for those leagues — that's real pyramid work, its own item if
ever prioritized.

---

## Deliberately not chasing

Named explicitly so they don't quietly creep back into scope later — each is
a real FC 27 feature that fails the 80/20 test here: high effort, and the fun
it buys doesn't compound with anything else on this list.

- **Deeper player attributes** (pace/dribbling/physicality) — new data across
  ~3,900 players, new calibration, a plan-gated rewrite of `matchEngine.js`'s
  scoring model, for a match you can't actually play.
- **Press-conference dialogue trees** — item 5 gets most of the narrative
  payoff through the inbox for a fraction of the UI/writing cost.
- **Sponsorships & stadium economy** — a second income system competing with
  item 2 for the same "does money mean anything" payoff, at higher cost.
- **International duty / national teams** — an entire second competition
  structure, mainly to occasionally injure one player mid-season.
