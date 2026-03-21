# PITCH v3.1 — AI Session Briefing

> **Paste this file as your FIRST message in a new Claude conversation.**
> Replaces ~200k tokens of history with ~3k tokens of precise, actionable context.

## Quick Reference

| Action | Command |
|--------|---------|
| **Build** | `python3 /home/claude/pitch2/build.py` |
| **Validate** | `node /home/claude/pitch2/validate.js` (672 checks, 0 failures required) |
| **Output** | `/mnt/user-data/outputs/pitch.html` (single-file, ~386KB) |
| **Bundle** | `/tmp/bundle_final.js` (intermediate, read by validate.js) |

## Project: What Is PITCH

Single-file football career manager. Vanilla JS + IndexedDB + CSS. No framework, no bundler at runtime — `build.py` concatenates 22 source files, strips ES module syntax, runs validation, and emits one HTML file.

## Source Map

```
/home/claude/pitch2/
├── build.py                 # Build pipeline (bundle → validate → assemble → structural checks)
├── validate.js              # 672 checks across 21 sections + 10 regression suites
├── shell.html               # HTML/CSS shell (no JS) — 73KB
├── BRIEFING.md              # This file
│
├── data/                    # Static team/player data (read-only at runtime)
│   ├── plTeams.js           # 20 PL clubs, 2025/26 squads (30KB)
│   ├── extraLeagues.js      # La Liga, Bundesliga, Serie A, Ligue 1 (24KB)
│   └── championship.js      # 6 Championship clubs for relegation (7KB)
│
├── modules/                 # Game logic (no DOM access)
│   ├── db.js                # IndexedDB: openDB, bulkPut, clearAndBulkPut, deleteDB
│   ├── matchEngine.js       # Simulation core (see §Match Engine below)
│   ├── standings.js         # sortTable, applyResult, recomputePositions, blankStandingRow
│   ├── fixtures.js          # generateLeagueFixtures (circle-method + H/A optimisation)
│   ├── cups.js              # CUP_META, UCL_CLUBS, simulateCupRound, simulateUCLMatchday
│   ├── transfers.js         # buyPlayer, sellPlayer, generateAIOffers, formAdjustedValue
│   ├── potential.js         # assignPotentials, applyDevelopment, getPotentialStars
│   ├── promotion.js         # getEuropeanQualifiers, processLeagueChanges, getZoneInfo
│   ├── youthAcademy.js      # generateCohort, runYouthIntake, promoteYouthPlayer
│   ├── save.js              # startNewGame (seeds teams+players+fixtures+standings+youth)
│   ├── season.js            # processEndOfSeason, calculatePrizeMoney, reputationBudget
│   └── gameweek.js          # Event queue: buildPendingEvents, advanceOneFixture (see §Event Queue)
│
└── ui/                      # DOM rendering (reads modules, writes to DOM)
    ├── helpers.js            # fmt.money/wage/date, toast, showModal, showLoader, navigateTo
    ├── home_transfers.js     # renderHome, showMatchReport, handleEndOfSeason, renderTransfers
    ├── renderers.js          # renderCompetitions, renderNewGame, renderHonours, renderSettings, boot
    ├── squad_tactics_offers.js  # renderSquad, renderTactics★, renderOffers, renderCups
    ├── academy.js            # renderAcademy, buildYouthCard, handleYouthAction
    ├── prematch.js           # showPreMatchModal, handleAdvanceOneFixture, _launchWatchMatch
    └── watchmatch.js         # showWatchMatchModal, live tick engine, subs, tactics (see §Watch Match)
```

★ = source of truth for `save.formation` and `save.lineup`

## Build Order (dependencies flow top→bottom)

```
data/plTeams → data/extraLeagues → data/championship
  → db → matchEngine → standings → fixtures → cups → transfers
  → potential → promotion → youthAcademy → save → season → gameweek
  → helpers → home_transfers → renderers → squad_tactics_offers
  → academy → prematch → watchmatch
```

**Never reorder modules in build.py** — later modules reference earlier ones as globals.

## Workflow: How to Change Things

```
1. Read ONLY the 1–3 files involved (use view tool)
2. Targeted edit via str_replace (never rewrite whole files unless unavoidable)
3. Add validation checks to validate.js for the new/changed feature
4. Run: python3 /home/claude/pitch2/build.py
5. Fix any failures → repeat step 4
6. Deliver pitch.html
```

---

## Critical Invariants

### §Event Queue — One Event Per Button Press

```
save.pendingEvents = [{type:'league', fixtureId, gw}, {type:'ucl_md', cupId, matchday, ...}, {type:'cup', cupId, roundName, ...}]
```

