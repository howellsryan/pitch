# 06 — Data reconciliation: footy-sim → pitch

> **Decided: footy-sim's rosters win for every league, unconditionally.** No
> per-league audit gate. The evidence below explains what that trades away (the
> Premier League squad is known to carry stale entries) — accepted, because the
> data pipeline itself (last section) is what keeps it from staying stale.

## The two datasets

| | footy-sim | pitch |
|---|---|---|
| Leagues | 7 | **9** (adds Serie A, Eredivisie) |
| Total players | **3,455** | 2,997 |
| Player names | **full** ("Manuel Neuer") | abbreviated outside the PL ("M. Neuer") |
| Attributes | **6 FIFA-style** — speed, shooting, passing, dribbling, defense, physical | 4 aggregates — attack, midfield, defence, goalkeeping |
| Overall rating | explicit `RATING` column | derived from the four aggregates |
| Nationality | **all leagues** (`COUNTRY`) | Premier League only |
| Age | all leagues | all leagues |
| Potential | **2 of 7 leagues** (La Liga, Ligue 1) | all leagues |
| Wonderkid flag | no | **yes** |
| Wage | no | **yes** (`wage_thousands`) |
| Value | derived (`ability² × age curve`) | **explicit** (`value_millions`) |
| Player IDs | no | **yes**, stable (`ars_saka`) |
| Club key | display name ("Arsenal") | slug (`arsenal`) |

### Depth by league — footy-sim wins clearly

| League | footy-sim | pitch |
|---|---|---|
| La Liga | **594** | 382 |
| Bundesliga | **545** | 284 |
| League Two | **519** | 370 |
| League One | **488** | 344 |
| Ligue 1 | **471** | 260 |
| Championship | **420** | 339 |
| Premier League | 418 | **422** |
| Serie A | — | 357 |
| Eredivisie | — | 239 |

Squad depth matters here: pitch has a youth academy, injuries, a 3-sub limit and
38-game seasons across four competitions. A 14-man Bundesliga squad runs out of
players.

### Freshness — mixed, and this is the part that contradicts the brief

**Premier League: pitch is materially fresher.** footy-sim's Arsenal squad still
lists Aaron Ramsdale, Takehiro Tomiyasu, Jorginho, Eddie Nketiah, Fábio Vieira and
Reiss Nelson — all departed — and misassigns Bruno Guimarães, Ezri Konsa, Illan
Meslier and Christos Tzolis to Arsenal, none of whom have played for them. pitch's
Arsenal is a correct 2025/26 squad: Gyökeres, Madueke, Zubimendi, Mosquera,
Nørgaard, Hincapié, Nwaneri, Kepa.

**Bundesliga: footy-sim is fresher.** It has Jonathan Tah, Hiroki Ito and Jonas
Urbig at Bayern; pitch still has Müller, Dier, Goretzka and Palhinha.

The Arsenal staleness (Ramsdale, Tomiyasu, Jorginho, Nketiah, Vieira, Nelson) is
real and known. It's accepted rather than gated on, on the understanding that
"up to date" isn't a one-time property of a CSV — it's a property of a pipeline
that gets re-run. See "Player departures" below: the reason Jorginho still shows
up for Arsenal isn't that footy-sim's data is wrong in a way that needs fixing
once, it's that the generator has no notion of a player leaving the tracked
universe. Fix the pipeline and the Arsenal squad corrects itself on the next run.

## Recommendation

**Keep pitch's schema. Use footy-sim's rosters for every league, including the
five not yet spot-checked (Championship, League One, League Two, La Liga, Ligue
1). Serie A and Eredivisie stay on pitch's data — footy-sim has no CSVs for
either.**

Schema first, because it isn't close: `potential`, `is_wonderkid`,
`wage_thousands` and stable `player_id`s are consumed by `potential.js`,
`youthAcademy.js`, `transfers.js` and `season.js`. Dropping to footy-sim's schema
would mean deleting the potential system, the youth academy and wage-based
finances. footy-sim's six FIFA attributes are the richer *input*, but nothing in
pitch reads them — and rewriting `matchEngine.js` to consume six attributes
instead of four is simulation surgery, not a data import. Not in this plan.

So the merge is: **footy-sim CSVs are a roster source, converted into pitch's
schema, joined against pitch's existing rows to inherit the fields footy-sim
doesn't carry.**

