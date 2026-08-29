// Ported from howellsryan/pocketrpg's functions/_lib/auth.js. `payload.sub`
// is the `users.id` row minted at first sign-in (functions/api/auth/google/
// callback.js) — every ownership-scoped query binds against it.
import { verifyJWT } from './jwt.js';

export async function requireAuth(request, env) {
  // Without a secret, crypto.subtle.importKey ends up handed empty-length
  // HMAC key material, which some WebCrypto implementations reject outright
  // — an uncaught throw deep in jwt.js that would otherwise surface as an
  // opaque 500 instead of this clean "not configured" response (matches
  // functions/api/auth/google.js's guard on GOOGLE_CLIENT_ID).
  if (!env.JWT_SECRET) return { error: 'Server not configured', status: 500 };
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { error: 'Missing bearer token', status: 401 };
  const payload = await verifyJWT(match[1], env.JWT_SECRET);
  if (!payload || !payload.sub) return { error: 'Invalid or expired token', status: 401 };
  return { identity: { id: payload.sub, provider: payload.provider, displayName: payload.displayName } };
}

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(
    JSON.stringify(body),
    { status, headers: { 'Content-Type': 'application/json', ...extraHeaders } },
  );
}