- `buildPendingEvents(gw, userTeamId, fixtures, cups, allTeams)` builds the queue each GW
- Each press pops ONE event → pre-match modal → simulate → result modal
- Cup opponents are **pre-drawn at queue build time** (name/crest/home-away stored on event)
- GW counter advances **only when pendingEvents is empty**
- AI league fixtures for the same GW are resolved silently after the user's league match

**Forbidden**: `processCupRounds()`, `finaliseGW()`, silent cup simulation inside `advanceOneFixture`

### §Lineup Flow — Tactics Screen Is Source of Truth

```
Tactics screen (renderTactics)
  → writes save.formation (string, e.g. '4-3-3')
  → writes save.lineup (array of 11 player IDs, or null for auto-pick)
  → putSave()
        ↓
Pre-match modal (READ-ONLY — no formation picker, no override)
  → reads save.formation + save.lineup for display only
        ↓
Quick Sim:   advanceOneFixture() → simulateMatch(..., hLineup, aLineup)
Watch Match: _launchWatchMatch() → buildLiveMatchState(..., homeLineup, awayLineup)
        ↓
selectEleven(players, formation, lineup)
  → if lineup has 11 available players → uses them in order
  → otherwise auto-fills by position fit + rating
  → AI teams always pass lineup=null
```

**Forbidden**: formation picker in pre-match modal, calling `showModal()` inside `showModal()` (destroys parent)

### §Watch Match — Inline Panel Architecture

The watch match modal IS `#modal-bd`. Calling `showModal()` from inside it **destroys the live match**.

All intervention panels use `_openInlinePanel(title, bodyHtml, onClose)`:
- Appends a `position:fixed` overlay to `document.body`
- z-index 600 (above modal 500, below loader 700)
- Auto-pauses match, resumes on close

Substitution rules:
- GK↔GK only, outfield↔outfield only (`_applyUserSub` enforces)
- 3-sub limit via `hSubsLeft`/`aSubsLeft`
- Backup GKs appear on bench (needed for GK injury subs)
- `⏩ Skip` instantly simulates remaining phases → `_finishMatch()`
- Result committed via `advanceOneFixtureWithResult(matchResult, event, userIsHome)`

### §Match Engine

| Attribute | Drives |
|-----------|--------|
| `attack` | Goal scoring (ST/CF/RW/LW/CAM) |
| `midfield` | Possession, chance creation, assists |
| `defence` + `goalkeeping` | Defensive resistance (70/30 split) |

- **120 phases/game**, midfield ratio determines phase distribution
- GK can **NEVER** score (weight=0 in `pickScorer`)
- Fitness drain: ~0.22/attacking phase, ~0.15/defending → ~22 total/game
- Recovery between matches: played +15, non-played +20
- `fitMult`: ≥80→1.00, ≥65→0.95, ≥50→0.88, ≥35→0.78, <35→0.65
- Drain rates **identical** in `simulateMatch` and `simulateMatchSegment` (regression tested)

Live match API:
```
buildLiveMatchState() → liveState (mutable)
simulateMatchSegment(home, away, liveState, startPhase, endPhase) → {segEvents, updatedState}
finaliseLiveMatch(home, away, liveState, allEvents) → standard result shape
```

---

## Data Shapes

### Player
```js
{ id, name, position, age, attack, midfield, defence, goalkeeping,
  value, wage, teamId, fitness, potentialRating, growthPoints, peakAge,
  goals, assists, cleanSheets, form, injured, suspended, inSquad, transferListed,
  isYouth, isWonderkid, youthTeamId, season }
```

### Save State
```js
{ userTeamId, userLeague, currentGameweek, totalGameweeks, currentDate, season,
  formation,       // string '4-3-3' — set by Tactics screen only
  lineup,          // [11 player IDs] or null — set by Tactics screen only
  cups, pendingEvents, inboundOffers, youthCohort }
```

### liveState (Watch Match)
```js
{ hActive, aActive, hBenchLeft, aBenchLeft, hFitness(Map), aFitness(Map),
  hSubsLeft, aSubsLeft, hGoals, aGoals, hPhases, aPhases,
  hStr, aStr, hMidShare, homeFormation, awayFormation, hElev, aElev, hBench, aBench }
```

---

## Cup & League Structure

| Competition | Round GWs | Notes |
|---|---|---|
| League Cup | 3, 7, 12, 17, 20, 24 | Domestic, same-league opponents |
| FA Cup | 22, 25, 28, 31, 34, 37 | Domestic, same-league opponents |
| UCL Group | 5, 7, 9, 11, 13, 15, 17, 19 | 8 matchdays, opponents from `UCL_CLUBS` |
| UCL Knockouts | 22, 27, 31, 35 | After league phase (≥7 pts to qualify) |
| UEL | 6, 21, 25, 29, 33, 36 | |
| UECL | 6, 22, 27, 31, 35 | |

**PL zones**: Top 4→UCL · 5–6→UEL · 7→UECL · 18–20→Relegated
**Championship**: 1–2→Auto promoted · 3→Playoff promoted · 22–24→League One

