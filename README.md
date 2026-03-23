# PITCH — Football Career Simulator

A single-file football career manager built with vanilla JS, CSS, and IndexedDB. No framework, no dependencies, no server — just one HTML file you open in a browser and you're managing a club.

## Features

### Leagues & Competitions
- **9 leagues, 186 clubs** — Premier League, Championship, League One, League Two, La Liga, Bundesliga, Serie A, Ligue 1, Eredivisie
- **Full English football pyramid** — promotion and relegation across all four English tiers with realistic playoff system
- **Domestic cups** — FA Cup, League Cup, Copa del Rey, DFB-Pokal, Coppa Italia, Coupe de France, KNVB Beker
- **European football** — Champions League (league phase + knockouts), Europa League, Conference League
- **Honours cabinet** — real historical trophy tallies + in-game wins, localised per nation

### Promotion & Relegation
- **Automatic promotion** — top 2 in Championship, League One, and League Two go up
- **Play-offs** — 3rd to 6th contest two-legged semi-finals and a neutral-venue final for the last promotion spot
- **Relegation** — bottom 3 from the Premier League, Championship, and League One drop down
- **Full pyramid simulation** — AI leagues resolve standings by reputation at end of season, so clubs move realistically even in leagues you're not playing in

### Match Day
- **Watch Match** — live tick-by-tick simulation with real-time commentary, substitutions, and tactical changes
- **Quick Sim** — instant results with full match report, stats, and scorers
- **Mentality system** — Defensive, Balanced, Possession, or Attacking; affects goals, shots, possession, and counter-attack exposure
- **Tactics** — lineup builder with 7 formations, drag-to-swap pitch slots, mentality picker
- **Match stats** — possession, shots, xG, corners, fouls, yellow cards

### Squad & Transfers
- **Transfer market** — filter by position, league, age, rating, potential, price; slider-based offers with acceptance likelihood hints
- **Negotiation** — rejected offers trigger counter-offers; slider-based haggling with live acceptance hints
- **Squad management** — potential star ratings, transfer listing, fitness tracking, form indicators
- **Youth academy** — intake quality tiered by club reputation, wonderkid system, promote or release decisions
- **Player development** — all match participants earn growth points; defenders get clean sheet bonuses; position-appropriate stat boosts

### Season Management
- **Multi-season career** — season rollover with aging, retirement, prize money, and cup reallocation
- **Aging system** — stat decline past peak age (15–85% chance scaling), age-based fitness drain in matches, recovery penalties for older players
- **Retirement** — players 36+ retire at end of season; elite players get a small reprieve chance
- **Save/Load** — export save as base64 code or `.pitch` file; import on any device; integrity-checked with FNV-1a hash

## Getting Started

1. Download `index.html`
2. Open in any modern browser (Chrome, Firefox, Safari, Edge)
3. Pick your club and go — works fully offline, saves to browser IndexedDB

## Development

Source lives in `pitch2/`. The build system concatenates 22 JS modules into a single HTML file.

```bash
# Build (bundles, validates, assembles)
python3 pitch2/build.py

# Output
/mnt/user-data/outputs/index.html   (~616 KB)
```

### Architecture

```
data/          → Static team & player data (6 files, 186 clubs)
modules/       → Game logic — no DOM access (12 files)
ui/            → DOM rendering (6 files)
build.py       → Concatenation pipeline + syntax validation
validate.js    → 1190 automated checks, 0 failures required
shell.html     → HTML/CSS shell (no JS)
BRIEFING.md    → Full architecture docs, invariants, anti-patterns
```

### Tech Stack

- **Vanilla JS** — no framework, no dependencies, no build tools at runtime
- **IndexedDB** — persistent game state via a thin async wrapper
- **CSS custom properties** — dark theme design tokens, fully responsive layout
- **build.py** — Python concatenation pipeline with JS syntax validation
- **validate.js** — 1190 automated checks run on every build (0 failures required to ship)

### Adding League Data

Leagues are added via a CSV pipeline — no hand-editing JS files:

```bash
# Create CSVs, run converter, build
python3 csv_to_league.py data/csv/teams.csv data/csv/players.csv data/output.js ARRAY_NAME helper
python3 build.py
```

Pre-registered slots exist for Segunda División, 2. Bundesliga, Serie B, and Ligue 2 — just add the CSVs and build.

See [`BRIEFING.md`](BRIEFING.md) for full architecture documentation, invariants, and anti-patterns.

## Version History

| Version | Highlights |
|---|---|
| v3.4 | Multi-tier promotion/relegation across English pyramid, playoff system (2-leg semis + final), reputation tiering by league |
| v3.3 | Mentality system (Defensive/Balanced/Possession/Attacking), xG fix, European cups visible on enrolment |
| v3.2 | National cups per league, super cup fix, advanced transfer filters, honour cabinet localisation |
| v3.1 | Token-optimised source, multi-league support, Watch Match live viewer |
| v3.0 | Multi-season, cups, potential system, youth academy |
