// GET /api/auth/me — who the bearer token belongs to. Lets the client learn
// it's signed in (and show the account name) without touching /api/save.
import { requireAuth, json } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status);

  const row = await env.DB.prepare(
    'SELECT email, display_name FROM oauth_identities WHERE user_id = ? AND provider = ?',
  ).bind(auth.identity.id, auth.identity.provider).first();

  return json({
    identity: {
      id: auth.identity.id,
      displayName: row?.display_name ?? auth.identity.displayName ?? null,
      email: row?.email ?? null,
    },
  });
}
