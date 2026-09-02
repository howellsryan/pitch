# 01 — Tech stack

## Where pitch actually is today

Read the shape before changing it.

```
pitch/
├─ index.html          898KB — the built game, committed by hand, served by Pages
├─ CNAME               pitch-sim.com
├─ pitch_source.zip    the real source, zipped into the repo
└─ (extracted)
   ├─ build.py         concatenates 22 files → one HTML. Hardcoded sandbox paths
   ├─ validate.js      1,190 checks, stubs the DOM, runs the bundle in Node
   ├─ shell.html       98KB — all HTML + CSS, no JS
   ├─ data/            9 leagues as generated .js + the source CSVs
   ├─ modules/         12 files, game logic, NO DOM ACCESS
   └─ ui/              7 files, DOM rendering
```

Three properties matter more than anything else in this document:

- **`modules/` has no DOM access.** That is a real domain layer, and it is why
  this is a UI rebuild rather than a rewrite. `matchEngine`, `cups`, `promotion`,
  `potential`, `youthAcademy`, `season`, `gameweek`, `transfers`, `standings`,
  `fixtures`, `injuries`, `save`, `db` all survive.
- **Nothing uses ES modules.** Despite `build.py`'s stripping regexes, the sources
  contain zero `import`/`export`. Files rely on concatenation order and implicit
  top-level globals. Adding real module syntax is Phase 2's main mechanical task.
- **`validate.js` is a genuine asset.** It stubs `document`, `window` and
  `indexedDB`, evaluates the whole bundle in Node, and runs behavioural checks —
  not presence checks. Nothing else in either repo comes close. It must keep
  passing through the entire migration.

## The pick

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite 7** | Replaces `build.py`. HMR, hashed output, Cloudflare plugin |
| Language | **TypeScript, gradually** (`allowJs`) | New code typed; `modules/` stays `.js` until it earns types |
| UI | **Svelte 5 (runes)** | ~5KB runtime; `animate:flip` for the constant reordering |
| Styling | **Tailwind v4** + `@theme` tokens | CSS-first, so the club accent is a real custom property |
| Icons | **Lucide** | pitch already hand-writes Lucide-style inline SVG — same visual language, tree-shaken |
| Persistence | **keep IndexedDB** (`modules/db.js`) | Already right. 8 stores, integrity-hashed, export/import works |
| Tests | **keep `validate.js`**, add **Vitest** | Retire the validator only when Vitest covers the same checks. No browser/E2E suite — the Playwright suite this table once prescribed was removed; do not reintroduce one |
| Host | **Cloudflare Workers static assets** | See doc 03 |

Rationale for Svelte over React is unchanged from the original plan: bundle size
on a 4G phone, built-in FLIP for reordering lists, and low ceremony. The
agent-fluency risk (models emitting Svelte 4 syntax) is real and gets a
`.claude/rules/svelte5.md` plus `eslint-plugin-svelte` in CI, in Phase 2.

**What pitch loses:** nothing in `modules/`. **What it gains:** a build anyone can
run, CI, HMR, preview URLs, and a component model that can animate.

## Target structure

```
pitch/
├─ index.html                 Vite entry — thin
├─ vite.config.ts
├─ wrangler.jsonc
├─ src/
│  ├─ main.ts
│  ├─ app.css                 @theme tokens from docs/design-system.md
│  ├─ game/                   was modules/ — real ES modules, still DOM-free
│  │  ├─ matchEngine.ts  cups.ts  promotion.ts  potential.ts
│  │  ├─ youthAcademy.ts  season.ts  gameweek.ts  transfers.ts
│  │  ├─ standings.ts  fixtures.ts  injuries.ts  save.ts  db.ts
│  │  └─ types.ts             Player, Club, Fixture, Save, CupState
│  ├─ data/                   generated league data (see doc 06)
│  ├─ lib/ui/                 Button, Sheet, ScoreBug, PlayerRow, Pitch, Crest …
│  ├─ screens/                Home  Squad  Tactics  Transfers  League
│  │                          Academy  Trophies  Settings  Matchday
│  └─ App.svelte              shell: context bar, router, bottom nav
├─ tools/
│  ├─ csv-to-league.mjs       was csv_to_league.py + footy-sim's generator
│  └─ reconcile.mjs           footy-sim CSV → pitch schema (doc 06)
                              (no tests/ directory: Vitest specs live beside
                               the code they cover, as src/**/*.test.js)
```

