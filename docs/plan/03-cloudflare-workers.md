# 03 — Cloudflare Workers deployment

## Workers, not Pages

3site deploys to **Cloudflare Pages** (`wrangler.template.toml` sets
`pages_build_output_dir`, `scripts/deploy-site.mjs` runs `wrangler pages deploy`).
Copy the *automation shape*, not the target: Cloudflare's current guidance is
explicit —

> "Workers Static Assets is the recommended way to deploy static sites, single-page
> applications, and full-stack apps on Cloudflare. If you are starting a new
> project, use Workers instead of Pages. Pages continues to work, but new features
> and optimizations are focused on Workers."
> — [Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)

Which also matches what you asked for. Practical consequences: static asset
requests are free and unmetered exactly as on Pages, and Workers additionally
unlocks Durable Objects, Cron Triggers, D1 bindings and proper observability —
all of which the "future backend" section below wants.

## Phase 0 — ship pitch, unchanged, and move the domain

pitch is live today on **GitHub Pages**, serving the committed 898KB root
`index.html`, with `CNAME` pointing `pitch-sim.com` at it. There is no CI and no
build in the pipeline — the built file is committed by hand.

```jsonc
// wrangler.jsonc
{
  "name": "pitch",
  "compatibility_date": "2026-08-24",
  "assets": {
    "directory": "./",
    "not_found_handling": "404-page"
  }
}
```

```
# .assetsignore
node_modules
.git
pitch_source.zip
src
docs
tools
.claude
```

```bash
npx wrangler@4 deploy          # → https://pitch.<subdomain>.workers.dev
```

**Then move the domain, in this order:**

1. Verify the game fully on the `workers.dev` URL — start a career, play a
   gameweek, watch a match, save and reload.
2. Add `pitch-sim.com` as a custom domain on the Worker (Workers & Pages →
   pitch → Settings → Domains & Routes). Cloudflare provisions DNS and the
   certificate.
3. Only once that resolves: delete `CNAME` and disable GitHub Pages.

Never step 3 before step 2. DNS rollback is quick, but a live site pointing at
nothing is still a live site down.

Serving the repo root is a Phase-0-only shortcut; Phase 2 replaces it with a real
build output directory.

## Phase 2 onward — the real config

```jsonc
// wrangler.jsonc
{
  "name": "pitch",
  "compatibility_date": "2026-08-24",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  },
  "observability": { "enabled": true }
}
```

No `main` field, no Worker script: a pure static deploy, which is the cheapest
and fastest thing Cloudflare will serve. Add `main` only when there is an actual
API to run (see the backend section).

`not_found_handling: "single-page-application"` makes deep links work if the app
ever adopts real URLs (`/squad`, `/transfers`) rather than in-memory tab state.
Worth doing in Phase 3 — it costs nothing and buys back-button support, which is
the single most-broken thing about tab-based web apps on mobile.

### Caching headers

Vite emits content-hashed filenames, so hashed assets are immutable while the
entry HTML must never be cached. Put a `public/_headers` file in the project so
Vite copies it into `dist/`:

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache

/sw.js
  Cache-Control: no-cache
```

Getting this wrong is the classic PWA failure: a stale `index.html` or service
worker pinning users to an old build for a year.

### Vite config

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",          // never auto-reload mid-match
      manifest: {
        name: "Footy Sim",
        short_name: "Footy Sim",
        display: "standalone",
        orientation: "portrait",
        background_color: "#04070D",
        theme_color: "#04070D",
        icons: [/* 192 + 512 + maskable */],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,woff2}"] },
    }),
  ],
  build: { target: "es2022" },
});
```

## PWA — why it matters more than usual here

This is an IndexedDB, no-account, single-device game. That profile is
*exactly* a PWA:

- **Installable** — "Add to Home Screen" gives a fullscreen, chromeless app with
  its own icon. For a career mode you dip into daily, that's the difference
  between a bookmark and a game.
- **Offline** — everything already runs client-side. Precaching the shell means
  it works on the Tube.
- **`display: standalone` + `orientation: portrait`** removes the browser UI that
  makes the current app feel like a website.

It also replaces something pitch loses in Phase 2: today the whole game is one
HTML file you can hand to someone and they can open offline forever. If you value
that property, keep a `npm run build:singlefile` target producing an inlined
build — it costs little and it's a genuinely nice thing about pitch today.

