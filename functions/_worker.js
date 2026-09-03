// Worker entry point (wrangler.jsonc's `main`). ROADMAP.md item 7 is Pitch's
// first server-side request handling — until now wrangler.jsonc only served
// `./dist` as static assets, with no Worker script at all.
//
// PocketRPG's reference implementation is a Cloudflare *Pages* project,
// where a `functions/api/**` file tree is routed automatically. Pitch
// deploys as a plain Worker (`npx wrangler deploy`, no Pages project), so
// that auto-routing doesn't apply here — this file is a small manual router
// instead, kept in front of the same functions/api/** handler files (same
// onRequestGet/onRequestPut({request, env}) signatures) so the two stay easy
// to compare. Anything not matched below falls through to the static build
// via the `ASSETS` binding, preserving the assets-only behavior this Worker
// had before this change (including `not_found_handling: "404-page"`).
import { onRequestGet as googleStart } from './api/auth/google.js';
import { onRequestGet as googleCallback } from './api/auth/google/callback.js';
import { onRequestGet as authMe } from './api/auth/me.js';
import {
  onRequestDelete as saveDelete,
  onRequestGet as saveGet,
  onRequestPut as savePut,
} from './api/save.js';

const ROUTES = {
  'GET /api/auth/google': googleStart,
  'GET /api/auth/google/callback': googleCallback,
  'GET /api/auth/me': authMe,
  'GET /api/save': saveGet,
  'PUT /api/save': savePut,
  'DELETE /api/save': saveDelete,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const handler = ROUTES[`${request.method} ${url.pathname}`];
    if (handler) return handler({ request, env, ctx });

    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
