// GET/PUT/DELETE /api/save — opaque cloud save blobs scoped by stable career slot.
// The server never parses game state; it stores the same versioned envelope
// used by .pitch exports. Existing pre-P0 rows migrate to slot_id='legacy'.
// A small metadata JSON column mirrors the local career-summary contract so
// slot pickers can list careers without inspecting the blob.
import { requireAuth, json } from '../_lib/auth.js';

// D1 rows are bounded. Longer careers use internal rows in the existing saves
// table, published with the slot head in one atomic batch. Dots are excluded
// from public slot IDs, so these rows cannot collide with a user's career.
const MAX_SAVE_BYTES = 40_000_000;
const CHUNK_BYTES = 750_000;
const CHUNK_PREFIX = 'PITCH_CHUNKS_V1:';
const MAX_METADATA_BYTES = 8_000;
const SLOT_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;

function readSlotId(value) {
  const slotId = value || 'legacy';
  return SLOT_ID_RE.test(slotId) ? slotId : null;
}

function parseMetadata(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function encodeMetadata(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid metadata');
  const text = JSON.stringify(value);
  if (text.length > MAX_METADATA_BYTES) throw new Error('Metadata too large');
  return text;
}

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status);

  const url = new URL(request.url);
  if (url.searchParams.get('list') === '1') {
    const rows = await env.DB.prepare(
      "SELECT slot_id, metadata_json, save_revision, updated_at FROM saves WHERE user_id = ? AND instr(slot_id, '.') = 0 ORDER BY updated_at DESC",
    ).bind(auth.identity.id).all();
    return json({
      slots:(rows.results ?? []).map(row => ({
        slotId:row.slot_id,
        metadata:parseMetadata(row.metadata_json),
        save_revision:Number(row.save_revision) || 0,
        updatedAt:Number(row.updated_at) || 0,
      })),
    });
  }

  const slotId = readSlotId(url.searchParams.get('slotId'));
  if (!slotId) return json({ error:'Invalid slotId' }, 400);

  // Head and chunks come from one read snapshot, including during replacement.
  const prefix = `${slotId}.chunk.`;
  const rows = await env.DB.prepare(
    'SELECT slot_id, save_blob, metadata_json, save_revision, updated_at FROM saves WHERE user_id = ? AND (slot_id = ? OR substr(slot_id, 1, length(?)) = ?)',
  ).bind(auth.identity.id, slotId, prefix, prefix).all();
  const row = (rows.results ?? []).find(item => item.slot_id === slotId);
  if (!row) return json({ save:null, slotId });

  let blob = row.save_blob;
  if (blob.startsWith(CHUNK_PREFIX)) {
    const manifest = blob.slice(CHUNK_PREFIX.length).split(':').map(Number);
    const [count, length] = manifest;
    const chunks = new Map((rows.results ?? []).filter(item => item.slot_id !== slotId).map(item => [item.slot_id, item]));
    if (manifest.length !== 2 || !Number.isSafeInteger(count) || count < 2 || count > Math.ceil(MAX_SAVE_BYTES / CHUNK_BYTES)
      || !Number.isSafeInteger(length) || length <= CHUNK_BYTES || length > MAX_SAVE_BYTES
      || count !== Math.ceil(length / CHUNK_BYTES) || chunks.size !== count) {
      return json({ error:'Cloud backup is incomplete. Your local career is unchanged.' }, 503);
    }
    const parts = [];
    for (let index = 0; index < count; index++) {
      const chunk = chunks.get(`${prefix}${index}`);
      const expectedLength = Math.min(CHUNK_BYTES, length - index * CHUNK_BYTES);
      if (!chunk || chunk.save_revision !== row.save_revision || typeof chunk.save_blob !== 'string' || chunk.save_blob.length !== expectedLength) {
        return json({ error:'Cloud backup is incomplete. Your local career is unchanged.' }, 503);
      }
      parts.push(chunk.save_blob);
    }
    blob = parts.join('');
  }

  return json({
    slotId,
    save:{
      save_blob:blob,
      metadata:parseMetadata(row.metadata_json),
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
  // Envelopes are base64; ASCII also makes the row byte bound exact.
  if (/[^\x20-\x7E]/.test(save_blob)) return json({ error:'Invalid save_blob' }, 400);
  if (save_blob.length > MAX_SAVE_BYTES) return json({ error:'This career exceeds cloud backup capacity. Export a .pitch file in Settings to keep a backup.' }, 413);
  if (save_blob.startsWith(CHUNK_PREFIX)) return json({ error:'Invalid save_blob' }, 400);

  let metadataJson;
  try { metadataJson = encodeMetadata(body?.metadata); }
  catch (err) { return json({ error:err.message }, 400); }

  const now = Date.now();
  const existing = await env.DB.prepare(
    'SELECT save_revision FROM saves WHERE user_id = ? AND slot_id = ?',
  ).bind(auth.identity.id, slotId).first();
  const nextRevision = (Number(existing?.save_revision) || 0) + 1;

  const prefix = `${slotId}.chunk.`;
  const parts = save_blob.length > CHUNK_BYTES
    ? Array.from({ length:Math.ceil(save_blob.length / CHUNK_BYTES) }, (_, index) => save_blob.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES))
    : [];
  const headBlob = parts.length ? `${CHUNK_PREFIX}${parts.length}:${save_blob.length}` : save_blob;
  const insert = (id, blob, metadata) => env.DB.prepare(
    `INSERT INTO saves (user_id, slot_id, save_blob, metadata_json, save_revision, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, slot_id) DO UPDATE SET
       save_blob = excluded.save_blob,
       metadata_json = excluded.metadata_json,
       save_revision = excluded.save_revision,
       updated_at = excluded.updated_at`,
  ).bind(auth.identity.id, id, blob, metadata, nextRevision, now);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM saves WHERE user_id = ? AND substr(slot_id, 1, length(?)) = ?').bind(auth.identity.id, prefix, prefix),
    insert(slotId, headBlob, metadataJson),
    ...parts.map((part, index) => insert(`${prefix}${index}`, part, null)),
  ]);

  return json({ ok:true, slotId, updatedAt:now, save_revision:nextRevision, metadata:body?.metadata ?? null });
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return json({ error:auth.error }, auth.status);

  const url = new URL(request.url);
  const slotId = readSlotId(url.searchParams.get('slotId'));
  if (!slotId) return json({ error:'Invalid slotId' }, 400);

  const prefix = `${slotId}.chunk.`;
  const result = await env.DB.prepare(
    'DELETE FROM saves WHERE user_id = ? AND (slot_id = ? OR substr(slot_id, 1, length(?)) = ?)',
  ).bind(auth.identity.id, slotId, prefix, prefix).run();

  return json({ ok:true, slotId, deleted:Number(result?.meta?.changes) > 0 });
}
