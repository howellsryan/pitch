// Cloud-save push/pull. P0 scopes every operation to the stable active
// career slot so syncing one career can never overwrite another one.
import { buildCloudSaveBlob, getActiveSlotId, restoreFromCloudBlob } from '../modules/db.js';
import { api, isSignedIn } from './api.js';

let pushing = false;

export async function pushSaveToCloud() {
  if (!isSignedIn()) return { ok:false, reason:'signed_out' };
  if (pushing) return { ok:false, reason:'busy' };
  pushing = true;
  try {
    const slotId = getActiveSlotId();
    const { blob, meta } = await buildCloudSaveBlob(slotId);
    const res = await api.putSave(slotId, blob, meta);
    return {
      ok:true,
      slotId,
      updatedAt:res?.updatedAt ?? null,
      saveRevision:res?.save_revision ?? null,
    };
  } catch (err) {
    return { ok:false, reason:err?.message || 'cloud_save_failed' };
  } finally {
    pushing = false;
  }
}

export function cloudSaveCheckpoint() {
  if (!isSignedIn()) return;
  void pushSaveToCloud();
}

export async function pullAndApplyCloudSave(slotId = getActiveSlotId()) {
  if (!isSignedIn()) return { applied:false, reason:'signed_out' };
  try {
    const res = await api.getSave(slotId);
    if (!res?.save?.save_blob) return { applied:false, reason:'no_cloud_save', slotId };
    const meta = await restoreFromCloudBlob(res.save.save_blob, slotId);
    return { applied:true, slotId, meta };
  } catch (err) {
    return { applied:false, reason:err?.message || 'cloud_pull_failed', slotId };
  }
}

export async function listCloudCareerSlots() {
  if (!isSignedIn()) return [];
  try {
    const res = await api.listSaves();
    return Array.isArray(res?.slots) ? res.slots : [];
  } catch {
    return [];
  }
}
