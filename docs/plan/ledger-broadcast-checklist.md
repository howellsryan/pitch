# Ledger-driven match broadcast

Goal: the watched match presents the authoritative action ledger as readable football with recognisable players and usable mobile controls.

## Design and boundaries

The current MatchScreen sends possession plus goals, discarding T3/T4 route, actor, runner, defender and shot records. The old visual chooser independently invents attempts. Replace that path for ledger-backed matches with acquire → route → contest/chance → outcome → restart choreography. Coordinates remain render-only: the ledger does not contain tracking data, so trajectories are illustrative, but identities and outcomes must agree. Keep the legacy presentation API for older callers and its regression contracts.

MatchScreen advances one phase only when presentation is ready. Frame integration and match timers both obey speed; pause freezes both. Finish the last scene before full time. No engine RNG, balance, persistence, lineup eligibility or background-world changes.

Touches: `src/game/broadcastSimulation.js` (pure presentation), `src/lib/ui/MatchScreen.svelte` (adapter/rendering), Vitest contracts and broadcast architecture documentation. No legacy module-order changes; retain the existing MatchScreen ES import.

Unknowns to verify: all route/outcome combinations terminate; last-phase goals and halftime survive; speed does not drop phases; selected players survive substitutions; the 390px control dock remains usable. Verify through deterministic frame-stepping contracts and hands-on app inspection, alongside builds, lint, tests and audits.

## Checklist

- [x] Inspect PR head, action ledger, presentation clocks and repository constraints.
- [x] Consume selected actors/routes/outcomes without inventing competing shots.
- [x] Stage movement, receiving runs, challenges, shots and restarts causally.
- [x] Synchronise phase advancement, speed, pause, halftime and full time.
- [x] Render player figures, improved pitch, live commentary and compact controls.
- [x] Review diff and pass deterministic/build/lint gates.
- [ ] Inspect mobile/wide running app; push and verify CI/preview.

## Reference

Football Manager 26 Touch's official publisher listing emphasises player movement, in/out-of-possession shapes and a phase visualiser: https://apps.apple.com/dk/app/football-manager-26-touch/id1626267810 . Use those principles as inspiration, with original lightweight browser rendering, not copied assets or a claim to reproduce FM's spatial engine.

Local verification: both builds, lint, 92 test files / 737 tests, UI emoji and accent audits and match-balance guardrails passed. Local browser access was blocked by the browser network boundary; use Cloudflare preview for rendered inspection. The referenced code-review skill is missing from the checkout; direct diff review found and fixed deferred-lineup and final-phase sequencing defects.