`build.py`, `shell.html` and `ui/` are all deleted by the end of Phase 4.
`pitch_source.zip` goes away in Phase 1 — source belongs in the tree, not in a zip
inside the tree.

## The three risky conversions

### 1. Implicit globals → ES modules

`modules/` and `ui/` share ~200 top-level names by concatenation. Converting means
adding `export` at each definition and `import` at each use.

Do it **one module at a time, running `validate.js` after each**, in the build
order `build.py` already declares — `db → matchEngine → standings → fixtures →
cups → transfers → potential → injuries → promotion → youthAcademy → save →
season → gameweek`. That order is a real dependency graph; it is the safe
sequence.

Two known traps, both already documented in `BRIEFING.md`:
- `season.js` contains a dynamic `await import('./cups.js')` that `build.py`
  rewrites at bundle time (`build.py:77`). Under Vite it becomes a normal import —
  check for a cycle with `cups.js` when you make it real.
- Data files (`data/*.js`) assign to globals and are auto-discovered by
  `build.py`. They become explicit imports, and their order stops mattering once
  the dependencies are declared.

### 2. `validate.js` must keep passing

It reads `/tmp/bundle_final.js` — a concatenated blob. Once Vite owns bundling
there is no such file.

Keep it alive by having Vite emit an IIFE bundle to the path the validator
expects, purely so the checks keep running:

```ts
// vite.config.ts — a second build target, for the validator only
build: { rollupOptions: { output: { format: 'iife', name: 'PITCH' } } }
```

Retire it per-section as Vitest replaces each of its 21 sections and 11 regression
suites. Do not delete it wholesale — it encodes behaviour nobody has written down
anywhere else.

### 3. The live match viewer

`BRIEFING.md` is explicit: `#modal-bd` *is* the watch-match modal, and calling
`showModal()` from inside it destroys the running match. The workaround is
`_openInlinePanel()`, appending a `position:fixed` overlay at z-index 10500,
auto-pausing the match and resuming on close.

In Svelte this constraint evaporates — a match is a route with component state,
and a substitution sheet is a sibling component, not a modal fighting a modal. But
**the sub rules must be carried across verbatim**: GK↔GK only, outfield↔outfield
only, 3-sub limit (`_applyUserSub`). Those are game rules living in UI code, and
they should move into `src/game/` during the port rather than be re-implemented in
a component.

## The event-queue invariant

`BRIEFING.md`'s single most load-bearing rule, and the one a redesign is most
likely to break:

```js
save.pendingEvents = [{type:'league',fixtureId,gw}, {type:'ucl_md',…}, {type:'cup',…}]
```

One button press pops **one** event → pre-match → simulate → result. The gameweek
advances **only when `pendingEvents` is empty**. Cup opponents are pre-drawn when
the queue is built.

The new UI's "Play" button is a queue pop, not a "simulate the week" call. Any
design that advances a whole gameweek in one tap breaks cups and Europe. This is
worth a comment in the code, because it is not obvious from the button's label.

## What this costs

1. **`python3 build.py` → `npm run dev`.** `BRIEFING.md` becomes wrong the moment
   Phase 2 lands and must be rewritten in the same change.
2. **The single-file distribution goes away.** Today you can hand someone one HTML
   file that works offline. The PWA (doc 03) replaces that property, and arguably
   improves on it, but it is a real change to how the game is shared — worth
   keeping `npm run build:singlefile` as an escape hatch if you value it.
3. **Two rendering paradigms coexist** through Phase 4. Deliberate: the
   alternative is a big-bang rewrite with no playable game in between.
