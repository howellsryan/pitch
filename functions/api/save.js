// GET/PUT /api/save — the one save row per account (ROADMAP.md item 7, v1:
// one save slot, last-write-wins). save_blob is opaque here — it's exactly
// the base64 envelope src/modules/db.js's buildSaveEnvelope() produces for
// the .pitch export, so the server never parses game data.
//
// Trimmed hard from howellsryan/pocketrpg's functions/api/save.js: no
// character resolution, no world-session/co-op locks, no item-loss or
// kill-count side channels, no total-level-regression guard — none of that
// applies to Pitch's single-save-per-account model. save_revision is stored
// and bumped on every write but NOT enforced as a write precondition; v1 is
// deliberately last-write-wins (see ROADMAP.md's 80/20 cut), and the column
// is carried only as a future conflict-resolution hook.
import { requireAuth, json } from '../_lib/auth.js';

// save_blob is gzip-compressed client-side before it ever reaches this route
// (src/modules/db.js's buildCloudSaveBlob() — a brand-new career already
// carries all 186 clubs' full rosters, ~2.3MB base64 uncompressed, so
// compression isn't optional here). Gzipped, a fresh save runs ~180KB; this
// limit is a generous ceiling for a long career's accumulated fixtures/
// transfers/honors, well under D1's 2,000,000-byte column cap.
const MAX_SAVE_BYTES = 1_800_000;

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status);

  const row = await env.DB.prepare(
    'SELECT save_blob, save_revision, updated_at FROM saves WHERE user_id = ?',
  ).bind(auth.identity.id).first();
  if (!row) return json({ save: null });

  return json({
    save: {
      save_blob: row.save_blob,
      save_revision: Number(row.save_revision) || 0,
      updatedAt: Number(row.updated_at) || 0,
    },
  });
}

export async function onRequestPut({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const save_blob = body?.save_blob;
  if (typeof save_blob !== 'string' || !save_blob) {
    return json({ error: 'Missing save_blob' }, 400);
  }
  if (save_blob.length > MAX_SAVE_BYTES) {
    return json({ error: 'Save too large' }, 413);
  }

  const now = Date.now();
  const existing = await env.DB.prepare(
    'SELECT save_revision FROM saves WHERE user_id = ?',
  ).bind(auth.identity.id).first();
  const nextRevision = (Number(existing?.save_revision) || 0) + 1;

  await env.DB.prepare(
    `INSERT INTO saves (user_id, save_blob, save_revision, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       save_blob = excluded.save_blob,
       save_revision = excluded.save_revision,
       updated_at = excluded.updated_at`,
  ).bind(auth.identity.id, save_blob, nextRevision, now).run();

  return json({ ok: true, updatedAt: now, save_revision: nextRevision });
}
