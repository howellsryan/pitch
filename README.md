# PITCH — Football Career Simulator

[Play at pitch-sim.com](https://pitch-sim.com).

Pitch is a free, browser-first football management game. Choose a club, build
your squad, set its tactics and take your career through successive seasons.
Matches are simulated: you make management decisions and can watch the action
or get an instant result. No account is required for local play.

## What is playable

- **9 leagues, 181 clubs and 5,092 starting players** across England's four
  divisions, La Liga, Bundesliga, Serie A, Ligue 1 and the Eredivisie.
- **A living football world:** every supported league plays fixtures through
  the match engine, with standings, player statistics and season history.
- **Domestic and European cups**, including current 36-team UEFA league phases,
  knockout play-offs, two-legged ties and no away-goals tiebreak.
- **Quick Sim and Broadcast** use the same authoritative football simulation.
  Broadcast supports substitutions and tactical changes during the match.
- **Squad and tactics:** 14 formations, a named XI and bench, team instructions,
  player roles, fitness, injuries, rehabilitation, morale and development.
- **Recruitment:** scouting reports, staged transfer negotiations, personal
  terms, loans, free agents, contracts and AI recruitment.
- **Club and career:** academy pathways, training, staff, facilities, finances,
  board objectives, inbox decisions and manager jobs.
- **Independent career slots**, browser autosaving and `.pitch` export/import.
  Optional Google cloud backup uses the deployed server configuration.

Read the [player guide and feature decisions](docs/features.md) for the
management loop and the current simulation boundaries. The
[October launch review](docs/reviews/2026-10-08-launch-readiness.md) records the
main-branch findings, fixes, fifteen-season simulation and remaining limits.

## Start playing

1. Open [pitch-sim.com](https://pitch-sim.com), choose a club and optionally enter
   your manager name.
2. Review **Squad** to set the XI, bench and tactics. Use **Market** for scouting
   and recruitment; **More** opens the table, academy, inbox and settings.
3. Select **Play**, review team news and choose an instant simulation or Broadcast.
4. Continue through the result report. A week may contain several league or cup
   matches; each Play action resolves the next event before the world advances.

Progress saves in this browser. **Settings → Export Save** downloads a backup;
**Import Save** restores a file or code. **Settings → Main Menu → New career**
creates a separate slot. Import from that new-career picker also creates a
separate slot; importing within an existing career replaces that slot.

## Player data

The checked-in roster snapshot was refreshed on **4 September 2026**, with
**1 September 2026** as its reference date, using the public EA SPORTS FC 27
ratings feed. The [refresh report](tools/player-data-report.json) records
provenance and coverage; the [data notes](docs/features.md#data-and-format-limits)
explain age fallbacks, derived detailed attributes and incomplete club fields.
Existing careers keep their own player snapshots when starting data changes.

## Development

Requires Node.js 22 and Python 3 for the legacy compatibility build.

```bash
npm ci
npm run dev              # local Vite server at http://localhost:5173
npm run build            # legacy compatibility validation + production app
npm run preview          # build and serve the production app on port 4173
```

The deployed app is built with **Svelte 5, Vite and Tailwind CSS**. Core
simulation runs locally; IndexedDB owns career storage. Cloudflare Workers and
D1 provide optional authentication/cloud-save functionality.

| Location | Responsibility |
| --- | --- |
| `src/modules/` | DOM-free match, career and world simulation; persistence |
| `src/game/` | Shared game presentation and computation |
| `src/lib/ui/` | Svelte screens and UI components |
| `src/data/csv/` | Editable team/player data inputs |
| `src/data/` | Generated starting rosters |
| `functions/` | Optional Cloudflare server routes |
| `docs/engineering/` | Architecture and behavioural contracts |

`npm run build:app` generates the deployed `dist/` artifact. `build:legacy`
generates a compatibility `index.html` used by the validator; it is not the
production UI. Neither build output is hand-edited or committed. Cloudflare
Workers Builds owns deployments; GitHub Actions verifies both build paths.

### Verification

```bash
npm run build
npm run test
npm run lint
npm run check:accents
npm run balance:match:deep:check
```

Vitest contracts and statistical balance gates cover the simulation. Browser
journeys are checked by hand, including the 390px mobile flow; there is no
browser test suite. Start with [AGENTS.md](AGENTS.md) before contributing.

### Data tooling

```bash
npm run refresh:players:dry-run    # fetch/report current public source; no writes
npm run refresh:players            # refresh CSVs and regenerate supported rosters
node tools/csv-to-league.mjs --dry-run
node tools/csv-to-league.mjs --league=prem
```

Use the existing CSV pipeline and preserve provenance. A roster refresh is an
explicit data operation, not a requirement for running the game or its tests.
Historical plans live under `docs/plan/`; they describe decisions at the time
and can differ from today's implementation.

## Agent workflows

[AGENTS.md](AGENTS.md) is the contributor contract. Run `npm run agents:install`
and `npm run agents:check` to install and verify the pinned workflows described
in [docs/agent-workflows.md](docs/agent-workflows.md).
