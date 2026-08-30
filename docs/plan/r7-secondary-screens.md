# R7 — Secondary screens and career entry flow

R7 completes the redesign scope in `07-redesign.md`: Academy, Trophies,
Settings and Inbox receive the Plain visual language, and the R1-deferred
Continue/New Career flow becomes reachable without making a running save
unsafe.

## What shipped

### Plain secondary screens

`src/r7.css` is the shared R7 presentation layer for:

- Academy (`AcademyScreen.svelte`)
- Trophies (`TrophiesScreen.svelte`)
- Settings (`SettingsScreen.svelte`)
- Team News / Inbox (`ui/inbox.js`)

The intent is deliberately conservative: these surfaces already had working
simulation/persistence behaviour, so R7 restyles around it instead of
rewriting it. Cards are flattened into ruled rows wherever there is no real
semantic grouping, numeric metadata uses tabular treatment, the shared system
action accent owns interactive emphasis, and club colour remains identity.

`src/r7-mobile-fixes.css` contains geometry corrections found by the real
390x844 browser audit. Keep those corrections measured: the floating Broadcast
navigation sits over the shell, so a control may be scrollable and still fail
if its physical rectangle overlaps the nav.

### Continue career / Main Menu

Returning players still boot straight into their career. That default was
correct in R1 and remains correct.

R7 adds an explicit, ephemeral route back to the title from Settings:

1. `SettingsScreen.svelte` calls `showEntryMenu()`.
2. `showEntryMenu()` in `ui/renderers.js` hides `#app`, reveals the existing
   `#ng` entry stage and marks `entryState.hasSave = true`.
3. `CareerMenu.svelte`, mounted in the same `#ng` stage, renders the saved
   club/manager/season summary plus **Continue career**.
4. Continue calls the shared `enterGame()` path, so resumed, freshly-created
   and title-menu careers all reveal the game shell identically.

This is intentionally **not** a URL/hash route. The R1 hash prototype was
sticky across reloads and created duplicate shell handler binding. R7 keeps
the menu state in memory only; reload still resumes the career directly.

`initUI()` is now idempotent. Returning to the title and continuing must never
register sidebar or history handlers a second time.

### Start New Career

Starting another career is destructive and remains separate from Main Menu.
Both Settings and the saved-career title menu show an explicit confirmation
that tells the player to export a `.pitch` backup first.

The normal UI path deletes the IndexedDB database and reloads before exposing
club selection. Do not change Main Menu so it deletes or mutates career data.

`.pitch` export/import and save-code import remain untouched escape hatches and
must continue to work even if other save UX changes later.

## Persistence invariant: fixtures and standings must be replaced

R1 documented a blocker in `startNewGame()`: using `putFixturesBulk()` and
`putStandingsBulk()` on top of an existing career leaves rows belonging to the
old league behind because those stores use league/team-specific keys.

R7 changes new-game creation to:

```js
await replaceAllStandings(standings);
await replaceAllFixtures(fixtures);
```

Do not regress this to bulk-put semantics. A cross-league replacement career
must contain exactly the new league's standings and fixtures, with no previous
club present.

The UI currently deletes the old database before a user starts a fresh career,
but the replacement invariant still belongs in `startNewGame()` itself. It is
what makes the function safe if a future flow creates a career without a full
DB reset.

## Regression coverage

`tests/r7-career-flow.spec.mjs` covers the R7-specific behaviour:

- Settings -> Main Menu exposes the existing career and Continue returns Home.
- Start New Career opens a destructive confirmation and can be cancelled.
- Calling `startNewGame()` across leagues leaves no stale fixture or standings
  rows.
- Academy, Trophies, Settings and Team News retain mobile width/nav clearance,
  including a real generated Academy news item in Inbox.

The older `tests/browser-audit.spec.mjs` remains authoritative for visible
geometry across the whole app. Do not weaken its overlap or accessibility
checks to make R7 pass; fix the UI instead.

## Files to read before changing this flow

- `docs/plan/07-redesign.md` — redesign scope and the original R1 blocker.
- `src/modules/save.js` — career creation and replace-all invariant.
- `src/ui/renderers.js` — boot, title handoff and idempotent shell wiring.
- `src/lib/state/entry.svelte.js` — entry/title state.
- `src/lib/ui/CareerMenu.svelte` — saved-career title UI.
- `src/lib/ui/SettingsScreen.svelte` — menu, backup/import and destructive reset.
- `src/r7.css` / `src/r7-mobile-fixes.css` — Plain treatment and measured mobile fixes.
- `tests/r7-career-flow.spec.mjs` / `tests/browser-audit.spec.mjs` — browser contracts.

## Next

R8 is the quality floor: light mode, PWA/installability, full responsive matrix,
focus/contrast verification and real-device iOS/Android passes. R7 should not
expand into those items unless a regression blocks the current screens.
