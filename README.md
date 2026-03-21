# ⚽ PITCH

**A football manager game that runs in a single HTML file.**

Pick a club, set your tactics, wheel and deal in the transfer market, watch matches live, and guide your team through a full Premier League season — FA Cup, League Cup, and European football included.

No install. No server. No framework. Just open `pitch.html`.

-----

## Play

Open https://www.howellsryan.github.io/pitch or
download [`pitch.html`](pitch.html) and open it in any modern browser.

That’s it.

-----

## Features

### 🏆 Full Season Simulation

- 38-gameweek Premier League campaign with accurate 2025/26 squads
- FA Cup, League Cup, and European competition (UCL / UEL / UECL)
- Promotion, relegation, and prize money at the end of every season

### 🔴 Watch Matches Live

- Real-time match engine with a 120-phase simulation
- Live scoreboard, event feed, possession stats, and player fitness tracking
- Make substitutions and change formation mid-match
- Skip ahead or sim instantly — your call

### 💸 Transfers

- Buy and sell players with a dynamic valuation system
- Form affects prices — hot players cost more, cold players can be had cheap
- AI clubs make inbound offers you can accept or reject

### 🧠 Tactics

- Choose your formation and pin your preferred XI
- The engine selects your best available lineup automatically when needed
- Fitness is tracked across every match — rotate or pay the price

### 🌱 Youth Academy

- Your club generates a youth cohort every pre-season
- Tier depends on reputation: elite academies produce wonderkids
- Promote standouts to the first team or release them

### 📊 20 Premier League Clubs

- All 20 PL clubs with authentic squads including Liverpool (Isak, Wirtz), Chelsea (Sancho), and the rest
- Championship, La Liga, Bundesliga, Serie A, and Ligue 1 clubs for transfers and European opposition

-----

## Technical

PITCH is vanilla JavaScript — no React, no Vue, no bundler at runtime.

The source is split across 22 modules in three layers:

```
data/       — Static team and player data (read-only)
modules/    — Game logic with no DOM access
ui/         — Rendering and event handling
```

A Python build script (`build.py`) concatenates everything in dependency order, strips ES module syntax, runs a 672-check validation suite, and emits a single self-contained HTML file. IndexedDB handles save state in the browser.

### Build

```bash
python3 build.py
# → pitch.html (~370KB)
```

Requires Node.js (for validation) and Python 3.

### Validation

```bash
node validate.js
```

672 checks across fixture generation, match engine, cup scheduling, transfer logic, squad data integrity, youth academy, promotion/relegation, and more. Zero failures required before a build ships.

-----

## Leagues & Competitions

|Competition             |Rounds                               |
|------------------------|-------------------------------------|
|Premier League          |38 gameweeks, 20 clubs               |
|FA Cup                  |GWs 22, 25, 28, 31, 34, 37           |
|League Cup              |GWs 3, 7, 12, 17, 20, 24             |
|Champions League        |Group stage (8 matchdays) + knockouts|
|Europa League           |GWs 6, 21, 25, 29, 33, 36            |
|Europa Conference League|GWs 6, 22, 27, 31, 35                |

**PL finish → European qualification:**
Top 4 → UCL · 5th–6th → UEL · 7th → UECL · 18th–20th → relegated

-----

## Roadmap

- [ ] Player morale system
- [ ] Two-legged European knockout ties
- [ ] Player injuries
- [ ] News feed / transfer inbox
- [ ] Manager reputation and difficulty settings
- [ ] Watch Match: player ratings overlay
- [ ] Tactical instructions (press high, sit deep)

-----

## Licence

MIT
