// GET/PUT /api/save — opaque cloud save blobs scoped by stable career slot.
// The server never parses game state; it stores the same versioned envelope
// used by .pitch exports. Existing pre-P0 rows migrate to slot_id='legacy'.
import { requireAuth, json } from '../_lib/auth.js';

const MAX_SAVE_BYTES = 1_800_000;
const SLOT_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;

function readSlotId(value) {
  const slotId = value || 'legacy';
  return SLOT_ID_RE.test(slotId) ? slotId : null;
}

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status);

  const url = new URL(request.url);
  if (url.searchParams.get('list') === '1') {
    const rows = await env.DB.prepare(
      'SELECT slot_id, save_revision, updated_at FROM saves WHERE user_id = ? ORDER BY updated_at DESC',
    ).bind(auth.identity.id).all();
    return json({
      slots:(rows.results ?? []).map(row => ({
        slotId:row.slot_id,
        save_revision:Number(row.save_revision) || 0,
        updatedAt:Number(row.updated_at) || 0,
      })),
    });
  }

  const slotId = readSlotId(url.searchParams.get('slotId'));
  if (!slotId) return json({ error:'Invalid slotId' }, 400);

  const row = await env.DB.prepare(
    'SELECT save_blob, save_revision, updated_at FROM saves WHERE user_id = ? AND slot_id = ?',
  ).bind(auth.identity.id, slotId).first();
  if (!row) return json({ save:null, slotId });

  return json({
    slotId,
    save:{
      save_blob:row.save_blob,
      save_revision:Number(row.save_revision) || 0,
      updatedAt:Number(row.updated_at) || 0,
    },
  });
}

export async function onRequestPut({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status);

  let body;
  try { body = await request.json(); }
  catch { return json({ error:'Invalid JSON' }, 400); }

  const slotId = readSlotId(body?.slot_id ?? body?.slotId);
  if (!slotId) return json({ error:'Invalid slotId' }, 400);

  const save_blob = body?.save_blob;
  if (typeof save_blob !== 'string' || !save_blob) return json({ error:'Missing save_blob' }, 400);
  if (save_blob.length > MAX_SAVE_BYTES) return json({ error:'Save too large' }, 413);

  const now = Date.now();
  const existing = await env.DB.prepare(
    'SELECT save_revision FROM saves WHERE user_id = ? AND slot_id = ?',
  ).bind(auth.identity.id, slotId).first();
  const nextRevision = (Number(existing?.save_revision) || 0) + 1;

  await env.DB.prepare(
    `INSERT INTO saves (user_id, slot_id, save_blob, save_revision, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, slot_id) DO UPDATE SET
       save_blob = excluded.save_blob,
       save_revision = excluded.save_revision,
       updated_at = excluded.updated_at`,
  ).bind(auth.identity.id, slotId, save_blob, nextRevision, now).run();

  return json({ ok:true, slotId, updatedAt:now, save_revision:nextRevision });
}