Two rules:
- `registerType: "prompt"`, never `"autoUpdate"`. An auto-reload during a match
  is unforgivable. Show a "New version — restart?" toast and let the player choose.
- **Protect the save across service-worker updates.** The career lives in
  IndexedDB (`pitch_fc`, `DB_VERSION = 3`, 8 object stores). A service worker
  never touches IndexedDB, so the risk isn't the SW itself — it's a user clearing
  site data, which takes the career with it. pitch already exports a `.pitch` file
  with an FNV-1a integrity hash: surface that prominently in Settings and prompt
  after each season rollover.

## CI/CD

Adapt 3site's `.github/workflows/deploy-sites.yml`, simplified to one project.

```yaml
name: Deploy
on:
  push: { branches: [main] }
  pull_request:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run check          # svelte-check + eslint
      - run: node validate.js       # pitch's 1,190 checks — 0 failures required
      - run: npm run test           # vitest
      - run: npm run build
      - run: npx size-limit         # bundle budget — fails the build if exceeded
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist }

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci && npm run build
      - run: npx wrangler@4 deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

**Preview deployments per PR** — the mobile-design equivalent of a test suite,
since you need to open each change on a real phone:

```yaml
      - run: npx wrangler@4 versions upload
```

`versions upload` publishes a non-production version with its own preview URL,
without touching live traffic. Post that URL as a PR comment and open it on your
phone.

**Secrets required** (repo → Settings → Secrets → Actions):
- `CLOUDFLARE_API_TOKEN` — scoped to *Workers Scripts: Edit* (add *Zone: DNS Edit*
  only when attaching a custom domain)
- `CLOUDFLARE_ACCOUNT_ID`

Never commit either; 3site's `cf.mjs` `env()` helper is a good pattern to copy
(fail loudly on a missing variable rather than sending an unauthenticated request).

### Bundle budget

The thing that keeps "beautiful" from quietly becoming "slow". Add `size-limit`
to `package.json` and let CI enforce it:

```json
"size-limit": [
  { "path": "dist/assets/index-*.js",  "limit": "120 kB" },
  { "path": "dist/assets/index-*.css", "limit": "30 kB" }
]
```

League data is the elephant: nine leagues (~2,997 players today, ~3,900 after the
reconciliation in doc 06) are concatenated into the bundle by `build.py` and load
eagerly. Under Vite they should become **dynamic imports**, pulled when a league
is first needed — a career in League Two has no reason to ship La Liga. Measure
`data/*.js` before fixing the budget number; today's whole `index.html` is 898KB.

## Custom domain

1. Add the domain as a zone in Cloudflare (or transfer nameservers).
2. Workers & Pages → `pitch` → Settings → Domains & Routes → **Add custom domain**.
   Cloudflare provisions the DNS record and certificate itself.
3. Or scripted, following 3site's `scripts/provision-domain.mjs` pattern against
   `PUT /accounts/{id}/workers/scripts/{name}/domains`.

Until then `pitch.<subdomain>.workers.dev` is a perfectly good URL to test on.

## Future: the Worker script

Not needed for the game as specified — it's fully client-side. But adding `main`
to `wrangler.jsonc` later unlocks, roughly in order of value:

- **Cloud saves** — the exported `.pitch` blob in **D1** or **R2** behind a short share
  code, so a career survives a cleared browser or moves between phone and laptop.
  The integrity hash already gives you tamper detection; what's missing is a
  schema version, since `db.js` has no migration path past `DB_VERSION = 3`.
  Run `plan-gate` before touching any of it.
- **Shareable career links** — a read-only snapshot page of your table, squad and
  trophies, rendered by the Worker with OG tags for social previews.
- **Global leaderboards** — most trophies in ten seasons, etc. **KV** for reads,
  **D1** for anything queryable.
- **Cron Triggers** — a weekly job that regenerates league data from the CSVs and
  opens a PR when real-world transfers land, using the validating, diff-printing
  converter from doc 06.
- **Durable Objects** — the only sane path to head-to-head or shared-league
  multiplayer, if that ever becomes interesting.

None of this is in scope now. It's the reason to be on Workers rather than Pages.
