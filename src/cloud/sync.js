// Cloud-save push/pull (ROADMAP.md item 7, v1: one save slot, last-write-wins,
// no debounce/conflict machinery — see the roadmap's 80/20 cut). Reuses
// db.js's existing .pitch envelope format and import path rather than
// inventing a second save format or a second restore code path.
import { buildSaveEnvelope, importSaveFromCode } from '../modules/db.js';
import { api, isSignedIn } from './api.js';

let pushing = false;

// Push the current IndexedDB state to the cloud. Never throws — callers
// (auto-save checkpoints, the Settings "Save to Cloud" button) get a result
// object back instead. A no-op, not an error, when signed out.
export async function pushSaveToCloud() {
  if (!isSignedIn()) return { ok: false, reason: 'signed_out' };
  if (pushing) return { ok: false, reason: 'busy' };
  pushing = true;
  try {
    const { saveCode } = await buildSaveEnvelope();
    const res = await api.putSave(saveCode);
    return { ok: true, updatedAt: res?.updatedAt ?? null, saveRevision: res?.save_revision ?? null };
  } catch (err) {
    return { ok: false, reason: err?.message || 'cloud_save_failed' };
  } finally {
    pushing = false;
  }
}

// Best-effort auto-save checkpoint (MatchScreen.svelte: right before the
// pre-match beat commits, and right after a match result is written). Fire
// and forget — a failed cloud push must never slow down or block play; the
// player's progress is already safe in IndexedDB regardless.
export function cloudSaveCheckpoint() {
  if (!isSignedIn()) return;
  // pushSaveToCloud() already catches internally and always resolves (never
  // rejects) — no .catch needed here, just fire and forget.
  void pushSaveToCloud();
}

// Pull the cloud save and apply it to IndexedDB, replacing local state —
// same restore path Settings' "Import Save" already uses. Only called from
// boot (src/ui/renderers.js) when there is no local career yet, so this can
// never clobber an in-progress one; see ROADMAP.md's skip on multi-device
// conflict resolution for why that guard lives at the call site.
export async function pullAndApplyCloudSave() {
  if (!isSignedIn()) return { applied: false, reason: 'signed_out' };
  try {
    const res = await api.getSave();
    if (!res?.save?.save_blob) return { applied: false, reason: 'no_cloud_save' };
    const meta = await importSaveFromCode(res.save.save_blob);
    return { applied: true, meta };
  } catch (err) {
    return { applied: false, reason: err?.message || 'cloud_pull_failed' };
  }
}