## The work

### Step 1 — Diff report, for visibility not for gating

The per-league audit is no longer a decision gate — footy-sim wins outright — but
`tools/audit-rosters.mjs` is still worth building as a **one-time sanity check**
before the first import, so nothing footy-sim-specific (a misassigned player, a
club that doesn't exist in pitch's team CSV) ships silently. Same report shape as
before:

```
BAYERN MUNICH
  only in footy-sim:  Jonathan Tah (CB 83), Hiroki Ito (CB 81), Jonas Urbig (GK 76)
  only in pitch:      T. Müller (36), E. Dier (32), J. Palhinha (30)
  in both:            18
```

Read it once, fix anything that looks like a data error (not a transfer — a real
error, like a club name that doesn't map), then move on. Serie A and Eredivisie
are `pitch`, unconditionally — footy-sim has no CSVs for either.

### Step 2 — The converter

`tools/reconcile.mjs`. One way only: footy-sim CSV → pitch CSV.

**Attribute mapping.** footy-sim's six attributes collapse into pitch's four,
weighted by position. Derive them from the attributes, not from `RATING`, so the
mapping is reproducible:

```js
// tools/reconcile.mjs
const W = {
  //            pace shoot pass drib def  phys
  attack:   { GK:[0,0,0,0,0,0],  DEF:[.15,.10,.20,.20,.05,.30],
              MID:[.15,.20,.30,.25,.00,.10], FWD:[.20,.35,.15,.25,.00,.05] },
  midfield: { GK:[0,0,0,0,0,0],  DEF:[.10,.05,.35,.25,.10,.15],
              MID:[.10,.10,.40,.25,.05,.10], FWD:[.15,.10,.30,.30,.00,.15] },
  defence:  { GK:[0,0,0,0,0,0],  DEF:[.15,.00,.05,.05,.55,.20],
              MID:[.10,.00,.10,.05,.55,.20], FWD:[.10,.00,.10,.05,.55,.20] },
};
// GK: goalkeeping = RATING (footy-sim already does this, lib.js:197);
//     attack/midfield/defence from the outfield attrs, scaled down.
```

The weights are a starting point, not gospel. **Calibrate them** by running the
converter over the players present in *both* datasets and minimising the delta
against pitch's existing aggregates. If the mean absolute error lands under ~4
rating points, the mapping is faithful enough that converted players don't feel
different from native ones. If it doesn't, tune the weights before importing
anything — a mis-mapped league silently changes match outcomes across the whole
save.

**Field-by-field:**

| pitch field | Source |
|---|---|
| `team_id` | slugify footy-sim `TEAM`, checked against pitch's team CSV — **fail loudly on a miss**, never invent a club |
| `player_id` | join on pitch's existing row by normalised name; otherwise mint `<team_abbr>_<surname>` and assert uniqueness |
| `name` | footy-sim `PLAYER NAME` (full names — an upgrade over pitch's abbreviations) |
| `nationality` | footy-sim `COUNTRY` (an upgrade — pitch has this for the PL only) |
| `position` | footy-sim `POSITION`, mapped through pitch's position vocabulary |
| `age` | footy-sim `AGE` |
| `attack`/`midfield`/`defence` | derived, above |
| `goalkeeping` | footy-sim `RATING` if GK, else 10 (pitch's convention) |
| `potential` | footy-sim `POTENTIAL` where present (La Liga, Ligue 1); else inherit from the joined pitch row; else generate |
| `wage_thousands` | inherit from the joined pitch row; else generate |
| `value_millions` | inherit; else generate |
| `is_wonderkid` | inherit; else `age ≤ 21 && potential − rating ≥ 12` |

**Generating the missing three.** Fit the curves against pitch's own 2,997 rows
rather than inventing them — pitch's existing distribution is the calibration set:

- `potential` — from rating and age. Under ~21, headroom of roughly +6 to +15
  scaled by rating; past ~28, potential converges on current.
- `wage_thousands` — regress on rating within league tier. A League Two 70 and a
  Premier League 70 are not paid alike, and getting this wrong breaks club
  finances immediately.
- `value_millions` — regress on rating and age. footy-sim's own formula
  (`ability² × 10000 × (1 + 0.01 × (30 − age))`, `lib.js:203`) is a reasonable
  shape but its absolute scale is unrelated to pitch's, so refit rather than reuse.

### Step 3 — Validation gate

`validate.js` must pass, and the converter needs its own checks before a league
lands:

- Every `team_id` resolves to a club in that league's team CSV
- Every club has ≥ 16 players and ≥ 2 GKs (a 38-game season with injuries)
- Every `player_id` is unique across all leagues
- No rating, potential or age outside its legal range
- `potential ≥ rating` for every player
- Total wage bill per club is within its budget band
- Converted-vs-native rating delta stays under the threshold from step 2

A league that fails any of these does not get written. footy-sim's generator
already works this way — it validates each CSV and skips writing a league with
errors, then prints a diff of players added/removed/moved-club. **Carry that
behaviour across.** It is the single best thing footy-sim has and it's the reason
the data work there was worth doing.

### Step 4 — Fold in the pipeline

pitch has `csv_to_league.py`; footy-sim has `playergeneration/generate-players.js`
with validation and diffing. Keep one: port footy-sim's validation and diff output
onto pitch's converter, in Node, as `tools/csv-to-league.mjs`. Drop the Python.

pitch has pre-registered empty slots for Segunda División, 2. Bundesliga, Serie B
and Ligue 2 — the converter should be able to fill them from a CSV with no code
changes, which is how footy-sim's already behaves.

### Step 5 — Player departures: leaving the tracked universe

New requirement, prompted by a real case: **Jorginho has moved to a league
neither pitch nor footy-sim covers.** footy-sim's CSV was generated before that
move, so it still lists him at Arsenal — not because the data is wrong, but
because the pipeline has no concept of "this player left the nine leagues we
track" and so never removes anyone. Every regeneration going forward hits this,
for whichever player has just moved to the Saudi Pro League, MLS, or retired
outright. This needs to become a real, ongoing capability, not a one-off fix to
Arsenal's squad.

**The mechanism.** footy-sim's generator already prints a diff of players
added/removed/moved-club between runs (`CLAUDE.md` §2) — that machinery is most of
what's needed. Extend it with a distinct third category:

```
ARSENAL — squad diff vs. previous generation
  moved club:  Kepa Arrizabalaga (Chelsea → Arsenal)
  departed:    Jorginho — no longer in any tracked league's CSV
  added:       Martín Zubimendi (new signing, from Real Sociedad)
```

"Departed" is a player who was present in the previous generation's CSV for one
of the nine tracked leagues and is absent from the current one, **and does not
appear at any other tracked club either** — ruling out a same-universe transfer,
which is just a normal "moved club" diff. A departed player is dropped from the
generated roster. That's the whole mechanism: absence is the signal, there's
nothing to scrape from the destination league because by definition there isn't
one.

**Why this is safe for existing saves.** pitch's `modules/db.js` snapshots the
full player object into IndexedDB's `players` store when a career starts — saves
do not hold a live reference back into the generated data file. So regenerating
the rosters and dropping a departed player **only affects new games started after
that regeneration**; nobody's Jorginho vanishes mid-save. Confirm this holds
before Phase 6 — if a future refactor changes saves to reference players by ID
into the static data instead of storing full snapshots, this safety property
breaks and departures would need a "retired" flag instead of a hard removal.

**Where this runs.** Doc 03's optional backend section already proposes a Cron
Trigger that regenerates league data from CSVs and opens a PR when real-world
transfers land — that's the natural home for this. Each scheduled run produces a
departures list as part of its diff output, for a human to skim before merging,
same as any other roster change.

**Scope for Phase 6 itself:** implement the diff category and the removal rule.
The Cron Trigger that runs it on a schedule is Phase 8 (optional backend) — Phase
6 only needs the pipeline to behave correctly the next time someone runs it by
hand.

## What this actually delivers

- 9 leagues (footy-sim's 7 plus pitch's Serie A and Eredivisie)
- Deeper squads in every footy-sim league — 100 to 300 more players each
- Full player names everywhere, replacing "M. Neuer"
- Nationality across all nine leagues instead of one
- pitch's potential / wonderkid / wage / value intact, so the youth academy,
  development curves and transfer market keep working
- One Node data pipeline with validation and an auditable diff, replacing two
  half-pipelines in two languages
- A real answer to squads going stale: player departures become a tracked,
  visible category in every future regeneration, not a silent gap