---

## Youth Academy

- New game: `generateCohort()` called immediately for user's team
- End of season: `runYouthIntake()` — ages youth +1, generates new intake, AI auto-promotes
- Tier scales with reputation: elite(93+) / top(85+) / good(75+) / average(65+) / poor(<65)
- Wonderkid chance: ~4% elite, ~1% top, 0% below
- Age-out: 20+ released automatically if not promoted
- `buildInitialCupState(cupIds, userTeamId)` — **always pass userTeamId** to exclude self from UCL opponents

---

## Anti-Patterns (DO NOT)

**Architecture**:
- ❌ Skip `build.py` and manually assemble HTML
- ❌ Rewrite a whole module when `str_replace` works
- ❌ Add features without adding `validate.js` checks
- ❌ Rename functions without adding to `RENAMES` in `build.py`
- ❌ Reorder modules in `build.py` (dependency chain breaks)

**Event queue**:
- ❌ Re-introduce `processCupRounds()` or `finaliseGW()`
- ❌ Simulate cups silently inside `advanceOneFixture()`
- ❌ Advance `currentGameweek` before `pendingEvents` is empty

**UI modals**:
- ❌ Call `showModal()` from inside `watchmatch.js` (destroys live match)
- ❌ Call `showModal()` inside another `showModal()` handler (destroys parent)
- ❌ Use `position:absolute` inside `.modal-xl` — use `_openInlinePanel()`
- ❌ Add formation picker to pre-match modal (Tactics screen is source of truth)

**Match engine**:
- ❌ Different fitness drain rates in `simulateMatch` vs `simulateMatchSegment`
- ❌ Allow GK to score (weight must be 0)
- ❌ Allow cross-position GK subs in `_applyUserSub`
- ❌ Filter ALL GKs from bench (backup GK needed for GK↔GK subs)
- ❌ Pass `homePlayers`/`awayPlayers` positionally — resolve from `userIsHome`

**Data**:
- ❌ Call `buildInitialCupState` without passing `userTeamId`
- ❌ Let domestic cup opponents draw from all leagues (filter by `userLeague`)
- ❌ Put all UCL scorers in `homeScorers` (respect `userIsHome`)
- ❌ Call `selectEleven()` without `save.lineup` for the user's team
- ❌ Use variables in template literals without defining them first in scope

---

## Validation Suite (672 checks)

21 sections + 10 regression suites covering: fixture generation, cup scheduling, event queue, pre-match wiring, match engine, potential system, squad data, promotion/relegation, budget scaling, UI functions, transfer system, code quality, youth academy, watch match, standings, match stats, player ratings, all-league data integrity, prize money, cup integrity, season flow.

Regression suites: goal attribution, home/away player mapping, GK on bench, stub player names, fitness drain consistency, between-match recovery, formation change GK retention, HOME/AWAY labels.

**Policy: 0 failures required before shipping.**

---

## Token Efficiency Notes (v3.1)

All module-level docstrings condensed to single-line summaries. Section separators shortened. No redundant inline style comments. Each source file opens with a one-line `/** ... */` describing its exports.

To read the codebase efficiently:
1. Read this BRIEFING first (covers architecture + invariants)
2. Read ONLY the files you need to change (use `view` tool)
3. Never read `shell.html` unless changing CSS — it's 73KB of HTML/CSS
4. Never read `data/*.js` unless changing team/player data — it's static data
5. `validate.js` is reference-only — read the section relevant to your change

File sizes for context budgeting:
- Small (<150 lines): db, standings, fixtures, promotion, save, transfers, helpers
- Medium (200-350 lines): cups, potential, youthAcademy, season, academy, renderers, prematch
- Large (450-750 lines): matchEngine, gameweek, home_transfers, squad_tactics_offers, watchmatch

---

## Open Issues

_Update at end of each session._

- [ ] Player morale system (affects match performance)
- [ ] Two-legged UCL knockout ties (currently single-leg + AET/pens)
- [ ] Player injury generation (fields exist, always false)
- [ ] News feed / inbox for transfers, cup draws
- [ ] Manager reputation / difficulty tiers
- [ ] Watch Match: player ratings on fitness list
- [ ] Watch Match: tactical instructions (press high, sit deep)
- [x] Tactics screen is source of truth for lineup
- [x] Watch Match: mobile substitution bug fixed
- [x] Watch Match: skip match button
- [x] Fitness rebalanced: ~22/game drain, +15/+20 recovery
- [x] Goal attribution bug fixed
- [x] GK↔GK subs; cross-position blocked
- [x] Fitness drain synced across simulateMatch and simulateMatchSegment
- [x] HOME/AWAY labels always reflect venue
- [x] v3.1: Token-optimised source (docstrings condensed, headers trimmed)
